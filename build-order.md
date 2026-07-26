# REDMARS HMIS — Build Order (v1, OPD)

> **How to use this.** Open it every morning. Do the lowest-numbered unfinished task.
> Don't skip ahead. Don't build "all the tables" or "all the endpoints" — each phase is a
> **vertical slice** (DB → API → UI) that is demoable on its own.
>
> **Roles (6):** `admin` · `receptionist` (= cashier) · `doctor` · `lab_tech` · `pharmacist` · `management`
>
> **Budget:** ~420 focused hours. At 8–10 h/day, 6 days/week → ~9 weeks.
> **The line that matters:** after Phase 4, Farhat could actually use this. Everything after
> that is upside. If you fall behind, you cut from Phase 6 backwards — never from Phase 7.

---

## Phase 0 — Foundation (~30 h)

Nothing works yet. This is the runway.

| # | Task | Touches | Done when |
|---|---|---|---|
| 0.1 | Monorepo scaffold: `apps/api`, `apps/web`, `packages/shared` | — | `pnpm dev` starts both |
| 0.2 | Postgres + Adminer in `docker-compose.yml` | — | `docker compose up` gives you a DB |
| 0.3 | Prisma init, paste `schema.prisma`, first migration | 43 tables | `prisma migrate dev` runs clean |
| 0.4 | NestJS skeleton: config module, health endpoint, global error filter | — | `GET /health` returns 200 |
| 0.5 | React + Vite + Tailwind + shadcn/ui + router | — | Blank shell app loads |
| 0.6 | i18next + RTL: Dari/English toggle, `dir="rtl"` flips the layout | — | Toggle flips the whole UI |
| 0.7 | TanStack Query + typed API client generated from Prisma types | `packages/shared` | Types shared front↔back |
| 0.8 | Seed script skeleton: 1 facility, departments, 1 admin user | Facility, Department, AppUser | `pnpm seed` populates a usable DB |
| 0.9 | `pg_dump` backup script + cron in compose | — | A `.sql.gz` lands in `/backups` nightly |

> **0.6 is not optional and not deferrable.** Retrofitting RTL into a built UI is a
> multi-week rewrite. Get it right on the blank shell.

---

## Phase 1 — Auth & RBAC (~40 h)

The security spine. Everything after this depends on it.

| # | Task | Touches | Done when |
|---|---|---|---|
| 1.1 | Password hashing (argon2), login endpoint, JWT + refresh token | AppUser, Session | `POST /auth/login` returns tokens |
| 1.2 | Seed the 6 roles and ~60 permissions from `roles-and-permissions.md` | Role, Permission, RolePermission | DB has the full matrix |
| 1.3 | **`PermissionsGuard`** — a NestJS guard reading `@RequirePermission('patient.create')` | — | A doctor calling a receptionist endpoint gets 403 |
| 1.4 | **`AuditInterceptor`** — writes AuditLog on every mutating request | AuditLog | Every write leaves a row with before/after |
| 1.5 | Audit **reads** of clinical endpoints (Rule R1) | AuditLog | Opening a patient record logs `action: read` |
| 1.6 | Login screen, auth context, protected routes, role-based nav | — | Each role sees only their own menu |
| 1.7 | User management screens (admin only) | AppUser, UserRole | Admin can create a doctor and they can log in |
| 1.8 | Session expiry, refresh flow, logout, "logged in elsewhere" handling | Session | Token expiry doesn't dump the user mid-consult |

> **Do not defer 1.3–1.5.** Bolting RBAC and audit onto a finished app means touching
> every endpoint twice. Build them before there are endpoints to touch.

---

## Phase 2 — Master data (~40 h)

Boring. Unskippable. Every later phase reads from these tables.

