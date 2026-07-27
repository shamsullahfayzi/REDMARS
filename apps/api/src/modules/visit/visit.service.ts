import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CancelVisitRequest,
  CancelVisitResponse,
  ChangeVisitStatusRequest,
  ConsultContext,
  CreateVisitRequest,
  UpdateComplaintRequest,
  QueueEntry,
  QueueQuery,
  QueueResponse,
  VisitHistoryResponse,
  VisitOptionsResponse,
  VisitSummary,
} from '@redmars/shared';
import {
  OPEN_VISIT_STATUSES,
  VISIT_STATUS_TRANSITIONS,
  allowedStatusChanges,
  currentAgeYears,
  isVisitOpen,
} from '@redmars/shared';
import { PrismaService, type AuditedTx } from '../../prisma/prisma.service';
import { allergySelect, compareAllergies, toAllergy } from '../allergy/allergy.service';
import { NumberSequenceService } from '../../services/number-sequence.service';
import {
  facilityDateString,
  facilityDayBounds,
  facilityDayBoundsFor,
} from '../../common/facility-time';

/** Exactly what `VisitSummary` promises, plus the joins its denormalised names come from. */
const visitSummarySelect = {
  id: true,
  visitNo: true,
  type: true,
  status: true,
  patientId: true,
  departmentId: true,
  practitionerId: true,
  chiefComplaint: true,
  referredBy: true,
  referralSource: true,
  startedAt: true,
  patient: { select: { mrn: true, prefix: true, firstName: true, lastName: true } },
  department: { select: { name: true } },
  practitioner: { select: { firstName: true, lastName: true } },
} as const;

type VisitRow = {
  id: string;
  visitNo: string;
  type: VisitSummary['type'];
  status: VisitSummary['status'];
  patientId: string;
  departmentId: string;
  practitionerId: string | null;
  chiefComplaint: string | null;
  referredBy: string | null;
  referralSource: string | null;
  startedAt: Date;
  patient: { mrn: string; prefix: string | null; firstName: string; lastName: string | null };
  department: { name: string };
  practitioner: { firstName: string; lastName: string } | null;
};

/**
 * What the queue needs beyond a visit summary (task 3.7): enough of the patient to say
 * who is waiting, and enough of their age to compute it honestly rather than show a
 * number recorded years ago.
 */
const queueExtraSelect = {
  patient: {
    select: {
      mrn: true,
      prefix: true,
      firstName: true,
      lastName: true,
      gender: true,
      dateOfBirth: true,
      estimatedAgeYears: true,
      estimatedAgeMonths: true,
      ageRecordedAt: true,
    },
  },
} as const;

type QueueRow = VisitRow & {
  patient: VisitRow['patient'] & {
    gender: string;
    dateOfBirth: Date | null;
    estimatedAgeYears: number | null;
    estimatedAgeMonths: number | null;
    ageRecordedAt: Date | null;
  };
};

function fullName(parts: Array<string | null | undefined>): string {
  return parts.filter((part) => part != null && part.trim().length > 0).join(' ');
}

