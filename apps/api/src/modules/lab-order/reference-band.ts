import { Prisma } from '@prisma/client';
import type { Gender } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * The normal band a lab value is judged against — shared by result entry (which sets the
 * flag), the doctor's read-back (which prints "normal 70–110"), and history (task 6b.6),
 * which needed the exact same number for a visit that closed months ago. One function, so
 * a change to how a band is picked cannot drift between the three places that ask for one.
 */
export interface Band {
  low: Prisma.Decimal | null;
  high: Prisma.Decimal | null;
  text: string | null;
}

/**
 * The normal band for a test that fits this patient, most specific first.
 *
 * A range applies when its gender matches (or is unset = any) and the patient's age falls
 * inside its bounds (an unset bound is open on that side; an unknown patient age cannot
 * satisfy a bounded range). Among the fits, the most specific wins — a gender-named band
 * over an any-gender one, an age-bounded band over an open one — so "13–17 male" beats a
 * generic fallback.
 */
export async function bandFor(
  prisma: PrismaService,
  testId: string,
  gender: Gender,
  ageYears: number | null,
): Promise<Band> {
  const ranges = await prisma.db.referenceRange.findMany({
    where: { testId },
    select: {
      gender: true,
      minAge: true,
      maxAge: true,
      lowValue: true,
      highValue: true,
      textValue: true,
    },
  });

  const fits = ranges.filter((range) => {
    if (range.gender != null && range.gender !== gender) return false;
    if (range.minAge != null && (ageYears == null || ageYears < range.minAge)) return false;
    if (range.maxAge != null && (ageYears == null || ageYears > range.maxAge)) return false;
    return true;
  });
  if (fits.length === 0) return { low: null, high: null, text: null };

  fits.sort((a, b) => specificity(b) - specificity(a));
  const best = fits[0];
  return { low: best.lowValue, high: best.highValue, text: best.textValue };
}

/** How narrowly a range is targeted — gender named, and each age bound, each count. */
function specificity(range: {
  gender: Gender | null;
  minAge: number | null;
  maxAge: number | null;
}): number {
  return (
    (range.gender != null ? 2 : 0) + (range.minAge != null ? 1 : 0) + (range.maxAge != null ? 1 : 0)
  );
}