| # | Task | Touches | Done when |
|---|---|---|---|
| 2.1 | Departments + rooms CRUD | Department, Room | Admin can add "OPD-2" |
| 2.2 | Specialities + practitioners CRUD, link practitioner ↔ user | Practitioner, Speciality, PractitionerDepartment | A doctor exists and is assigned to OPD *and* IPD |
| 2.3 | Services + fees CRUD (consultation, card registration) | Service | Admin can set the OPD consultation fee |
| 2.4 | **Drug formulary CRUD** + import from CSV | Drug | 200+ drugs loaded, searchable |
| 2.5 | Seed formulary from **MoPH Essential Medicines List** + Farhat's actual psych drugs | Drug | The drugs Dr. H prescribes are all in there |
| 2.6 | Drug default route/frequency/duration on every row | Drug | Picking duloxetine autofills OD / oral / 1 month |
| 2.7 | Lab test catalog + panels + prices | LabTest, LabPanel, LabPanelTest | "LFT" exists and expands to 5 tests |
| 2.8 | Reference ranges per test (sex/age) | ReferenceRange | Hb 11 flags **L** for a man, normal for a woman |
| 2.9 | ICD-10 seed (import WHO file) + search | IcdCode | Typing "depress" suggests F32.x |
| 2.10 | `NumberSequence` service: MRN, visit no, invoice no, lab order no | NumberSequence | Numbers are gapless and per-year |
| 2.11 | Drug interaction seed — top ~50 psych interactions only | DrugInteraction | SSRI + MAOI fires a warning |
| 2.12 | `FacilityModule` seed + admin toggle screen (lab/pharmacy/ipd/etc.) | FacilityModule | Admin flips "lab" on/off for a facility |
| 2.13 | **`ModuleGuard`** — 403s endpoints of disabled modules; nav hides them | FacilityModule | A hospital without `lab` gets 403 on lab routes, even hand-crafted |

> **2.12–2.13:** module boundaries must be clean — if billing secretly needs the lab module,
> disabling lab breaks billing. Your schema avoids this by hanging everything off `Visit`, not
> off sibling modules. Keep it that way. UI hiding is courtesy; the guard is the control.

> **2.11 honesty check.** This is a *warning aid*, not a safety net. Put a line in the UI
> saying so. A half-complete checker that looks complete breeds false confidence, which is
> worse than no checker at all.

---

## Phase 3 — Registration, Visit & Queue (~60 h)

First slice a human can actually use.

| # | Task | Touches | Done when |
|---|---|---|---|
| 3.1 | Patient create: full form (prefix, guardian + S/o D/o W/o, DOB **or** est. yrs/months/days) | Patient | Receptionist registers a walk-in |
| 3.2 | Patient search: by name, **MRN, and phone** | Patient | Finds "Najila" among 12 Najilas by phone |
| 3.3 | Duplicate detection on create (fuzzy name + phone) | Patient | Warns before creating a second Najila |
| 3.4 | Patient edit + `PatientIdentifier` (legacy Medi-Pro no.) | PatientIdentifier | Old patient numbers preserved |
| 3.5 | **Visit create**: type, department, doctor, chief complaint, referral | Visit | Visit exists with status `arrived` |
| 3.6 | **Registration + visit + invoice + payment on ONE screen** | Visit, Invoice, InvoiceItem, Payment | One save: patient registered, visit created, bill printed, cash logged |
| 3.7 | Doctor's queue screen — reads `(facilityId, practitionerId, status, startedAt)` | Visit | Doctor sees today's arrived patients |
| 3.8 | Queue auto-refresh (poll every 5–10 s) | — | New registration appears without a reload |
| 3.9 | Visit status transitions + `VisitStatusHistory` | Visit, VisitStatusHistory | arrived → in_progress → completed, all logged |
| 3.10 | Appointments: create, list, mark no-show | Appointment | Optional; a visit works fine without one |
| 3.11 | Visit cancel + refund (Rule R5, same-day, reason required) | Visit, Payment | Cancelled visit refunds and logs why |

> **3.6 is the shape of your reception desk.** Not four screens. One.
> **3.8 is the "sync" you worried about three weeks ago.** It's a `setInterval`. That's all.

---

## Phase 4 — Consultation & Prescription (~70 h) ⭐

**This is the phase that makes the system worth using.** Nail it.

