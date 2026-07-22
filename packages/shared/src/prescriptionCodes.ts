/**
 * The abbreviations a prescription is actually written in.
 *
 * WHY THESE ARE CODED AND NOT FREE TEXT. "oral", "Oral", "by mouth" and "PO" are one route
 * typed four ways, and a free-text column holding all four cannot be printed consistently
 * (task 4.10), cannot be dispensed against (Phase 6), and cannot be counted. Route and
 * frequency are genuinely CLOSED sets in practice, so the contract closes them.
 *
 * DOSE AND DURATION ARE NOT CLOSED, and pretending otherwise would be worse than free
 * text. "½ tab", "5 ml", "until review", "3 days" are all real, and a doctor who cannot
 * write what they mean writes it in the instructions box instead — which is how a
 * structured field quietly becomes decorative. Those two keep presets and stay open.
 *
 * `keywords` is what makes the picker fast: a doctor who thinks "injection" rather than
 * "IM" types injection and gets it. That list is the whole difference between a dropdown
 * and a ten-second hunt.
 */

export interface PrescriptionCode {
  /** What is stored and what is printed. */
  code: string
  /** Plain language, shown beside the code so nobody has to remember it. */
  label: string
  /** Alternative spellings and lay words a prescriber might type instead. */
  keywords: string[]
}

/**
 * Routes, commonest first rather than alphabetical — an OPD psychiatric clinic writes PO
 * many times a day and PV essentially never, and a list sorted by the alphabet puts the
 * rare ones in front of the eye.
 */
export const ROUTE_CODES = [
  { code: 'PO', label: 'By mouth', keywords: ['oral', 'mouth', 'tablet', 'capsule', 'syrup', 'po'] },
  { code: 'IM', label: 'Into muscle', keywords: ['injection', 'intramuscular', 'muscle', 'depot', 'im'] },
  { code: 'IV', label: 'Into a vein', keywords: ['injection', 'intravenous', 'vein', 'drip', 'infusion', 'iv'] },
  { code: 'SC', label: 'Under the skin', keywords: ['injection', 'subcutaneous', 'sq', 'sc'] },
  { code: 'SL', label: 'Under the tongue', keywords: ['sublingual', 'tongue', 'sl'] },
  { code: 'TOP', label: 'On the skin', keywords: ['topical', 'skin', 'cream', 'ointment', 'gel', 'top'] },
  { code: 'TD', label: 'Skin patch', keywords: ['transdermal', 'patch', 'td'] },
  { code: 'INH', label: 'Inhaled', keywords: ['inhaler', 'nebuliser', 'nebulizer', 'lungs', 'puff', 'inh'] },
  { code: 'NAS', label: 'Into the nose', keywords: ['nasal', 'nose', 'spray', 'nas'] },
  { code: 'OPH', label: 'Into the eye', keywords: ['ophthalmic', 'eye', 'drops', 'oph'] },
  { code: 'OTI', label: 'Into the ear', keywords: ['otic', 'ear', 'drops', 'oti', 'au'] },
  { code: 'PR', label: 'Rectal', keywords: ['rectum', 'suppository', 'pr'] },
  { code: 'PV', label: 'Vaginal', keywords: ['vagina', 'pessary', 'pv'] },
  { code: 'NG', label: 'Nasogastric tube', keywords: ['tube', 'nasogastric', 'ng'] },
] as const satisfies readonly PrescriptionCode[]

export type RouteCode = (typeof ROUTE_CODES)[number]['code']
export const ROUTE_VALUES = ROUTE_CODES.map((entry) => entry.code) as [RouteCode, ...RouteCode[]]

/**
 * Frequencies.
 *
 * Written in the British abbreviations — BD, TDS, QDS — because that is the convention
 * Afghan medical training follows, with the American forms (BID/TID/QID) carried as
 * keywords so either way of typing finds the same code. If Farhat turns out to write the
 * American set, this is one list to change and the keywords already cover the transition.
 */
export const FREQUENCY_CODES = [
  { code: 'OD', label: 'Once a day', keywords: ['daily', 'once', 'qd', 'od', '1'] },
  { code: 'BD', label: 'Twice a day', keywords: ['bid', 'twice', 'bd', '2'] },
  { code: 'TDS', label: 'Three times a day', keywords: ['tid', 'thrice', 'three', 'tds', '3'] },
  { code: 'QDS', label: 'Four times a day', keywords: ['qid', 'four', 'qds', '4'] },
  { code: 'OM', label: 'In the morning', keywords: ['mane', 'morning', 'am', 'om'] },
  { code: 'ON', label: 'At night', keywords: ['nocte', 'night', 'bedtime', 'hs', 'on', 'pm'] },
  { code: 'PRN', label: 'Only when needed', keywords: ['as needed', 'as required', 'when required', 'sos', 'prn'] },
  { code: 'STAT', label: 'Immediately, once', keywords: ['now', 'once only', 'stat'] },
  { code: 'Q4H', label: 'Every 4 hours', keywords: ['4 hourly', 'q4h'] },
  { code: 'Q6H', label: 'Every 6 hours', keywords: ['6 hourly', 'q6h'] },
  { code: 'Q8H', label: 'Every 8 hours', keywords: ['8 hourly', 'q8h'] },
  { code: 'Q12H', label: 'Every 12 hours', keywords: ['12 hourly', 'q12h'] },
  { code: 'ALT', label: 'Every other day', keywords: ['alternate', 'eod', 'alt'] },
  { code: 'WKLY', label: 'Once a week', keywords: ['weekly', 'week', 'wkly'] },
  { code: 'MTHLY', label: 'Once a month', keywords: ['monthly', 'month', 'depot', 'mthly'] },
] as const satisfies readonly PrescriptionCode[]

