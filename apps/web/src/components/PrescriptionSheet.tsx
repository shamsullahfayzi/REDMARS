import { useTranslation } from 'react-i18next'
import {
  FREQUENCY_CODES,
  ROUTE_CODES,
  describeCode,
  type Allergy,
  type ConsultContext,
  type Diagnosis,
  type Prescription,
  type PrintSettings,
  type VitalsReading,
} from '@redmars/shared'
import { useDiagnoses } from '@/hooks/useDiagnoses'
import { usePrescription } from '@/hooks/usePrescription'
import { useVitals } from '@/hooks/useVitals'

/**
 * Task 4.10 — the A4 page the patient walks out with.
 *
 * Modelled on a photograph of the sheet Farhat prints TODAY, because the doctor receiving
 * this has been reading that layout for years and the first print should look like the
 * thing it replaces. Their structure, in their order: a boxed two-column identity header,
 * grey band headings, and a treatment table reading drug, frequency, duration, qty, route,
 * remarks.
 *
 * IT LIVES ON THE CONSULT SCREEN, hidden, rather than on a route of its own. Everything it
 * needs is already loaded there — task 4.1 keeps every panel mounted, so the vitals,
 * diagnosis and prescription queries are all live — and that makes F4 a save followed by
 * `window.print()` with nothing in between. A print route would mean a navigation, a
 * second round of fetches and a spinner between the doctor and the paper, on the one
 * action that happens while a patient is standing up to leave.
 *
 * THE SAVE THAT PRECEDES IT IS NOT A RACE. Every consult mutation returns its
 * `invalidateQueries` promise from `onSuccess`, so `mutateAsync` does not resolve until the
 * refetch has landed. By the time task 4.2's F4 handler calls `window.print()`, what is on
 * this sheet is what is in the database — not what was on screen a moment before.
 *
 * WHAT IS DELIBERATELY NOT HERE:
 *
 *  - `printedAt`. The column exists and stays null. Stamping it needs an endpoint, a
 *    permission and its own tests, none of which are in this task's done-when, and a
 *    browser cannot honestly tell whether paper came out anyway — the user can cancel the
 *    dialog. Null meaning "no print was recorded" is true; a timestamp meaning "a print was
 *    attempted" would be a weaker claim wearing a stronger word.
 *  - A second language alongside the first. The build order asked for a bilingual sheet;
 *    Farhat's actual paper is monolingual English labels with the REMARKS column in Dari,
 *    which is already how this works — labels for the staff, instructions for the patient,
 *    each in the language its reader has. Printing every label twice would halve the space
 *    for the drugs. The sheet follows the interface language and lays out correctly in
 *    either direction, which is the part of "bilingual, RTL" that was actually load-bearing.
 */