| # | Task | Touches | Done when |
|---|---|---|---|
| 4.1 | Consult screen shell — patient header, tabs, **keyboard-first** | Visit | Doctor opens a patient from the queue |
| 4.2 | **Hotkeys**: F2 save & continue, F4 save & print, F9 save & exit, Esc | — | Doctor never touches the mouse |
| 4.3 | Vitals (optional — doctor records them, no nurse role) | Vitals | BP/pulse/weight saved to the visit |
| 4.4 | Chief complaint (free text) + complaint templates | Visit, Template | "oliguria, frequency, nocturia" in 2 seconds |
| 4.5 | Diagnosis: free-text + ICD-10 autocomplete, primary flag, certainty | Diagnosis, IcdCode | Doctor types "depression", picks F32.1 |
| 4.6 | Allergy record + read; **big red banner** on the consult screen | Allergy | Penicillin allergy is impossible to miss |
| 4.7 | **Prescription table**: drug autocomplete → autofills route/freq/duration | Prescription, PrescriptionItem, Drug | 4 drugs prescribed in under 30 seconds |
| 4.8 | **Allergy check** at prescribe time — hard block, override with reason | Allergy | Prescribing penicillin to an allergic patient stops you |
| 4.9 | Drug interaction warning (soft, dismissible with reason) | DrugInteraction | SSRI + MAOI warns before save |
| 4.10 | Prescription **print** — bilingual, RTL, hospital letterhead | Prescription | A4 page Dr. H is happy to hand a patient |
| 4.11 | **Copy Last Prescription** | Prescription, Template | One click reloads last visit's drugs |
| 4.12 | Prescription templates (per doctor + shared) | Template | "Standard depression starter" in one click |
| 4.13 | Clinical note — **psych assessment / MSE / risk assessment** (jsonb) | ClinicalNote | Dr. H can write a full psychiatric assessment |
| 4.14 | Patient history panel: previous visits, diagnoses, prescriptions, results | Visit, Diagnosis, Prescription | Doctor sees the last 12 months at a glance |
| 4.15 | Follow-up date on prescription + follow-up list | Prescription | Psych patients due next month are listable |

> **🚩 MILESTONE: after 4.15, put it in front of Dr. Hafizullah and let him run a real clinic day.**
> Not a demo — a real day. Everything you learn here reshapes Phases 5–7.
> **If you are behind schedule, stop here and pilot.** A working OPD+prescription system in
> production beats a half-built full HMIS on your laptop, every single time.

---

## Phase 5 — Laboratory (~60 h)

The round-trip. Encodes the payment gate you found in the field.

| # | Task | Touches | Done when |
|---|---|---|---|
| 5.1 | Lab order from consult screen: pick tests/panels | LabOrder, LabOrderItem | Doctor orders CBC + LFT |
| 5.2 | Add `awaiting_payment` to `LabOrderItemStatus` (**schema change**) | LabOrderItem | The business rule you observed is now in the model |
| 5.3 | Order appears **instantly** in reception queue *and* lab queue | LabOrder | No buttons, no refresh — polling |
| 5.4 | Reception bills the lab order → status flips to `ordered` | Invoice, InvoiceItem, LabOrderItem | Patient pays at reception, lab unlocks |
| 5.5 | Lab queue screen: pending / collected / resulted tabs | LabOrderItem | Lab tech sees today's work |
| 5.6 | Sample collection: mark collected, print sample label | LabOrderItem | Barcode/label on the tube |
| 5.7 | **Result entry = printing.** One action produces the hard copy AND the record | LabResult | Lab tech types values, hits F4, printer runs |
| 5.8 | Auto-flag abnormal via `ReferenceRange` | LabResult, ReferenceRange | H / L appear without anyone deciding |
| 5.9 | Result verification step | LabResult | ❓ pending answer on whether Farhat has a supervisor |
| 5.10 | Result flows back to the doctor's screen on the same visit | LabResult, Visit | Doctor sees it without a phone call |
| 5.11 | Result amendment (never overwrite — Rule R4) | LabResult | Corrections leave a visible trail |
| 5.12 | Lab report print — bilingual, with reference ranges shown | LabResult | Patient gets the paper they expect |