@Injectable()
export class VisitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: NumberSequenceService,
  ) {}

  /**
   * Start a visit. Everything the desk sends is checked against THIS facility before a
   * number is issued, because a visit number is gapless — burning one on a request that
   * was going to fail anyway leaves a hole no one can explain later.
   *
   * `tx` lets the visit join a caller's transaction (task 3.6). The validating reads go
   * through it too, so a patient created earlier in the same transaction is visible here
   * — outside it, that patient does not exist yet and the check would 404 on a row it
   * had just written.
   */
  async create(
    facilityId: string,
    userId: string,
    input: CreateVisitRequest,
    tx: AuditedTx = this.prisma.db,
  ): Promise<VisitSummary> {
    const patient = await tx.patient.findFirst({
      where: { id: input.patientId, facilityId },
      select: { id: true },
    });
    // 404, not 403: whether a patient exists in another facility is not something this
    // one gets to learn — the same rule the patient reads follow (task 3.4).
    if (!patient) throw new NotFoundException('Patient not found');

    const department = await tx.department.findFirst({
      where: { id: input.departmentId, facilityId },
      select: { id: true, isActive: true },
    });
    if (!department) throw new BadRequestException('Unknown department');
    // A deactivated department is history, not a destination. Visits already filed
    // against it stay valid; new ones do not get to join them.
    if (!department.isActive) throw new BadRequestException('Department is not active');

    if (input.practitionerId) {
      const practitioner = await tx.practitioner.findFirst({
        where: { id: input.practitionerId, facilityId },
        select: {
          isActive: true,
          departments: {
            where: { departmentId: input.departmentId },
            select: { departmentId: true },
          },
        },
      });
      if (!practitioner) throw new BadRequestException('Unknown practitioner');
      if (!practitioner.isActive) throw new BadRequestException('Practitioner is not active');
      // PractitionerDepartment exists because one doctor works OPD and IPD both. Without
      // this check the desk can file a psychiatrist under the laboratory department: the
      // row stores fine, and the doctor's queue — which reads (facility, department,
      // status, startedAt) — never shows it. The patient waits for nobody.
      if (practitioner.departments.length === 0) {
        throw new BadRequestException('Practitioner does not work in that department');
      }
    }

    // The same shape as the duplicate-patient guard (task 3.3): refuse, explain, and let
    // the desk override. A receptionist double-clicking Save otherwise files two queue
    // rows for one arrival — and at task 3.6, two invoices.
    if (!input.acknowledgeOpenVisit) {
      const open = await this.findOpenVisits(facilityId, input.patientId, input.departmentId, tx);
      if (open.length > 0) {
        throw new ConflictException({
          code: 'open_visit',
          message: 'This patient already has an open visit in that department',
          visits: open,
        });
      }
    }

    const visitNo = await this.sequence.next(facilityId, 'visit_no', undefined, tx);

    const created = await tx.visit.create({
      data: {
        facilityId,
        createdBy: userId,
        visitNo: visitNo.formatted,
        patientId: input.patientId,
        departmentId: input.departmentId,
        practitionerId: input.practitionerId ?? null,
        type: input.type,
        // Not sent by the client and not defaulted silently: the patient is standing at
        // the desk, so `arrived` is a fact the server states. Task 3.9 owns every move
        // after this one.
        status: 'arrived',
        chiefComplaint: input.chiefComplaint ?? null,
        referredBy: input.referredBy ?? null,
        referralSource: input.referralSource ?? null,
        // The medico-legal trail starts at the first status, not the second. Writing it
        // here means every status a visit ever held has a named author; leaving it to
        // task 3.9 would make `arrived` the one nobody signed.
        statusHistory: { create: { status: 'arrived', changedBy: userId } },
      },
      select: visitSummarySelect,
    });

    return this.toSummary(created);
  }

  async findById(facilityId: string, id: string): Promise<VisitSummary> {
    const visit = await this.prisma.db.visit.findFirst({
      where: { id, facilityId },
      select: visitSummarySelect,
    });
    if (!visit) throw new NotFoundException('Visit not found');
    return this.toSummary(visit);
  }

  /**
   * Task 4.1 — everything the top of the consulting-room screen needs, in one read.
   *
   * Deliberately NOT `visit.read_queue` plus a second call for the patient. A doctor
   * opens this between two patients and the header has to be right before anything else
   * renders; two round trips means a screen that briefly shows a visit with no patient
   * attached to it, which on a consult screen is the wrong kind of brief.
   *
   * It carries nothing clinical. That is not an oversight — vitals, diagnoses,
   * prescriptions and notes each arrive with their own task and their own permission, and
   * a context endpoint that quietly returned all of them would hand a nurse the psych
   * note that `clinical_note.read` denies even to the admin.
   *
   * R6 and R8 are refused here rather than in the guard, the same split the guard's own
   * docblock describes: it holds `patient.read_clinical` and cannot tell WHICH read this
   * is. R6 is written as "drugs and allergies — nothing else", and R8 scopes the lab tech
   * to the order in front of them. This screen is the patient's wider record, so neither
   * condition covers it, and a conditional grant that nobody narrows is an unconditional
   * one wearing a rule code.
   */
  async consult(
    facilityId: string,
    permissions: ReadonlyMap<string, string | null>,
    id: string,
  ): Promise<ConsultContext> {
    const condition = permissions.get('patient.read_clinical');
    if (condition === 'R6' || condition === 'R8') {
      throw new ForbiddenException({
        message: 'Your role may not open a consultation record.',
        code: 'clinical_read_scoped',
      });
    }

    const visit = await this.prisma.db.visit.findFirst({
      where: { id, facilityId },
      select: {
        ...visitSummarySelect,
        ...queueExtraSelect,
        patient: { select: { ...queueExtraSelect.patient.select, phone: true } },
        // Two rows at most, and only the two the wait is measured between. Reading the
        // whole trail here would duplicate the history endpoint for a number the header
        // shows in one line.
        statusHistory: {
          where: { status: { in: ['arrived', 'in_progress'] } },
          select: { status: true, changedAt: true },
          orderBy: { changedAt: 'asc' },
        },
      },
    });
    if (!visit) throw new NotFoundException('Visit not found');

    const entry = this.toQueueEntry(visit, Date.now());
    const arrivedAt = visit.statusHistory.find((row) => row.status === 'arrived')?.changedAt;
    const calledAt = visit.statusHistory.find((row) => row.status === 'in_progress')?.changedAt;

    // Task 4.6 — ACTIVE allergies, in the same request as the header so the banner paints
    // with it. Fetching them separately would mean waiting for this response to learn the
    // patient id and only then asking, leaving a named patient on screen with no warning
    // for a beat — on the screen whose whole job is to stop a wrong prescription.
    const allergyRows = await this.prisma.db.allergy.findMany({
      where: { patientId: visit.patientId, isActive: true },
      select: allergySelect,
    });
    const noters = [
      ...new Set(allergyRows.map((row) => row.notedBy).filter((id): id is string => !!id)),
    ];
    const noterNames = new Map(
      (
        await this.prisma.db.appUser.findMany({
          where: { id: { in: noters } },
          select: { id: true, fullName: true },
        })
      ).map((user) => [user.id, user.fullName]),
    );

    return {
      visit: this.toSummary(visit),
      patient: {
        id: visit.patientId,
        mrn: entry.patientMrn,
        name: entry.patientName,
        gender: visit.patient.gender,
        ageYears: entry.ageYears,
        dateOfBirth: visit.patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
        phone: visit.patient.phone,
      },
      // Once the patient has been called in the wait is a settled fact; while they are
      // still outside it keeps climbing, which is the number the doctor is apologising
      // for. Null only if the trail somehow has no arrival — an old row, not a new one.
      waitedMinutes: arrivedAt
        ? Math.max(
            0,
            Math.round(((calledAt ?? new Date()).getTime() - arrivedAt.getTime()) / 60_000),
          )
        : null,
      // Worst first, by the same comparator the allergy screen uses — a banner ordered
      // differently from the list behind it is a banner people learn to distrust.
      allergies: allergyRows
        .sort(compareAllergies)
        .map((row) => toAllergy(row, row.notedBy ? (noterNames.get(row.notedBy) ?? null) : null)),
    };
  }

  /**
   * Task 4.4 — the doctor writes what the patient actually came in with.
   *
   * A REPLACE, not an append, and that is the right shape: the desk's version is what the
   * patient managed to say at a busy window, and the doctor's is what it turned out to be.
   * The old text is not lost — the audit extension records the before and after of every
   * update, so "the desk wrote X and the doctor changed it to Y" stays answerable without
   * a second column that nobody would read.
   */
  async updateComplaint(
    facilityId: string,
    userId: string,
    id: string,
    input: UpdateComplaintRequest,
  ): Promise<VisitSummary> {
    const visit = await this.prisma.db.visit.findFirst({
      where: { id, facilityId },
      select: { id: true, status: true },
    });
    if (!visit) throw new NotFoundException('Visit not found');

    // Same rule as vitals: documentation belongs to the encounter it describes. A closed
    // visit is a record of what happened, and `completed` leads nowhere in the transition
    // map, so it cannot be reopened to allow one either.
    if (!isVisitOpen(visit.status)) {
      throw new BadRequestException({
        message: 'This visit is closed. The complaint can only be written during the visit.',
        code: 'visit_closed',
      });
    }

    // Task 6b.4 — writing the doctor's own version of the complaint IS the first clinical
    // act of the consultation. An `arrived` visit moves to `in_progress` in the same write
    // rather than waiting for a separate click on Start, folded into one statement so it is
    // one audit row, not two.
    const startingNow = visit.status === 'arrived';

    const updated = await this.prisma.db.visit.update({
      where: { id },
      data: {
        chiefComplaint: input.chiefComplaint,
        ...(startingNow
          ? {
              status: 'in_progress',
              statusHistory: { create: { status: 'in_progress', changedBy: userId } },
            }
          : {}),
      },
      select: visitSummarySelect,
    });
    return this.toSummary(updated);
  }

  /**
   * Task 3.9 — move a visit through care, and leave a record of who moved it.
   *
   * Every move appends to VisitStatusHistory. The opening `arrived` row was written at
   * creation (task 3.5), so the trail is complete from the first status rather than the
   * second — a visit whose earliest state nobody signed is exactly the gap this table
   * exists to close.
   */
  async changeStatus(
    facilityId: string,
    userId: string,
    id: string,
    input: ChangeVisitStatusRequest,
  ): Promise<VisitSummary> {
    const current = await this.prisma.db.visit.findFirst({
      where: { id, facilityId },
      select: { id: true, status: true },
    });
    if (!current) throw new NotFoundException('Visit not found');

    // A double-click is not a clinical event. Returning the state the caller asked for
    // rather than appending "in_progress -> in_progress" keeps the trail readable, and a
    // medico-legal record is only useful if a human can read it.
    if (current.status === input.status) {
      return this.findById(facilityId, id);
    }

    const allowed = VISIT_STATUS_TRANSITIONS[current.status];
    if (!allowed.includes(input.status)) {
      throw new BadRequestException({
        message: `A ${current.status} visit cannot become ${input.status}.`,
        code: 'illegal_transition',
        from: current.status,
        allowed: allowedStatusChanges(current.status),
      });
    }

    try {
      const updated = await this.prisma.db.visit.update({
        // `status` in the WHERE is optimistic concurrency, not decoration: the doctor
        // and the nurse can both have this visit on screen, and whoever clicks second
        // must be told the state moved rather than silently overwrite the first move.
        // A single update() — never updateMany(), which the audit extension deliberately
        // does not cover, and an unaudited status change is the one kind this table
        // exists to prevent.
        where: { id, facilityId, status: current.status },
        data: {
          status: input.status,
          // The visit is over. Closing the clock here rather than leaving it to a report
          // means the duration is a fact recorded at the time, not one inferred later.
          ...(input.status === 'completed' ? { endedAt: new Date() } : {}),
          statusHistory: {
            create: { status: input.status, changedBy: userId, note: input.note ?? null },
          },
        },
        select: visitSummarySelect,
      });
      return this.toSummary(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        // P2025: the WHERE matched nothing, which here can only mean the status moved
        // under us between the read and the write.
        error.code === 'P2025'
      ) {
        throw new ConflictException({
          message: 'Someone else moved this visit first.',
          code: 'status_changed',
        });
      }
      throw error;
    }
  }

  /**
   * Task 6b.4 — an `arrived` visit becomes `in_progress` the moment anything clinical is
   * actually written against it: a vital sign, a diagnosis, a prescription, a note, a lab
   * order. Called by those services as the last step before their own write commits, so a
   * rejected save (an allergy conflict, an unknown code) never starts a consultation that
   * did not happen.
   *
   * A NO-OP, not an error, once the visit has already moved — the Start button was
   * pressed, or another tab's save got here first. The WHERE carries the race: whoever's
   * update matches `status: 'arrived'` wins, and P2025 from the loser is exactly the
   * "someone already called this patient in" case, which needs no one told.
   */
  async autoStart(
    facilityId: string,
    userId: string,
    visitId: string,
    tx: AuditedTx = this.prisma.db,
  ): Promise<void> {
    try {
      await tx.visit.update({
        where: { id: visitId, facilityId, status: 'arrived' },
        data: {
          status: 'in_progress',
          statusHistory: { create: { status: 'in_progress', changedBy: userId } },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return;
      throw error;
    }
  }

  /**
   * Task 3.11 — cancel a visit and give the money back, as one act.
   *
   * Rule R5, enforced in three parts because it is written in three parts:
   *
   *  1. SAME-DAY. A receptionist may only cancel a visit that started today, in the
   *     facility's own zone. Outside that, admin only — which is what an unconditional
   *     grant means in the matrix.
   *  2. BEFORE THE NEXT STEP. The next step after arriving is being seen, so a
   *     receptionist may not cancel a visit the doctor has already called in. An admin
   *     may, because abandoning a started consultation is a real event — a patient who
   *     collapses and is sent elsewhere. Nobody may cancel a COMPLETED visit at all.
   *  3. A REASON, always. Required by the contract, so it cannot be forgotten here.
   *
   * The refund is not an edit. The original payment is marked reversed AND a negative
   * payment is appended, because the schema says append-only and reverse, never delete:
   * the till's history has to show money going out as its own event, with its own time
   * and its own author. Summing every row still gives the true balance.
   */
  async cancel(
    facilityId: string,
    userId: string,
    permissions: ReadonlyMap<string, string | null>,
    id: string,
    input: CancelVisitRequest,
  ): Promise<CancelVisitResponse> {
    const visit = await this.prisma.db.visit.findFirst({
      where: { id, facilityId },
      select: { id: true, status: true, startedAt: true },
    });
    if (!visit) throw new NotFoundException('Visit not found');

    if (visit.status === 'cancelled') {
      throw new BadRequestException('That visit is already cancelled.');
    }
    if (!VISIT_STATUS_TRANSITIONS[visit.status].includes('cancelled')) {
      throw new BadRequestException({
        message: `A ${visit.status} visit cannot be cancelled.`,
        code: 'illegal_transition',
        from: visit.status,
      });
    }

    // An unconditional grant is the admin's; 'R5' is everyone else's, and it is the
    // conditions the guard said it could not check that get checked here.
    const timeBoxed = permissions.get('visit.cancel') === 'R5';
    if (timeBoxed) {
      const { start, end } = facilityDayBounds();
      const startedToday =
        visit.startedAt.getTime() >= start.getTime() && visit.startedAt.getTime() < end.getTime();
      if (!startedToday) {
        throw new ForbiddenException({
          message: 'Only today’s visits can be cancelled here. Ask an administrator.',
          code: 'outside_r5_window',
        });
      }
      if (visit.status !== 'arrived' && visit.status !== 'planned') {
        throw new ForbiddenException({
          message: 'The doctor has already started this visit. Ask an administrator.',
          code: 'next_step_occurred',
        });
      }
    }

    // Everything the invoice needs, read before the transaction so the money question is
    // settled before anything is written.
    const invoices = await this.prisma.db.invoice.findMany({
      where: { visitId: id, status: { not: 'cancelled' } },
      select: {
        id: true,
        invoiceNo: true,
        currency: true,
        payments: {
          where: { isReversed: false },
          select: { id: true, amount: true, method: true },
        },
      },
    });

    const refundable = invoices.flatMap((invoice) => invoice.payments);
    const total = refundable.reduce(
      (sum, payment) => sum.add(payment.amount),
      new Prisma.Decimal(0),
    );

    // Money only leaves the till if the caller may make it leave. Checked here rather
    // than on the route, because a visit that was never paid for needs no such grant.
    if (total.greaterThan(0) && !permissions.has('payment.refund')) {
      throw new ForbiddenException('Missing permission: payment.refund');
    }

    return this.prisma.db.$transaction(async (tx) => {
      const updated = await tx.visit.update({
        // The status in the WHERE is the same optimistic concurrency task 3.9 uses: a
        // colleague may have moved this visit since it was read.
        where: { id, facilityId, status: visit.status },
        data: {
          status: 'cancelled',
          endedAt: new Date(),
          // The reason lives on the history row, which is where "logs why" belongs — it
          // is signed and timestamped, and it cannot be overwritten by the next move.
          statusHistory: {
            create: { status: 'cancelled', changedBy: userId, note: input.reason },
          },
        },
        select: visitSummarySelect,
      });

      let refund: CancelVisitResponse['refund'] = null;
      for (const invoice of invoices) {
        for (const payment of invoice.payments) {
          // Marked, not deleted: the original still says money came in, which it did.
          await tx.payment.update({ where: { id: payment.id }, data: { isReversed: true } });
          // And the money going back out is its own row, with its own author and time.
          await tx.payment.create({
            data: {
              invoiceId: invoice.id,
              amount: payment.amount.negated(),
              method: payment.method,
              receivedBy: userId,
              reference: input.reason.slice(0, 60),
            },
          });
        }

        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: 'cancelled', paidAmount: 0 },
        });

        if (invoice.payments.length > 0 && refund === null) {
          refund = {
            invoiceId: invoice.id,
            invoiceNo: invoice.invoiceNo,
            // Positive: this is what the receptionist counts out of the drawer, not a
            // signed ledger entry.
            refunded: total.toFixed(2),
            currency: invoice.currency,
          };
        }
      }

      return { visit: this.toSummary(updated), refund };
    });
  }

  /**
   * The trail, and the two durations it exists to make answerable: how long the patient
   * waited, and how long they were actually seen for.
   */
  async history(facilityId: string, id: string): Promise<VisitHistoryResponse> {
    const visit = await this.prisma.db.visit.findFirst({
      where: { id, facilityId },
      select: {
        id: true,
        visitNo: true,
        statusHistory: {
          select: {
            id: true,
            status: true,
            changedAt: true,
            changedBy: true,
            note: true,
            // The name, so the record reads as a person rather than a uuid. Follows the
            // FK, so a deleted account still leaves the row it signed.
            visit: false,
          },
          orderBy: { changedAt: 'asc' },
        },
      },
    });
    if (!visit) throw new NotFoundException('Visit not found');

    const actorIds = [
      ...new Set(visit.statusHistory.map((row) => row.changedBy).filter((v): v is string => !!v)),
    ];
    const actors = await this.prisma.db.appUser.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, fullName: true },
    });
    const names = new Map(actors.map((actor) => [actor.id, actor.fullName]));

    const at = (status: string): Date | null =>
      visit.statusHistory.find((row) => row.status === status)?.changedAt ?? null;

    const arrivedAt = at('arrived');
    const calledAt = at('in_progress');
    const endedAt = at('completed');
    const minutesBetween = (from: Date | null, to: Date | null): number | null =>
      from && to ? Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000)) : null;

    return {
      visitId: visit.id,
      visitNo: visit.visitNo,
      entries: visit.statusHistory.map((row) => ({
        id: row.id,
        status: row.status,
        changedAt: row.changedAt.toISOString(),
        changedBy: row.changedBy,
        changedByName: row.changedBy ? (names.get(row.changedBy) ?? null) : null,
        note: row.note,
      })),
      // "The gap between the two is how you measure waiting time" — the schema's own
      // comment on VisitStatus, finally computed.
      waitedMinutes: minutesBetween(arrivedAt, calledAt),
      consultationMinutes: minutesBetween(calledAt, endedAt),
    };
  }

  /**
   * Task 3.7 — who is waiting.
   *
   * The done-when is "a doctor sees today's arrived patients", and the word doing the
   * work is TODAY'S. Today is a fact about Kabul, not about the server: at UTC+04:30 a
   * patient registered at 02:00 local is still the previous UTC day, and a naive
   * boundary would drop them off the queue on the night shift — when nobody is watching
   * a screen closely enough to catch it.
   *
   * Scope defaults by who is asking. A doctor with a linked practitioner record gets
   * their own list, because that is the question a doctor has; anyone else gets the
   * whole facility and narrows it by hand. The default is a convenience, not a control:
   * a doctor may still pass another practitionerId and see that queue, exactly as
   * `visit.read_queue` allows — knowing who is waiting for a colleague is how a clinic
   * covers for someone running late.
   */
  async queue(facilityId: string, userId: string, query: QueueQuery): Promise<QueueResponse> {
    const { start, end } = query.date ? facilityDayBoundsFor(query.date) : facilityDayBounds();

    // "Whose queue is this?" — the caller's own, unless they said otherwise.
    let practitionerId = query.practitionerId ?? null;
    let mine = false;
    if (!practitionerId) {
      const self = await this.prisma.db.practitioner.findFirst({
        where: { facilityId, userId },
        select: { id: true },
      });
      if (self) {
        practitionerId = self.id;
        mine = true;
      }
    }

    const dayWhere = {
      facilityId,
      startedAt: { gte: start, lt: end },
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(practitionerId ? { practitionerId } : {}),
    };

    const statusWhere = query.status
      ? { status: query.status }
      : query.includeClosed
        ? {}
        : // The people still in the building. A completed visit is not a queue entry —
          // it is history, and history belongs on the record, not on the screen the
          // doctor is deciding from.
          { status: { in: [...OPEN_VISIT_STATUSES] } };

    const [rows, grouped] = await Promise.all([
      this.prisma.db.visit.findMany({
        where: { ...dayWhere, ...statusWhere },
        select: { ...visitSummarySelect, ...queueExtraSelect },
        // Longest wait first. A queue that is not ordered by arrival is not a queue,
        // it is a list, and someone quietly waits all morning.
        orderBy: { startedAt: 'asc' },
      }),
      // The header counts cover the whole day regardless of the status filter — the
      // point of them is to say what the filter is hiding.
      this.prisma.db.visit.groupBy({
        by: ['status'],
        where: dayWhere,
        _count: { _all: true },
      }),
    ]);

    const counts = { arrived: 0, in_progress: 0, on_hold: 0, completed: 0 };
    for (const group of grouped) {
      if (group.status in counts) {
        counts[group.status as keyof typeof counts] = group._count._all;
      }
    }

    const now = Date.now();
    return {
      entries: rows.map((row) => this.toQueueEntry(row, now)),
      date: query.date ?? facilityDateString(),
      counts,
      scope: { departmentId: query.departmentId ?? null, practitionerId, mine },
    };
  }

  private toQueueEntry(row: QueueRow, now: number): QueueEntry {
    const summary = this.toSummary(row);
    return {
      id: summary.id,
      visitNo: summary.visitNo,
      type: summary.type,
      status: summary.status,
      patientId: summary.patientId,
      patientName: summary.patientName,
      patientMrn: summary.patientMrn,
      gender: row.patient.gender,
      // Computed from the stored estimate and its anchor, never read raw — a patient
      // registered at thirty is thirty-three three years later (task 3.1).
      ageYears: currentAgeYears({
        dateOfBirth: row.patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
        estimatedAgeYears: row.patient.estimatedAgeYears,
        estimatedAgeMonths: row.patient.estimatedAgeMonths,
        ageRecordedAt: row.patient.ageRecordedAt?.toISOString() ?? null,
      }),
      departmentId: summary.departmentId,
      departmentName: summary.departmentName,
      practitionerId: summary.practitionerId,
      practitionerName: summary.practitionerName,
      chiefComplaint: summary.chiefComplaint,
      startedAt: summary.startedAt,
      waitedMinutes: Math.max(0, Math.floor((now - row.startedAt.getTime()) / 60_000)),
    };
  }

  /**
   * The pickers the reception screen needs, narrowed to what the desk chooses between:
   * active rows only, no licence numbers, no linked user accounts. Deliberately not the
   * admin lists — those are gated on `*.manage` and carry more than this screen needs.
   *
   * Services joined the payload at task 3.6. The check-in screen picks a department, a
   * doctor and a set of charges in one pass, and three round trips on the one screen
   * that has a queue in front of it is three chances to be slow.
   */
  async options(facilityId: string): Promise<VisitOptionsResponse> {
    const [departments, practitioners, services] = await Promise.all([
      this.prisma.db.department.findMany({
        where: { facilityId, isActive: true },
        select: { id: true, code: true, name: true, nameLocalPrs: true, nameLocalPs: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.db.practitioner.findMany({
        where: { facilityId, isActive: true, deletedAt: null },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          speciality: { select: { name: true } },
          departments: { select: { departmentId: true } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.db.service.findMany({
        where: { facilityId, isActive: true },
        select: { id: true, departmentId: true, code: true, name: true, fee: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      departments,
      // Fee as a fixed-2 STRING, never a number: Decimal(12,2) is exact and a float is
      // not. It is shown to the desk and never sent back — the server prices the
      // invoice from this same catalog (task 3.6).
      services: services.map((service) => ({ ...service, fee: service.fee.toFixed(2) })),
      practitioners: practitioners.map((practitioner) => ({
        id: practitioner.id,
        name: fullName([practitioner.firstName, practitioner.lastName]),
        specialityName: practitioner.speciality?.name ?? null,
        departmentIds: practitioner.departments.map((link) => link.departmentId),
      })),
    };
  }

  private async findOpenVisits(
    facilityId: string,
    patientId: string,
    departmentId: string,
    tx: AuditedTx = this.prisma.db,
  ): Promise<VisitSummary[]> {
    const rows = await tx.visit.findMany({
      where: {
        facilityId,
        patientId,
        // Scoped to the department on purpose. A patient sent from OPD to the lab has
        // two genuinely different visits open at once; the same patient registered twice
        // for the same department does not.
        departmentId,
        status: { in: [...OPEN_VISIT_STATUSES] },
      },
      select: visitSummarySelect,
      orderBy: { startedAt: 'desc' },
    });
    return rows.map((row) => this.toSummary(row));
  }

  private toSummary(row: VisitRow): VisitSummary {
    return {
      id: row.id,
      visitNo: row.visitNo,
      type: row.type,
      status: row.status,
      patientId: row.patientId,
      patientName: fullName([row.patient.prefix, row.patient.firstName, row.patient.lastName]),
      patientMrn: row.patient.mrn,
      departmentId: row.departmentId,
      departmentName: row.department.name,
      practitionerId: row.practitionerId,
      practitionerName: row.practitioner
        ? fullName([row.practitioner.firstName, row.practitioner.lastName])
        : null,
      chiefComplaint: row.chiefComplaint,
      referredBy: row.referredBy,
      referralSource: row.referralSource,
      startedAt: row.startedAt.toISOString(),
    };
  }
}