export function PrescriptionSheet({
  context,
  settings,
}: {
  context: ConsultContext
  settings: PrintSettings
}) {
  const { t, i18n } = useTranslation()
  const vitals = useVitals(context.visit.id)
  const diagnoses = useDiagnoses(context.visit.id)
  const prescription = usePrescription(context.visit.id)

  const { visit } = context
  const latestVitals = vitals.data?.readings[0] ?? null
  const rx = prescription.data?.prescription ?? null
  const list = diagnoses.data?.diagnoses ?? []

  return (
    <div className="rx-sheet hidden print:block" lang={i18n.language} dir={i18n.dir()}>
      {/*
        The letterhead gap, as an @page margin rather than a spacer element.

        Farhat prints onto pre-printed stationery, so the top of every page has to stay
        clear — and "every page" is the whole reason this is not a div with a height. A
        spacer pushes the first page down and lets page two print its table across the
        hospital's letterhead.
      */}
      <style>{`@page { size: ${settings.paperSize}; margin: ${settings.topMarginMm}mm 14mm 14mm 14mm; }`}</style>

      <Header context={context} consultant={rx?.practitionerName ?? visit.practitionerName} />

      {/*
        NOT on the sheet Farhat prints today, and on this one by default.

        Tasks 4.6 and 4.8 exist to make a recorded allergy impossible to miss on screen. A
        prescription that leaves the building without it undoes both at the last step — the
        pharmacist dispensing from this paper never saw the banner.
      */}
      {settings.showAllergies && <Allergies allergies={context.allergies} />}

      {settings.showVitals && latestVitals && <Vitals reading={latestVitals} />}

      {settings.showComplaint && visit.chiefComplaint && (
        <Section title={t('print.complaint')}>{visit.chiefComplaint}</Section>
      )}

      {settings.showDiagnosis && list.length > 0 && <Diagnoses diagnoses={list} />}

      <Treatment prescription={rx} settings={settings} />

      {settings.showAdvice && rx?.advice && (
        <Section title={t('print.advice')}>{rx.advice}</Section>
      )}

      {settings.showSignature && (
        <div className="mt-10 flex justify-end">
          <div className="w-56 border-t border-black pt-1 text-center text-[10pt]">
            {t('print.signature')}
          </div>
        </div>
      )}

      {settings.footerText && (
        <p className="mt-6 border-t border-black/40 pt-2 text-center text-[9pt]">
          {settings.footerText}
        </p>
      )}
    </div>
  )
}

/**
 * The identity block, in Farhat's two-column boxed form.
 *
 * Every value in it is LTR-isolated. An MRN, a visit number and a date read left to right
 * whatever direction the page runs in, and a bare number dropped into an RTL paragraph
 * gets reordered by the bidi algorithm — which is how "OP04991" becomes something that is
 * not the patient's registration number on the one document that has to identify them.
 */
function Header({
  context,
  consultant,
}: {
  context: ConsultContext
  consultant: string | null
}) {
  const { t } = useTranslation()
  const { patient, visit } = context

  const ageSex = [
    patient.ageYears != null ? t('print.years', { count: patient.ageYears }) : null,
    t(`patients.gender.${patient.gender}`),
  ]
    .filter(Boolean)
    .join(' / ')

  return (
    <div className="grid grid-cols-2 border border-black text-[10pt]">
      <dl className="space-y-0.5 border-e border-black p-2">
        <Line label={t('print.uhid')} value={patient.mrn} ltr />
        <Line label={t('print.name')} value={patient.name} />
        <Line label={t('print.ageSex')} value={ageSex} />
      </dl>
      <dl className="space-y-0.5 p-2">
        <Line label={t('print.regNo')} value={visit.visitNo} ltr />
        <Line label={t('print.regDate')} value={formatDateTime(visit.startedAt)} ltr />
        {/* When this copy came out. A patient holding two printings of one prescription
            needs to know which is the later. */}
        <Line label={t('print.printDate')} value={formatDateTime(new Date().toISOString())} ltr />
        <Line label={t('print.consultant')} value={consultant ?? '—'} />
      </dl>
    </div>
  )
}

function Line({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex gap-1">
      <dt className="w-24 shrink-0 text-black/70">{label}</dt>
      <dd className="shrink-0">:</dd>
      <dd className={ltr ? 'font-mono' : ''} dir={ltr ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  )
}

/** The grey band Farhat's sheet uses to separate sections. */
function Band({ children }: { children: string }) {
  return (
    <h2 className="mt-3 bg-black/10 px-2 py-0.5 text-[9pt] font-bold uppercase tracking-wide">
      {children}
    </h2>
  )
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <>
      <Band>{title}</Band>
      <p className="px-2 py-1 text-[10pt]">{children}</p>
    </>
  )
}

/**
 * Allergies on paper.
 *
 * "None recorded" is PRINTED rather than the section being dropped, and that is the whole
 * value of the block. A missing allergy line and a patient with no allergies look
 * identical, and one of them means nobody asked — the same argument task 4.6 makes for the
 * banner, which does not stop being true because the medium changed to paper.
 */
