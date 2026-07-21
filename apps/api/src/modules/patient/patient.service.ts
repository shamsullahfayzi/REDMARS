import { ConflictException, Injectable } from '@nestjs/common';
import type {
  CreatePatientRequest,
  DuplicateMatch,
  DuplicateReason,
  PatientSummary,
} from '@redmars/shared';
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

/** Duplicate scoring needs the second number too, which the summary does not carry. */
const duplicateCandidateSelect = { ...patientSummarySelect, altPhone: true } as const;
type DuplicateCandidateRow = PatientRow & { altPhone: string | null };

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

/**
 * Fold a name to a comparable form (task 3.3).
 *
 * The Arabic-script substitutions are the point. The same Afghan name is routinely typed
 * with either Arabic or Persian letterforms — ي/ی, ك/ک — and with or without the hamza on
 * أ/إ/آ. Two receptionists entering "احمدی" on different keyboards produce different
 * bytes for the same name, so comparing raw strings would miss the duplicate every time.
 */
function normaliseName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // harakat and tatweel carry no identity
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ی')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

/** Edit distance, used only on the handful of candidates the query already narrowed to. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

/** 1 = identical. Length-relative so a one-letter slip matters more in a short name. */
function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const longest = Math.max(a.length, b.length);
  return (longest - levenshtein(a, b)) / longest;
}

/** Above this two names are "the same name, typed twice". Tuned to catch a slip, not a sibling. */
const NAME_MATCH_THRESHOLD = 0.85;

/**
 * The raw letters that fold to one normalised letter. Used to widen the candidate query,
 * because Postgres sees the bytes the receptionist typed, not the folded form.
 */
const LETTER_VARIANTS: Record<string, string[]> = {
  ا: ['ا', 'أ', 'إ', 'آ', 'ٱ'],
  ی: ['ی', 'ي', 'ئ'],
  ک: ['ک', 'ك'],
  و: ['و', 'ؤ'],
  ه: ['ه', 'ة'],
};

/**
 * The blocking key: fetch every patient whose first name STARTS with the same letter,
 * then score that set properly in memory.
 *
 * A `contains` on the whole typed name cannot work here — the entire point is to catch a
 * name that was typed differently, and "Najila" does not contain "Najilla". One letter is
 * a deliberately loose net; the scoring below is what makes it precise.
 *
 * This is bounded by TAKE and is the right shape for a register of a few thousand. When
 * Farhat outgrows that, the upgrade is a stored normalised column with an index on it,
 * not a wider net.
 */
function firstLetterVariants(normalisedName: string): string[] {
  const first = normalisedName.slice(0, 1);
  if (first.length === 0) return [];
  return LETTER_VARIANTS[first] ?? [first];
}

const CANDIDATE_TAKE = 200;

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
    // Task 3.3 — refuse a high-confidence duplicate unless the desk has seen it and said
    // so. Deliberately overridable: a household can genuinely share one phone, and a
    // registration system that cannot be argued with gets worked around instead.
    if (!input.acknowledgeDuplicate) {
      const matches = await this.findDuplicates(facilityId, input);
      const blocking = matches.filter((match) => match.confidence === 'high');
      if (blocking.length > 0) {
        throw new ConflictException({
          message: 'Possible duplicate patient',
          code: 'duplicate_patient',
          matches: blocking,
        });
      }
    }

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
  async search(facilityId: string, q: string | undefined, page: number, limit: number) {
    const term = q?.trim() ?? '';
    const digits = term.replace(/\D/g, '');

    // No term lists the whole register, paged — an empty search box shows patients
    // rather than an empty screen.
    const where = {
      facilityId,
      deletedAt: null,
      ...(term.length > 0
        ? {
            OR: [
              { firstName: { contains: term, mode: 'insensitive' as const } },
              { lastName: { contains: term, mode: 'insensitive' as const } },
              { mrn: { contains: term, mode: 'insensitive' as const } },
              // Three digits is the shortest fragment worth matching a number on; below
              // that every phone in the register contains it.
              ...(digits.length >= 3
                ? [{ phone: { contains: digits } }, { altPhone: { contains: digits } }]
                : []),
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.db.patient.findMany({
        where,
        select: patientSummarySelect,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.db.patient.count({ where }),
    ]);

    return { patients: rows.map((row) => this.toSummary(row)), total, page, limit };
  }

  /**
   * Task 3.3 — likely duplicates of a patient about to be registered.
   *
   * Two signals, weighted very differently. A repeated phone number is strong: it is the
   * one field the desk always asks and rarely mistypes, so an exact match stops the save.
   * A close name alone is weak — twelve Najilas is the normal state of the register, not
   * an anomaly — so it is surfaced and never enforced.
   *
   * The query narrows to a small candidate set; the fuzzy comparison happens in memory,
   * which avoids a trigram extension for a list this size.
   */
  async findDuplicates(
    facilityId: string,
    input: { firstName: string; lastName?: string | null; phone?: string | null },
  ): Promise<DuplicateMatch[]> {
    const phone = normalisePhone(input.phone);
    const firstName = normaliseName(input.firstName);
    const lastName = input.lastName ? normaliseName(input.lastName) : '';

    const candidates = await this.prisma.db.patient.findMany({
      where: {
        facilityId,
        deletedAt: null,
        OR: [
          ...(phone ? [{ phone }, { altPhone: phone }] : []),
          ...firstLetterVariants(firstName).map((letter) => ({
            firstName: { startsWith: letter, mode: 'insensitive' as const },
          })),
        ],
      },
      select: duplicateCandidateSelect,
      take: CANDIDATE_TAKE,
    });

    const matches: DuplicateMatch[] = [];
    for (const row of candidates as DuplicateCandidateRow[]) {
      const reasons: DuplicateReason[] = [];

      const phoneMatches = phone != null && (row.phone === phone || row.altPhone === phone);
      if (phoneMatches) reasons.push('phone');

      const firstScore = similarity(firstName, normaliseName(row.firstName));
      const lastScore =
        lastName && row.lastName ? similarity(lastName, normaliseName(row.lastName)) : 1;
      // Both parts must look the same; a shared first name alone is not a name match.
      const nameMatches = firstScore >= NAME_MATCH_THRESHOLD && lastScore >= NAME_MATCH_THRESHOLD;
      if (nameMatches) reasons.push('name');

      if (reasons.length === 0) continue;
      matches.push({
        patient: this.toSummary(row),
        reasons,
        confidence: phoneMatches ? 'high' : 'possible',
      });
    }

    // Strongest first — the row that will stop the save belongs at the top.
    return matches.sort((a, b) =>
      a.confidence === b.confidence ? 0 : a.confidence === 'high' ? -1 : 1,
    );
  }
}
