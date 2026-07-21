import { Injectable } from '@nestjs/common';
import type { CreatePatientRequest, PatientSummary } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberSequenceService } from '../../services/number-sequence.service';

/** Exactly the columns `PatientSummary` promises — the select and the DTO stay in step. */
const patientSummarySelect = {
  id: true,
  mrn: true,
  prefix: true,
  firstName: true,
  lastName: true,
  gender: true,
  phone: true,
  address: true,
  dateOfBirth: true,
  estimatedAgeYears: true,
  estimatedAgeMonths: true,
  ageRecordedAt: true,
} as const;

type PatientRow = {
  id: string;
  mrn: string;
  prefix: string | null;
  firstName: string;
  lastName: string | null;
  gender: PatientSummary['gender'];
  phone: string | null;
  address: string | null;
  dateOfBirth: Date | null;
  estimatedAgeYears: number | null;
  estimatedAgeMonths: number | null;
  ageRecordedAt: Date | null;
};

/**
 * Phone numbers are stored as digits so they can be FOUND. "0700 123 456" and
 * "0700123456" are the same number, and a receptionist searching the second must match
 * a patient registered as the first — a `contains` against the raw string would not.
 * A leading + is kept; everything else non-numeric is punctuation.
 */
function normalisePhone(value: string): string;
function normalisePhone(value: string | null | undefined): string | null;
function normalisePhone(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const plus = trimmed.startsWith('+') ? '+' : '';
  return `${plus}${trimmed.replace(/\D/g, '')}`;
}

@Injectable()
export class PatientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: NumberSequenceService,
  ) {}

  async create(
    facilityId: string,
    userId: string,
    input: CreatePatientRequest,
  ): Promise<PatientSummary> {
    const mrn = await this.sequence.next(facilityId, 'patient_mrn');

    // An estimated age is a fact about a person AT A MOMENT — "thirty" stops being true
    // the year after it is recorded. `ageRecordedAt` is the anchor that lets a real age
    // be computed later; without it the number silently rots. A real date of birth never
    // rots, so it gets no anchor: stamping one there would imply an estimate that isn't.
    const hasEstimate =
      input.estimatedAgeYears != null ||
      input.estimatedAgeMonths != null ||
      input.estimatedAgeDays != null;

    const created = await this.prisma.db.patient.create({
      data: {
        facilityId,
        createdBy: userId,
        mrn: mrn.formatted,

        firstName: input.firstName,
        lastName: input.lastName ?? null,
        prefix: input.prefix ?? null,
        gender: input.gender,

        phone: normalisePhone(input.phone),
        altPhone: normalisePhone(input.altPhone),

        // Kept as a plain date — the contract carries YYYY-MM-DD so no timezone can
        // shift a birthday across midnight on the way in.
        dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00Z`) : null,
        estimatedAgeYears: input.estimatedAgeYears ?? null,
        estimatedAgeMonths: input.estimatedAgeMonths ?? null,
        estimatedAgeDays: input.estimatedAgeDays ?? null,
        ageRecordedAt: hasEstimate ? new Date() : null,

        guardianName: input.guardianName ?? null,
        guardianRelation: input.guardianRelation ?? null,

        address: input.address ?? null,
        district: input.district ?? null,
        province: input.province ?? null,

        nationalId: input.nationalId ?? null,
        passportNo: input.passportNo ?? null,
        occupation: input.occupation ?? null,
        nationality: input.nationality ?? null,
        bloodGroup: input.bloodGroup ?? null,
      },
      select: patientSummarySelect,
    });

    return this.toSummary(created);
  }

  private toSummary(patient: PatientRow): PatientSummary {
    return {
      id: patient.id,
      mrn: patient.mrn,
      prefix: patient.prefix,
      firstName: patient.firstName,
      lastName: patient.lastName,
      gender: patient.gender,
      phone: patient.phone,
      address: patient.address,
      // Date -> YYYY-MM-DD, matching the contract on the way out as well as in.
      dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.toISOString().slice(0, 10) : null,
      estimatedAgeYears: patient.estimatedAgeYears,
      estimatedAgeMonths: patient.estimatedAgeMonths,
      ageRecordedAt: patient.ageRecordedAt ? patient.ageRecordedAt.toISOString() : null,
    };
  }

  /**
   * Task 3.2 — one box, three kinds of answer: name, MRN, or phone.
   *
   * The done-when is the phone: twelve patients called Najila are indistinguishable by
   * name, and the number is what tells them apart. Phone is matched on digits only,
   * against the digits stored by `normalisePhone`, so spacing never decides a match.
   *
   * Scoped to the caller's facility and to the living register (soft-deleted rows are
   * not results). Both queries share one `where` so the count can never disagree with
   * the page it is counting.
   */
  async search(facilityId: string, q: string, limit: number) {
    const term = q.trim();
    const digits = term.replace(/\D/g, '');

    const where = {
      facilityId,
      deletedAt: null,
      OR: [
        { firstName: { contains: term, mode: 'insensitive' as const } },
        { lastName: { contains: term, mode: 'insensitive' as const } },
        { mrn: { contains: term, mode: 'insensitive' as const } },
        // Three digits is the shortest fragment worth matching a number on; below that
        // every phone in the register contains it.
        ...(digits.length >= 3
          ? [{ phone: { contains: digits } }, { altPhone: { contains: digits } }]
          : []),
      ],
    };

    const [rows, total] = await Promise.all([
      this.prisma.db.patient.findMany({
        where,
        select: patientSummarySelect,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: limit,
      }),
      this.prisma.db.patient.count({ where }),
    ]);

    return { patients: rows.map((row) => this.toSummary(row)), total };
  }
}