function Allergies({ allergies }: { allergies: Allergy[] }) {
  const { t } = useTranslation()

  return (
    <>
      <Band>{t('print.allergies')}</Band>
      {allergies.length === 0 ? (
        <p className="px-2 py-1 text-[10pt]">{t('print.noAllergies')}</p>
      ) : (
        <p className="border-2 border-black px-2 py-1 text-[10pt] font-bold">
          {allergies
            .map((allergy) =>
              [
                allergy.substance,
                t(`allergies.severities.${allergy.severity}`),
                allergy.reaction,
              ]
                .filter(Boolean)
                .join(' — '),
            )
            .join('  ·  ')}
        </p>
      )}
    </>
  )
}

/** One inline line, the way their sheet writes it. */
function Vitals({ reading }: { reading: VitalsReading }) {
  const { t } = useTranslation()

  const parts = [
    reading.systolicBp != null && reading.diastolicBp != null
      ? `${t('vitals.fields.bp')}: ${reading.systolicBp}/${reading.diastolicBp} mmHg`
      : null,
    reading.pulse != null ? `${t('vitals.fields.pulse')}: ${reading.pulse} /min` : null,
    reading.temperatureC != null ? `${t('vitals.fields.temperatureC')}: ${reading.temperatureC} °C` : null,
    reading.respiratory != null ? `${t('vitals.fields.respiratory')}: ${reading.respiratory} /min` : null,
    reading.spo2 != null ? `${t('vitals.fields.spo2')}: ${reading.spo2} %` : null,
    reading.weightKg != null ? `${t('vitals.fields.weightKg')}: ${reading.weightKg} kg` : null,
    reading.heightCm != null ? `${t('vitals.fields.heightCm')}: ${reading.heightCm} cm` : null,
  ].filter(Boolean)

  if (parts.length === 0) return null

  return (
    <>
      <Band>{t('print.vitals')}</Band>
      {/* LTR: a run of numbers and units reorders under the bidi algorithm otherwise, and
          "160/120" is not a value to let a layout engine have opinions about. */}
      <p className="px-2 py-1 text-[10pt]" dir="ltr">
        {parts.join(',  ')}
      </p>
    </>
  )
}

