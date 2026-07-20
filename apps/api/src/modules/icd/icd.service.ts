import { Injectable } from '@nestjs/common';
import type { IcdSearchQuery, IcdSearchResponse } from '@redmars/shared';
import { DEFAULT_ICD_LIMIT } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

const ICD_SELECT = {
  code: true,
  title: true,
  titleLocal: true,
  chapter: true,
  isBillable: true,
} as const;

@Injectable()
export class IcdService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Typeahead over the diagnosis catalog. Matches EITHER a code prefix ("F32" ->
   * F32.x) OR a case-insensitive substring of the title ("depress" -> the F32/F33
   * codes). Ordered by code so a chapter's codes arrive together and the shorter
   * parent sorts before its children.
   *
   * A `contains` is an ILIKE '%q%', which a plain btree cannot accelerate — fine at
   * this catalog's curated size (hundreds of rows, not the full ~70k WHO set). If it
   * ever grows to the full file, the fast path is a pg_trgm GIN index on title; the
   * query here would not change, only the index behind it.
   */
  async search(query: IcdSearchQuery): Promise<IcdSearchResponse> {
    const q = query.q.trim();
    const results = await this.prisma.db.icdCode.findMany({
      where: {
        OR: [
          { code: { startsWith: q.toUpperCase() } },
          { title: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { code: 'asc' },
      take: query.limit ?? DEFAULT_ICD_LIMIT,
      select: ICD_SELECT,
    });
    return { results };
  }
}
