import { Injectable } from '@nestjs/common';
import type {
  InteractionCheckResponse,
  InteractionSeverity,
  InteractionWarning,
} from '@redmars/shared';
import { INTERACTION_SEVERITY_RANK, interactionSeveritySchema } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DrugInteractionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return the seeded interactions among a set of drugs, worst severity first.
   *
   * Facility-scoped on purpose: only drugs belonging to the caller's facility are
   * considered, so an id from another facility simply drops out rather than probing a
   * neighbouring formulary. A single query finds every stored pair whose BOTH
   * endpoints are in the set — the seed writes each pair in a canonical id order, so
   * direction never matters here.
   *
   * An empty result means no seeded pair matched, NOT that the combination is safe.
   * That distinction is the whole point of the feature and is stated in the UI.
   */
  async check(facilityId: string, drugIds: string[]): Promise<InteractionCheckResponse> {
    const ids = [...new Set(drugIds)];

    const drugs = await this.prisma.db.drug.findMany({
      where: { id: { in: ids }, facilityId },
      select: { id: true, genericName: true, strength: true },
    });
    if (drugs.length < 2) {
      // Fewer than two of the ids resolve to this facility's drugs — no pair possible.
      return { interactions: [] };
    }

    const nameById = new Map(
      drugs.map((d) => [d.id, d.strength ? `${d.genericName} ${d.strength}` : d.genericName]),
    );
    const known = drugs.map((d) => d.id);

    const rows = await this.prisma.db.drugInteraction.findMany({
      where: { drugAId: { in: known }, drugBId: { in: known } },
      select: { drugAId: true, drugBId: true, severity: true, description: true },
    });

    const interactions: InteractionWarning[] = rows.map((row) => ({
      drugAId: row.drugAId,
      drugAName: nameById.get(row.drugAId) ?? '',
      drugBId: row.drugBId,
      drugBName: nameById.get(row.drugBId) ?? '',
      severity: this.toSeverity(row.severity),
      description: row.description,
    }));

    interactions.sort(
      (a, b) => INTERACTION_SEVERITY_RANK[b.severity] - INTERACTION_SEVERITY_RANK[a.severity],
    );
    return { interactions };
  }

  // severity is a free-text column at the DB level; the seed only ever writes a valid
  // value, but coerce defensively so a hand-edited row can never crash the response.
  private toSeverity(value: string): InteractionSeverity {
    const parsed = interactionSeveritySchema.safeParse(value);
    return parsed.success ? parsed.data : 'moderate';
  }
}
