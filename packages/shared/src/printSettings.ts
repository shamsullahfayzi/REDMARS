import { z } from 'zod'

/**
 * Task 4.10 — what a facility may change about its printed prescription, and what it may
 * not.
 *
 * WHY SETTINGS AND NOT A TEMPLATE EDITOR. Farhat's current system answers "we want the
 * layout changed" with a phone call to a technician. That is tolerated rather than loved,
 * but its RARITY is the argument: a facility that needed to restructure its prescription
 * monthly would have stopped tolerating a phone call years ago. Rare plus dangerous is the
 * shape that argues for a fixed sheet with knobs, not a canvas.
 *
 * And it IS dangerous. A prescription whose blocks an admin can delete is a way to un-ship
 * the safety work: drag the allergy panel off and task 4.6's banner never reaches paper;
 * drop the Qty column and a pharmacist starts guessing. The list below is deliberately a
 * list of things that are SAFE to be wrong. Nothing here can remove the drug, its dose or
 * its frequency, because a sheet without those is not a prescription.
 *
 * The real reason this exists at all is not Farhat's convenience — it is hospital number
 * two. Hardcoding the sheet means every new facility is a code branch, and this is a
 * multi-facility system.
 *
 * EVERY FIELD HAS A DEFAULT, and the defaults are Farhat's sheet as photographed on
 * 2026-07-22. `printSettingsSchema.parse({})` is therefore a working configuration, which
 * is what lets the sheet ship before the admin screen that will write these into the
 * per-facility `Setting` row exists. When that screen lands it parses the same schema, and
 * a facility that has never touched it keeps behaving exactly as it does today.
 */

export const PRINT_SETTINGS_KEY = 'print.prescription'

export const PAPER_SIZES = ['A4', 'A5', 'Letter'] as const
export type PaperSize = (typeof PAPER_SIZES)[number]

/**
 * Blank top/bottom space for ONE paper size, in millimetres.
 *
 * Split out from a single flat pair because task "doctor picks the paper" means the same
 * facility can have two different pieces of pre-printed stationery loaded — a full A4
 * letterhead for a normal visit and a smaller A5 pad at triage or a satellite room — and
 * each carries its own header/footer artwork at a different height. One blank-margin pair
 * cannot be right for both.
 */
const paperMarginsSchema = (topDefault: number, bottomDefault: number) =>
  z.object({
    topMarginMm: z.number().min(0).max(120).default(topDefault),
    bottomMarginMm: z.number().min(0).max(60).default(bottomDefault),
  })

const DEFAULT_MARGINS = {
  A4: { topMarginMm: 55, bottomMarginMm: 14 },
  A5: { topMarginMm: 25, bottomMarginMm: 10 },
  Letter: { topMarginMm: 55, bottomMarginMm: 14 },
}

export const printSettingsSchema = z.object({
  /**
   * A4 everywhere it has been seen. A5 and Letter are here because a doctor can choose
   * either at print time (below) — this is only the sheet's opening value, i.e. what the
   * picker shows before anyone touches it.
   */
  paperSize: z.enum(PAPER_SIZES).default('A4'),

  /**
   * Blank space at the top and bottom of EVERY page, per paper size, in millimetres.
   *
   * Farhat prints onto pre-printed letterhead stationery — the top third of their A4 sheet
   * is empty because the paper already carries the hospital's name, and the bottom strip is
   * left clear the same way for a footer/stamp. Applied as `@page` margins rather than
   * spacer elements on purpose: a spacer only pushes the first page's content, and a
   * prescription that runs to a second page would print its table over the letterhead.
   *
   * 55/14 (A4) is a starting point measured against a real sheet, not a fact. 25/10 (A5) is
   * a proportional guess until someone measures the actual A5 pad against it.
   */
  margins: z
    .object({
      A4: paperMarginsSchema(DEFAULT_MARGINS.A4.topMarginMm, DEFAULT_MARGINS.A4.bottomMarginMm).default(
        DEFAULT_MARGINS.A4,
      ),
      A5: paperMarginsSchema(DEFAULT_MARGINS.A5.topMarginMm, DEFAULT_MARGINS.A5.bottomMarginMm).default(
        DEFAULT_MARGINS.A5,
      ),
      Letter: paperMarginsSchema(
        DEFAULT_MARGINS.Letter.topMarginMm,
        DEFAULT_MARGINS.Letter.bottomMarginMm,
      ).default(DEFAULT_MARGINS.Letter),
    })
    .default(DEFAULT_MARGINS),

  /**
   * WHICH SECTIONS PRINT.
   *
   * Allergies default ON and are not on Farhat's current sheet, which is the one place
   * this deliberately does more than the system it replaces. Tasks 4.6 and 4.8 exist to
   * make a recorded allergy impossible to miss; letting the prescription walk out of the
   * building without it would undo both of them at the last step. A facility can still
   * turn it off — but it has to choose to.
   */
  showAllergies: z.boolean().default(true),
  showVitals: z.boolean().default(true),
  showComplaint: z.boolean().default(true),
  showDiagnosis: z.boolean().default(true),
  showAdvice: z.boolean().default(true),
  /**
   * Task 4.15 — "come back on the fifth", on the paper the patient carries home.
   *
   * A toggle rather than always-on because a hospital that books every review into the
   * appointment book (task 3.10) hands the patient a card instead, and two dates on two
   * pieces of paper is how they end up disagreeing. Farhat does not, so it defaults on.
   */
  showFollowUp: z.boolean().default(true),
  /** The line the prescriber signs. Their sheet has none; a drug order should.  */
  showSignature: z.boolean().default(true),

  /**
   * WHICH TREATMENT COLUMNS PRINT. Drug, frequency and duration are absent from this list
   * because they are not optional — a sheet missing any of the three is not a prescription,
   * and a setting that could remove them is a setting that will one day be wrong.
   */
  showDose: z.boolean().default(true),
  showQuantity: z.boolean().default(true),
  showRoute: z.boolean().default(true),
  showInstructions: z.boolean().default(true),

  /**
   * Print "By mouth" rather than "PO".
   *
   * The code is what is STORED — that was the point of making route a closed set — but
   * paper is read by a patient and by a pharmacy assistant, and Farhat's sheet spells it
   * out as "Oral". Facilities whose staff prefer the abbreviation set this false.
   */
  routeAsWord: z.boolean().default(true),

  /**
   * A line at the foot of the page: telephone number, address, "bring this sheet with you".
   * Empty by default because pre-printed stationery usually carries it already.
   */
  footerText: z.string().trim().max(200).default(''),
})

export type PrintSettings = z.infer<typeof printSettingsSchema>

/** Farhat's sheet, as the fallback for a facility that has configured nothing. */
export function defaultPrintSettings(): PrintSettings {
  return printSettingsSchema.parse({})
}