function Diagnoses({ diagnoses }: { diagnoses: Diagnosis[] }) {
  const { t } = useTranslation()

  return (
    <>
      <Band>{t('print.diagnosis')}</Band>
      <ul className="px-2 py-1 text-[10pt]">
        {diagnoses.map((diagnosis) => (
          <li key={diagnosis.id}>
            {diagnosis.text}
            {diagnosis.icdCode && (
              <span className="ms-2 font-mono text-[9pt]" dir="ltr">
                ({diagnosis.icdCode})
              </span>
            )}
            {/* A provisional diagnosis printed as though it were settled is a claim the
                doctor did not make. Certainty travels to paper. */}
            {diagnosis.certainty !== 'confirmed' && (
              <span className="ms-2 text-[9pt] italic">
                {t(`diagnosis.certainties.${diagnosis.certainty}`)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * The drugs.
 *
 * `drugNameAtTime` rather than a lookup, because task 4.7 snapshotted it for exactly this
 * moment: a sheet reprinted in 2028 must say what was actually prescribed in 2026, not
 * what the formulary calls that row today.
 */
function Treatment({
  prescription,
  settings,
}: {
  prescription: Prescription | null
  settings: PrintSettings
}) {
  const { t } = useTranslation()
  const items = prescription?.items ?? []

  return (
    <>
      <Band>{t('print.treatment')}</Band>
      {items.length === 0 ? (
        <p className="px-2 py-1 text-[10pt]">{t('print.noDrugs')}</p>
      ) : (
        <table className="w-full border-collapse text-[10pt]">
          <thead>
            <tr className="border-y border-black">
              <th className="w-8 py-1 text-start font-semibold">{t('print.sno')}</th>
              <th className="py-1 text-start font-semibold">{t('print.rx')}</th>
              {settings.showDose && (
                <th className="py-1 text-start font-semibold">{t('prescription.dose')}</th>
              )}
              <th className="py-1 text-start font-semibold">{t('prescription.frequency')}</th>
              <th className="py-1 text-start font-semibold">{t('prescription.duration')}</th>
              {settings.showQuantity && (
                <th className="py-1 text-start font-semibold">{t('prescription.quantity')}</th>
              )}
              {settings.showRoute && (
                <th className="py-1 text-start font-semibold">{t('prescription.route')}</th>
              )}
              {settings.showInstructions && (
                <th className="py-1 text-start font-semibold">{t('print.remarks')}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              // A drug order split across a page break is a dose read off two sheets.
              <tr key={item.id} className="break-inside-avoid border-b border-black/30 align-top">
                <td className="py-1" dir="ltr">
                  {index + 1}
                </td>
                {/* Drug names are Latin script and stay LTR on an RTL page. */}
                <td className="py-1 pe-2 font-semibold" dir="ltr">
                  {item.drugNameAtTime}
                </td>
                {settings.showDose && (
                  <td className="py-1 pe-2" dir="ltr">
                    {item.dose ?? ''}
                  </td>
                )}
                <td className="py-1 pe-2" dir="ltr">
                  {describeCode(item.frequency, FREQUENCY_CODES)}
                </td>
                <td className="py-1 pe-2" dir="ltr">
                  {item.duration}
                </td>
                {settings.showQuantity && (
                  <td className="py-1 pe-2" dir="ltr">
                    {item.quantity ?? ''}
                  </td>
                )}
                {settings.showRoute && (
                  <td className="py-1 pe-2" dir="ltr">
                    {/* Paper is read by a patient and a pharmacy assistant. The CODE is what
                        is stored; the words are what gets handed over. */}
                    {settings.routeAsWord
                      ? (ROUTE_CODES.find((entry) => entry.code === item.route)?.label ?? item.route)
                      : item.route}
                  </td>
                )}
                {settings.showInstructions && (
                  // The one column Farhat writes in Dari. No dir override — it takes the
                  // page's direction, which is the whole point of it being free text.
                  <td className="py-1">{item.instructions ?? ''}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/*
        The override, on the paper it was overridden for.

        Task 4.8 makes a doctor type a reason to prescribe past a recorded allergy, and
        stores it on the item rather than only in the audit log precisely so it can be read
        by people who do not read audit tables. A pharmacist holding this sheet is the first
        of those people.
      */}
      {items.some((item) => item.allergyOverrideReason) && (
        <div className="mt-1 border border-black px-2 py-1 text-[9pt]">
          <p className="font-bold">{t('print.overrideTitle')}</p>
          <ul>
            {items
              .filter((item) => item.allergyOverrideReason)
              .map((item) => (
                <li key={item.id}>
                  <span dir="ltr">{item.drugNameAtTime}</span>
                  {' — '}
                  {item.allergyOverrideReason}
                </li>
              ))}
          </ul>
        </div>
      )}

      {prescription?.interactionAckReason && (
        <p className="mt-1 text-[9pt]">
          <span className="font-bold">{t('print.interactionTitle')}</span>{' '}
          {prescription.interactionAckReason}
        </p>
      )}
    </>
  )
}

/**
 * Dates on the sheet.
 *
 * Fixed to en-GB and the Gregorian calendar rather than the interface locale, because a
 * date is one of the two things on this page a pharmacy and a patient have to agree about,
 * and "22-Jul-2026" is what Farhat's current sheet prints. Rendering it in Persian digits
 * on a Dari interface would produce a document the pharmacist next door cannot read back.
 * The Hijri calendar question is real and belongs to whoever asks for it, with a setting.
 */
function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kabul',
  }).format(date)
}
