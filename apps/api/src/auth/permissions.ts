/**
 * The RBAC matrix, transcribed 1:1 from roles-and-permissions.md.
 *
 * That document is the source of truth and this file is its executable copy.
 * They are laid out in the same order, with the same section headings, so the
 * two can be read side by side and diffed by eye. If they ever disagree, the
 * document is right and this file is a bug.
 *
 * It lives in src/ rather than prisma/ because it has two consumers: the seed
 * (task 1.2) writes it to the database, and the PermissionsGuard (task 1.3)
 * checks against it. Exporting PermissionCode as a union means
 * `@RequirePermission('patient.creat')` is a compile error rather than a
 * runtime 403 that nobody notices until a receptionist cannot register anyone.
 *
 * Absence is denial. A role that does not appear in a permission's grant list
 * does not have it. There is no ❌ to write down, which is deliberate — the
 * document says "Default to denial", and a matrix where denial requires an
 * explicit entry is a matrix where a forgotten entry means access.
 */

/** The 7 roles. `cashier` is not among them: the receptionist is the cashier. */
export const ROLES = [
  {
    code: 'admin',
    name: 'Administrator',
    description:
      'Configuration, users, prices, reports, read-all. Cannot write clinical records (R2).',
  },
  {
    code: 'receptionist',
    name: 'Receptionist / Cashier',
    description: 'Registration, visits, billing, payments. No clinical access.',
  },
  {
    code: 'nurse',
    name: 'Nurse',
    description: 'Vitals, triage, allergies. Limited clinical read (R7).',
  },
  {
    code: 'doctor',
    name: 'Doctor / Consultant',
    description: 'Full clinical record. Prescribes, diagnoses, orders labs.',
  },
  {
    code: 'lab_tech',
    name: 'Lab technician',
    description: 'Lab queue, samples, results.',
  },
  {
    code: 'pharmacist',
    name: 'Pharmacist',
    description: 'Dispensing, pharmacy till. Sees drugs + allergies only (R6).',
  },
  {
    code: 'management',
    name: 'CEO / Management',
    description: 'Read-only reports and audit. No patient-level clinical access.',
  },
] as const satisfies ReadonlyArray<{ code: string; name: string; description: string }>;

export type RoleCode = (typeof ROLES)[number]['code'];

/**
 * The rules that qualify a grant, from the Rules section of the document.
 *
 * R1 and R3 are deliberately absent. R1 ("every clinical read is audited, none
 * are blocked") and R3 ("doctors get unrestricted history, fully logged") do
 * not restrict access — they mandate logging. Storing them as conditions would
 * make the guard treat an unrestricted read as gated, which is exactly the
 * obstruction R1 exists to prevent. They are implemented by the AuditInterceptor
 * in tasks 1.4 and 1.5.
 */
export type RuleCode = 'R2' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9' | 'R10' | 'R11' | 'R12';

/**
 * An unconditional grant — ✅ in the document. Reads as `admin: YES`.
 * Stored as NULL in RolePermission.condition.
 */
const YES = null;

/** null = unconditional (✅). A rule code = ⚠️, allowed only within that rule. */
type Grant = typeof YES | RuleCode;

/** Absent role = denied. */
type Grants = Partial<Record<RoleCode, Grant>>;

/**
 * Every row of the document, in document order.
 *
 * `satisfies` rather than a type annotation, so the keys stay a literal union
 * for PermissionCode below instead of widening to string.
 */
