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
};

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

        phone: input.phone,
        altPhone: input.altPhone ?? null,

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
    };
  }
}