> **5.7 is the argument you're going to have with the lab staff.** They told you the tech
> "only prints the hard copy and leaves the soft version." That describes their *old tool*,
> where entering and printing were two chores. Here they're one. There is no soft version
> to skip, because it's a byproduct of the only action they take. Build it that way, then
> show them.

---

## Phase 6 — Billing & Pharmacy queue (~50 h)

| # | Task | Touches | Done when |
|---|---|---|---|
| 6.1 | Invoice list, detail, print (bilingual receipt) | Invoice, InvoiceItem | Receipt matches what reception hands over today |
| 6.2 | Multiple invoices per visit (consult @ reception, lab @ reception, meds @ pharmacy) | Invoice | Three tills, three bills, one visit |
| 6.3 | Payment: cash, partial payment, receipt no. | Payment | Instalments work |
| 6.4 | **Discount with 10% ceiling + mandatory reason** (Rule R10) | InvoiceItem, AuditLog | Receptionist can't zero a bill |
| 6.5 | Discount above ceiling → admin approval in-app | Invoice | Requires a second person |
| 6.6 | Refunds + refund print (Rule R5) | Payment | Same-day, reason required, logged |
| 6.7 | Panel / insurance billing | Panel, Invoice | ❓ only if Farhat actually has panels — **ask first, then build** |
| 6.8 | Pharmacy queue: prescriptions awaiting dispense | Prescription | Pharmacist sees the doctor's orders |
| 6.9 | Pharmacy sees **drugs + allergies only** (Rule R6) | Allergy | No diagnosis, no notes — verify this |
| 6.10 | Dispense + pharmacy invoice + payment at the pharmacy till | Invoice, Payment | Patient pays for medicine at the pharmacy |
| 6.11 | Medicine return (same-day, Rule R5) | Payment | Unopened box comes back, money goes back |
| 6.12 | Daily cash reconciliation per till per user | Payment | Reception and pharmacy tills balance at closing |

> **Pharmacy stock, batches, expiry, purchase orders, suppliers — NOT IN V1.**
> That's a separate module and possibly a separate product. Don't touch it.

---

## Phase 6b — Farhat's round-two fixes (~35 h)

Feedback from Dr. H and management after using Phase 1–6 for real. Mostly corrections to
things built too rigid the first time, plus two visibility gaps management flagged directly.