export const PERMISSION_MATRIX = {
  // ---- 1. Authentication & Users -------------------------------------------
  'auth.login': {
    admin: YES,
    receptionist: YES,
    nurse: YES,
    doctor: YES,
    lab_tech: YES,
    pharmacist: YES,
    management: YES,
  },
  /**
   * "Who am I" — GET /auth/me. Every authenticated user reads their own identity
   * and role list so the web app can render the right menu (task 1.6). Granted to
   * all 7 roles for the same reason as auth.login: it is a thing every logged-in
   * user does, and modelling it as a permission keeps the invariant that every
   * route names one — rather than an escape hatch that lets a route skip the check.
   * It gates nothing sensitive; roles returned here are for nav, never for access,
   * which the server still decides per endpoint.
   */
  'auth.me': {
    admin: YES,
    receptionist: YES,
    nurse: YES,
    doctor: YES,
    lab_tech: YES,
    pharmacist: YES,
    management: YES,
  },
  'user.create': { admin: YES },
  /** List and view staff accounts — the admin user-management screens (task 1.7). */
  'user.read': { admin: YES },
  'user.edit': { admin: YES },
  'user.deactivate': { admin: YES },
  'user.reset_password': { admin: YES },
  'role.assign': { admin: YES },

  // ---- 2. Configuration ----------------------------------------------------
  'facility.manage': { admin: YES },
  'department.manage': { admin: YES },
  'room.manage': { admin: YES },
  'practitioner.manage': { admin: YES },
  /** Consultation fees. */
  'service.manage': { admin: YES },
  'price.change': { admin: YES },
  /** Formulary. Pharmacist proposes, admin approves (R9). */
  'drug.manage': { admin: YES, pharmacist: 'R9' },
  /**
   * Reading the formulary in order to prescribe from it (task 4.7).
   *
   * `drug.manage` is EDITING the catalogue — admin, and the pharmacist under R9's
   * propose-don't-commit. It left the doctor unable to look a drug up, which is the one
   * thing the catalogue exists for. Absence is denial, so until now there was no way for
   * a prescriber to see the list at all.
   *
   * The nurse holds it because R7 says so in as many words: "Nurse sees vitals and
   * allergies, PLUS THE DRUG LIST." The receptionist does not — she bills from the service
   * catalogue, not the formulary. A drug row carries no patient data, so nothing here is a
   * confidentiality question; it is only about who has a reason to look.
   */
  'drug.read': { admin: YES, nurse: YES, doctor: YES, pharmacist: YES },
  /** Test catalog. Lab proposes, admin approves (R9). */
  'labtest.manage': { admin: YES, lab_tech: 'R9' },
  /** Insurance panels. Open question 5: may not exist at Farhat. */
  'panel.manage': { admin: YES },
  'template.manage.own': { admin: YES, doctor: YES },
  'template.manage.shared': { admin: YES },
  /**
   * Listing the templates you may pick from (task 4.4).
   *
   * Did not exist until templates did, and absence is denial — so nobody could read one
   * at all. The two `manage` rows above are about WRITING them; "see the list I choose
   * from" is not managing anything, and reading a template reveals no patient data, only
   * a phrase somebody found worth saving. The narrowing that matters is not in this row
   * but in the query: a doctor sees the shared templates and their own, never a
   * colleague's private ones.
   */
  'template.read': { admin: YES, nurse: YES, doctor: YES },
  'setting.manage': { admin: YES },

  // ---- 3. Patient ----------------------------------------------------------
  'patient.create': { receptionist: YES },
  'patient.edit_demographics': { admin: YES, receptionist: YES },
  /**
   * Free-text search over the whole patient register (task 6b.9).
   *
   * Narrowed from every clinical role to the two that actually go looking for a patient
   * who is not already in front of them: the desk finds who is walking in, a doctor or
   * nurse pulls up a name mid-consult. The lab tech and the pharmacist work their own
   * queue — a lab order or a prescription that already names a patient — and never had a
   * reason to browse the register by name; `patient.read_demographics` still lets either
   * open the patient THEIR queue handed them, which is a different, task-scoped act from
   * typing a name into a box that searches everyone.
   */
  'patient.search': {
    admin: YES,
    receptionist: YES,
    nurse: YES,
    doctor: YES,
  },
  'patient.read_demographics': {
    admin: YES,
    receptionist: YES,
    nurse: YES,
    doctor: YES,
    lab_tech: YES,
    pharmacist: YES,
  },
  /**
   * The confidentiality core. Doctor is unconditional: R1 audits the read, it
   * does not gate it — a doctor is never made to ask permission to read the
   * record of a patient sitting in front of them.
   */
  'patient.read_clinical': {
    admin: 'R2',
    nurse: 'R7',
    doctor: YES,
    lab_tech: 'R8',
    pharmacist: 'R6',
  },
  /** > 1 month. Doctor unconditional per R3; the gate is on bulk export (R11). */
  'patient.read_history': { admin: 'R2', doctor: YES },
  'patient.merge_duplicates': { admin: YES },
  /** entered_in_error. */
  'patient.void': { admin: YES },
  /**
   * R4 — nobody, ever. Granted to no role, deliberately.
   *
   * Seeded with zero grants rather than omitted so that "who can delete a
   * patient?" is an answerable question with an empty answer, instead of a
   * silence that could mean nobody asked. Note the real defence is that no
   * delete endpoint exists and none will be built; this row is the record of
   * that decision, not the enforcement of it.
   */
  'patient.delete': {},
  'allergy.record': { nurse: YES, doctor: YES },
  /** R6 — the pharmacist MUST see this. Dispensing without allergies is unsafe. */
  'allergy.read': { admin: YES, nurse: YES, doctor: YES, pharmacist: YES },

  // ---- 4. Visit & Queue ----------------------------------------------------
  'visit.create': { receptionist: YES },
  'visit.read_queue': {
    admin: YES,
    receptionist: YES,
    nurse: YES,
    doctor: YES,
    management: YES,
  },
  'visit.change_status': { receptionist: YES, nurse: YES, doctor: YES },
  /**
   * Writing what the patient came in with (task 4.4).
   *
   * The desk types a complaint at check-in under `visit.create`, and it is whatever the
   * patient managed to say at a busy window — "not feeling well", or nothing. The doctor
   * then writes what is actually wrong, in the words the record needs, and that is a
   * different act by a different person on a visit that already exists.
   *
   * Not folded into `visit.change_status`: moving a patient along and documenting them are
   * not the same authority, and the receptionist holds the first. Not folded into
   * `clinical_note.write` either — that is the psychiatric note, denied even to admin
   * (R2), and a chief complaint is not that sensitive.
   */
  'visit.record_complaint': { nurse: YES, doctor: YES },
  'visit.cancel': { admin: YES, receptionist: 'R5' },
  /** entered_in_error. */
  'visit.void': { admin: YES },
  /**
   * The doctor holds this alongside the desk (task 3.10), and deliberately.
   *
   * A follow-up is decided in the consulting room — "come back on the fifth" — and the
   * only moment it is certain to be recorded is while the patient is still sitting
   * there. Routing it through the desk alone means the appointment exists as something
   * the patient was told, and a patient who leaves past a busy window never books it.
   * Booking is not the same authority as taking money: nothing here touches a till.
   */
  'appointment.create': { receptionist: YES, doctor: YES },
  /**
   * Reading the appointment book is the same kind of act as reading the queue, so it
   * carries the same breadth. Without it nobody could see a booking at all — absence is
   * denial, and this permission simply did not exist until the book did.
   */
  'appointment.read': {
    admin: YES,
    receptionist: YES,
    nurse: YES,
    doctor: YES,
    management: YES,
  },
  'appointment.cancel': { admin: YES, receptionist: YES },
  /**
   * Separate from cancel because the two mean different things and the difference is
   * worth measuring: cancelled is "they told us", no-show is "they never came". The desk
   * holds it because the desk is what knows who walked through the door.
   */
  'appointment.mark_no_show': { admin: YES, receptionist: YES },

  // ---- 5. Clinical record --------------------------------------------------
  // Farhat is a psychiatric hospital. A leaked diagnosis does real harm in a
  // small community. Default to denial.
  'vitals.record': { nurse: YES, doctor: YES },
  'vitals.read': { admin: 'R2', nurse: YES, doctor: YES },
  'diagnosis.record': { doctor: YES },
  'diagnosis.read': { admin: 'R2', doctor: YES },
  'clinical_note.write': { doctor: YES },
  /**
   * Denied even to admin — the one clinical read R2 does not grant them.
   * Psychiatric notes are the most sensitive artefact in the building.
   * If you are tempted to add `admin` here, re-read R2 first.
   */
  'clinical_note.read': { doctor: YES },
  'attachment.upload': { nurse: YES, doctor: YES, lab_tech: YES },
  'attachment.read': { admin: 'R2', nurse: YES, doctor: YES },

  // ---- 6. Prescription -----------------------------------------------------
  'prescription.write': { doctor: YES },
  /** Pharmacist is unconditional here: the drug list IS what R6 grants them. */
  'prescription.read': { admin: 'R2', nurse: 'R7', doctor: YES, pharmacist: YES },
  'prescription.print': { receptionist: YES, doctor: YES, pharmacist: YES },
  'prescription.cancel': { doctor: 'R5' },
  /**
   * Drug interaction check (task 2.11). A prescribing-safety read: given the drugs
   * on (or headed for) a prescription, return the seeded dangerous pairs among them.
   * The doctor PRESCRIBES and the pharmacist DISPENSES — both must see the warning,
   * so both hold it unconditionally, alongside admin. It is not on drug.manage: that
   * is formulary editing (admin + pharmacist) and would wrongly 403 the doctor, the
   * one person the check exists to warn. It reveals no patient data — only that two
   * catalog drugs interact — so no clinical-confidentiality rule gates it.
   */
  'interaction.check': { admin: YES, doctor: YES, pharmacist: YES },
  /**
   * The recall list (task 4.15) — who was told to come back, and by when.
   *
   * Its own permission rather than a second use of `appointment.read`, because it is a
   * different list about different people. The book knows who made an appointment; this
   * knows who was told to return, which at Farhat is most of them and overlaps the book
   * hardly at all. Overloading `appointment.read` would make this file — the one document
   * that answers "who can see what" — quietly untrue.
   *
   * THE RECEPTIONIST HOLDS IT, and that is the point of the feature: the desk is who rings
   * a patient who did not come back. The doctor holds it because the plan was theirs. Admin
   * under R2, read and never write.
   *
   * MANAGEMENT DOES NOT. Every other list they hold is counts and money; this is named
   * patients with phone numbers and the name of the psychiatrist who saw them, and there is
   * no operational question that needs the names to answer it.
   */
  'follow_up.read': { admin: 'R2', receptionist: YES, doctor: YES },

  // ---- 7. Laboratory -------------------------------------------------------
  'lab_order.create': { doctor: YES },
  'lab_order.read_queue': { admin: YES, receptionist: 'R8', doctor: YES, lab_tech: YES },
  /** Nurse's R9 looks wrong — see OPEN QUESTIONS at the foot of this file. */
  'lab.collect_sample': { nurse: 'R9', lab_tech: YES },
  'lab.enter_result': { lab_tech: YES },
  /** Open question 1: the same tech enters and verifies. Real labs separate these. */
  'lab.verify_result': { lab_tech: YES },
  'lab.print_result': { receptionist: YES, doctor: YES, lab_tech: YES },
  'lab_result.read': { admin: 'R2', nurse: 'R7', doctor: YES, lab_tech: YES },
  /** R4 — an amendment is a new record; the original stays visible. */
  'lab.amend_result': { lab_tech: 'R4' },

  // ---- 8. Pharmacy ---------------------------------------------------------
  'pharmacy.read_queue': { admin: YES, pharmacist: YES },
  'pharmacy.dispense': { pharmacist: YES },
  'pharmacy.return_medicine': { pharmacist: 'R5' },

  // ---- 9. Billing ----------------------------------------------------------
  'invoice.create': { receptionist: YES, pharmacist: YES },
  /**
   * Pharmacist is R12 here, not YES — see R12 below. Every OTHER role that holds this
   * (admin, receptionist, management) reads any origin.
   */
  'invoice.read': { admin: YES, receptionist: YES, pharmacist: 'R12', management: YES },
  /**
   * Task 6b.9 — the facility-wide register (`GET /invoices`, no invoice id), split off
   * from `invoice.read`. Every OTHER `invoice.read` route already names one invoice or one
   * visit the caller reached through their own work — a bill Collections showed them
   * unpaid, a visit they are servicing — and stays theirs. Browsing every bill the
   * facility has ever raised, filterable by day, is a different act: it is how a
   * receptionist would back into the hospital's revenue, which Farhat's owner and
   * management were explicit is not the front desk's to see.
   *
   * Pharmacist is R12 here too (see below) — the register they may still browse excludes
   * lab bills, same as everywhere else `invoice.read`/`invoice.list` reaches.
   */
  'invoice.list': { admin: YES, pharmacist: 'R12', management: YES },
  'invoice.print': { receptionist: YES, pharmacist: YES },
  'payment.receive': { receptionist: YES, pharmacist: YES },
  'payment.refund': { admin: YES, receptionist: 'R5', pharmacist: 'R5' },
  'refund.print': { receptionist: YES, pharmacist: YES },
  /** R10 — 10% ceiling at the till. Uncapped discount authority leaks cash. */
  'discount.apply': { admin: YES, receptionist: 'R10', pharmacist: 'R10' },
  'discount.approve_over_threshold': { admin: YES },
  'invoice.void': { admin: YES },
  /**
   * A lab order's own bill — read it, and take payment for the tests a patient chooses
   * (5.6's per-line settlement). Its own permissions, not folded into `invoice.read` /
   * `payment.receive`: a pharmacist holds both of those for their own till, but R12 says a
   * lab bill is not theirs to see at all, and a permission a pharmacist held unconditionally
   * cannot be the one this gates on. Management reads (oversight, like everything else
   * money); it does not collect (nobody at the till desk is management).
   */
  'lab_charge.read': { admin: YES, receptionist: YES, management: YES },
  'lab_charge.collect': { receptionist: YES },

  // ---- 10. Reports, audit & data -------------------------------------------
  /** Census, wait times. */
  'report.operational': { admin: YES, receptionist: 'R8', management: YES },
  'report.financial': { admin: YES, management: YES },
  /** Counts, no names. */
  'report.clinical_aggregate': { admin: YES, doctor: YES, management: YES },
  'audit_log.read': { admin: YES, management: YES },
  /** R11 — the real defence against someone walking off with the patient list. */
  'data.export': { admin: 'R11' },
} as const satisfies Record<string, Grants>;