export type FrequencyCode = (typeof FREQUENCY_CODES)[number]['code']
export const FREQUENCY_VALUES = FREQUENCY_CODES.map((entry) => entry.code) as [
  FrequencyCode,
  ...FrequencyCode[],
]

/**
 * Duration suggestions — NOT a closed set.
 *
 * "Until review" and "Ongoing" are on the list because long-term psychiatric medication is
 * the normal case at Farhat, and a duration list that stopped at "3 months" would push the
 * commonest answer into free text.
 */
export const DURATION_PRESETS = [
  { code: '3 days', label: '', keywords: ['3'] },
  { code: '5 days', label: '', keywords: ['5'] },
  { code: '7 days', label: 'One week', keywords: ['1 week', 'week', '7'] },
  { code: '10 days', label: '', keywords: ['10'] },
  { code: '14 days', label: 'Two weeks', keywords: ['2 weeks', '14'] },
  { code: '1 month', label: '', keywords: ['30 days', 'month'] },
  { code: '2 months', label: '', keywords: ['60 days'] },
  { code: '3 months', label: '', keywords: ['90 days'] },
  { code: '6 months', label: '', keywords: [] },
  { code: 'Until review', label: 'Until next appointment', keywords: ['review', 'next visit'] },
  { code: 'Ongoing', label: 'Long term', keywords: ['long term', 'continuous', 'indefinite'] },
] as const satisfies readonly PrescriptionCode[]

/** Dose suggestions — also open. A dose depends on the drug's form and strength. */
export const DOSE_PRESETS = [
  { code: '½ tab', label: 'Half a tablet', keywords: ['half', '0.5', '1/2'] },
  { code: '1 tab', label: '', keywords: ['one', 'tablet', '1'] },
  { code: '2 tab', label: '', keywords: ['two', '2'] },
  { code: '1 cap', label: 'One capsule', keywords: ['capsule'] },
  { code: '5 ml', label: '', keywords: ['5ml', 'syrup', 'teaspoon'] },
  { code: '10 ml', label: '', keywords: ['10ml'] },
  { code: '1 puff', label: '', keywords: ['inhaler', 'puff'] },
  { code: '1 drop', label: '', keywords: ['drop', 'eye', 'ear'] },
] as const satisfies readonly PrescriptionCode[]

/**
 * The timing codes that go in the instructions box, offered as one-click additions rather
 * than replacing it. AC and PC are the two the user named, and they are the two that
 * change whether a drug works — but "take with plenty of water" has no code and never
 * will, so this augments free text instead of closing it.
 */
export const INSTRUCTION_CODES = [
  { code: 'AC', label: 'Before food', keywords: ['ante cibum', 'before meals', 'empty stomach', 'ac'] },
  { code: 'PC', label: 'After food', keywords: ['post cibum', 'after meals', 'pc'] },
  { code: 'WF', label: 'With food', keywords: ['with meals', 'with food', 'wf'] },
  { code: 'HS', label: 'At bedtime', keywords: ['hora somni', 'bedtime', 'hs'] },
] as const satisfies readonly PrescriptionCode[]

/**
 * Map whatever is already stored onto a code.
 *
 * The formulary's defaults (task 2.6) were typed as free text — "oral", "OD" — and they
 * are what the browser autofills a new row from. Without this, every autofilled row would
 * arrive holding a value the contract now refuses, and the feature that exists to save
 * time would cost it instead.
 *
 * Returns null when nothing matches, which the caller treats as "leave the field empty and
 * let the prescriber choose" — never as a guess.
 */
export function matchCode(
  raw: string | null | undefined,
  codes: readonly PrescriptionCode[],
): string | null {
  if (!raw) return null
  const needle = raw.trim().toLowerCase()
  if (!needle) return null

  const exact = codes.find((entry) => entry.code.toLowerCase() === needle)
  if (exact) return exact.code

  const byLabel = codes.find((entry) => entry.label.toLowerCase() === needle)
  if (byLabel) return byLabel.code

  const byKeyword = codes.find((entry) =>
    entry.keywords.some((keyword) => keyword.toLowerCase() === needle),
  )
  return byKeyword?.code ?? null
}

/** Search across code, label and keywords — the reason the picker is not a hunt. */
export function searchCodes(
  query: string,
  codes: readonly PrescriptionCode[],
): readonly PrescriptionCode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return codes

  return codes.filter(
    (entry) =>
      entry.code.toLowerCase().includes(needle) ||
      entry.label.toLowerCase().includes(needle) ||
      entry.keywords.some((keyword) => keyword.includes(needle)),
  )
}

/** "PO — By mouth", for anywhere a stored code has to read as words. */
export function describeCode(code: string, codes: readonly PrescriptionCode[]): string {
  const entry = codes.find((row) => row.code === code)
  if (!entry || !entry.label) return code
  return `${entry.code} — ${entry.label}`
}