| # | Task | Touches | Done when |
|---|---|---|---|
| 6b.1 | Discount ceiling becomes an admin-set facility `Setting`, not a hardcoded 10% | Setting, discount.service, reception.service | Admin changes the number, reception is bound by it same day |
| 6b.2 | Registration always creates a visit — retire the no-visit `/patients/new` door | CreatePatientPage, nav | Every registered patient has a department + service line, no exceptions |
| 6b.3 | Reception check-in: minimum-mouse keyboard flow (type-ahead pickers, Enter commits, tab order matches the desk's conversation) | ReceptionPage | Whole check-in completable without touching the mouse |
| 6b.4 | Auto-start consult on first clinical write, not on page open | ConsultPage, vitals/complaint/lab-order write paths | `arrived → in_progress` fires on the first saved field, never on merely opening the chart |
| 6b.5 | Follow-up booking from the consult page; a doctor can only book themselves | BookFollowUp, appointment.service | Doctor's picker is locked to self, enforced server-side |
| 6b.6 | Lab results join patient history; print previous + current results | history.ts, HistoryTab | The gap `history.ts` flagged as "a select away when 5.10 lands" is closed |
| 6b.7 | Collections page: every unpaid lab + pharmacy bill in one list, badge for new arrivals, pay and print inline | new module | Reception finds an unpaid bill without opening the patient |
| 6b.8 | Printable patient ID card after first registration | CreatePatientPage / ReceptionPage | MRN + name on a small print sheet, handed over on first visit |
| 6b.9 | Visibility hardening: pharmacist/lab_tech lose free-text patient search; reception loses the facility-wide invoice list and any revenue total | nav.ts, permissions.ts | Neither role can see money that isn't theirs to see |
| 6b.10 | Role-specific home pages | router.tsx, HomePage | Each role lands on their actual queue, not a dashboard |

> **6b.9 is management's request, not a nice-to-have.** Farhat's owner and management both
> said explicitly that a receptionist should not be able to see the hospital's revenue.
> Don't relitigate it as an oversight.

---

## Phase 7 — Hardening, deploy, pilot (~70 h)

**Never cut this phase.** This is what separates software from a demo.

| # | Task | Done when |
|---|---|---|
| 7.1 | **Backup + tested RESTORE.** Destroy the DB, restore from backup, verify | You have personally restored from a backup |
| 7.2 | HTTPS on LAN via Caddy (self-signed), no more "Not secure" | Browser doesn't warn |
| 7.3 | Server hardening: firewall, non-root, no default passwords | — |
| 7.4 | Reports: daily census, revenue, wait times, diagnosis counts | Dr. H gets his numbers |
| 7.5 | Printer setup + print layout QA on the *actual* hospital printer | Paper looks right on real hardware |
| 7.6 | **Legacy data migration** from Medi-Pro → `PatientIdentifier` keeps old IDs | Existing patients findable by old number |
| 7.7 | Load test: 40 concurrent patients, 6 users, Tuesday-morning conditions | Doesn't fall over |
| 7.8 | Error tracking + a way to see logs without SSH | You can debug a 2 a.m. call |
| 7.9 | **Staff training** — receptionist first, she's the bottleneck | She registers a patient unaided |
| 7.10 | **Parallel run: 1 week on both systems.** Paper/Medi-Pro AND REDMARS | Nothing is lost when you switch |
| 7.11 | Go-live + 2 weeks of daily on-site bugfixing | Real patients, real days |
| 7.12 | UPS, power-loss test: pull the plug mid-transaction | No corruption |
| 7.13 | Ship backend **compiled/bundled in a container**, not readable source | No clean `git clone` of your commented TS on the hospital PC |
| 7.14 | `License` mechanism: signed token (your private key), verified **locally/offline** | Server validates without internet |
| 7.15 | Optional hardware fingerprint binding on the token | Folder copied to another PC won't start without a new token only you can sign |
| 7.16 | License **banner/nag** on admin dashboard as `paidThroughDate` nears/passes | Admins get reminded; **no clinical action is ever blocked** |

> **7.10 is not paranoia.** The day you switch off the old system, you own every failure.
> A parallel week costs you 7 days and buys you the ability to walk it back.

---

## The cut list

If you're behind at week 6, cut in this order:

1. **6.7** Panel/insurance billing
2. **5.9** Lab verification step
3. **3.10** Appointments (visits work without them)
4. **4.12** Prescription templates (Copy Last Prescription 4.11 covers most of it)
5. **6.11 / 6.12** Returns and reconciliation
6. **Phase 6 entirely** — pilot with reception billing on paper

**Never cut:** Phase 1 (auth/audit), 4.6–4.9 (allergy + interaction safety), 7.1 (backup+restore), 7.10 (parallel run).

Those four are the ones where the failure mode is a patient getting hurt or a hospital losing its records. Everything else is inconvenience.

**On licensing & copy-protection (7.13–7.16):** this is a *speed bump plus a dependency on you for updates and support*, not a vault. A determined technical person with physical control of the on-prem server can copy or crack it — that's inherent to on-premise deployment and cannot be patched away. Do not pour scarce hours into a lock that doesn't lock. The license expiry drives a **nag, never a clinical lock** — a hospital must never turn away a patient over a billing dispute, and your first customers are family hospitals. Your real protection is being the person they depend on for updates, the formulary, backups, and support: a stolen copy is a frozen, decaying snapshot with no one to call.

---

## Before you write a line of code

Answer these — they change what you build:

1. Does Farhat have panels/insurance? (kills or keeps 6.7 and the `Panel` table)
2. Does anyone verify lab results, or does the tech sign them off? (5.9)
3. Does anyone take vitals, or does the doctor? (4.3)
4. What exact fields are on Farhat's current prescription printout? **Get a photocopy.** (4.10)
5. Can you get a Medi-Pro database export? (7.6 — if not, migration is manual and Phase 7 grows)
6. Which modules does each hospital pay for, and what's the monthly fee per module? (seeds `FacilityModule` + `License`)