export type PermissionCode = keyof typeof PERMISSION_MATRIX;

/**
 * Splits 'patient.read_clinical' into resource 'patient', action
 * 'read_clinical' for the Permission table's columns.
 *
 * First dot only, because 'template.manage.own' is the template resource with
 * a 'manage.own' action, not a 'template.manage' resource.
 */
export function splitPermissionCode(code: string): { resource: string; action: string } {
  const dot = code.indexOf('.');
  if (dot <= 0 || dot === code.length - 1) {
    throw new Error(`Permission code "${code}" must look like "resource.action"`);
  }
  return { resource: code.slice(0, dot), action: code.slice(dot + 1) };
}

/* -----------------------------------------------------------------------------
 * OPEN QUESTIONS carried over from roles-and-permissions.md — for the hospital,
 * not for us to answer by guessing:
 *
 *  - `lab.collect_sample` grants the nurse ⚠️ R9, but R9 is "propose additions
 *    to the formulary or test catalog; admin approves". That rule has nothing
 *    to do with collecting a sample. Transcribed as written rather than
 *    silently corrected, because guessing at a permission rule is how you end
 *    up with a matrix nobody trusts. Likely a typo for R8 (task-scoped) — needs
 *    confirming.
 *  - `lab.verify_result`: the same tech enters and verifies. If Farhat has a
 *    lab supervisor this needs a `lab_supervisor` role (doc question 1).
 *  - R7 may be too tight if nurses assist in consultations (doc question 3).
 *  - No "break glass" emergency access exists (doc question 7). Recommended by
 *    the document, not yet specified, not built.
 * -------------------------------------------------------------------------- */
