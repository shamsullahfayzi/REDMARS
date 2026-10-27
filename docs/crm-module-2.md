# CRM Module 2 — Contacts and family management

## Scope and contract

Reuse Patient as the registry and existing CRM guards, rate limits and transactional audit. Add facility-owned contacts, many-to-many patient relationships, append-only consent decisions and caller verification records. Contacts never create patients or alter clinical records.

Admin and call-centre users can search, create and edit contacts, record consent and verify callers. Only administrators link an existing patient (exact MRN and full name), approve a relationship's scheduling/follow-up scope, or revoke it. Relationship does not imply authority. All changes require the current contact version; shared phones remain valid after explicit duplicate review. Archive is reversible and blocks contact eligibility.

Preferences include language, channel, safe instructions and a global do-not-contact switch. Consent is explicit per channel and purpose, with source, actor and server time; patient-specific purposes require a relationship. Withdrawal appends history. Missing consent is not permission. Changing a phone or email invalidates prior consent for that channel through the saved destination snapshot.

Caller verification is a staff attestation using an inspected identity document or the hospital's approved identity questions, with separate identity and authorization checks. No answers or document numbers are stored. A phone match cannot verify identity. Checks expire after 15 minutes, belong to the verifying staff member, and are invalidated by contact changes or failed checks. Agents receive only authorized patient name/MRN after a current successful check. No clinical or financial projections are added.

Endpoints under `/crm/contacts`: bounded search, detail, create/update; relationship creation/update; consent history/recording; verification recording. Every endpoint uses facility/module/RBAC/rate-limit guards. Read audits contain metadata; mutation audits retain status/provenance and redact contact details. Composite foreign keys prohibit cross-facility relationships. No outbound messages are sent in Module 2.

## Validation plan

Use the isolated test database for API workflows and security cases: shared phones and duplicate review, multiple patient links, unknown/withdrawn consent, destination changes, stale writes, caller-check expiry/failure/staff isolation, restricted clinical data, facility boundaries, module disable and audit privacy. Build API/shared/web; run selected patient, follow-up, appointment and finance regression suites. Demo with synthetic data only.

## Rollback

Disable CRM in Modules to stop all CRM API access immediately. Retain additive tables and consent/audit history. Revert application changes to the Module 1 build if needed; existing patient and finance tables are not rewritten. Take a verified backup before applying the additive migration. Dropping CRM tables is a separate destructive operation and is not the operational rollback.

## Results

Completed 2026-10-14. Shared, API and web builds passed. Selected regression run:
10 suites / 173 tests passed, covering CRM foundation and contacts, patient
registration/search/edit/duplicates, reception, appointments, follow-ups and
finance foundation. Shared contracts: 28 passed. Unit tests: 3 passed, including
CRM audit redaction and error-log privacy. New API files pass targeted lint;
web lint has the existing `button.tsx` fast-refresh warning. Vite retains its
existing large-bundle warning.

Browser demo passed with synthetic records in `finance_foundation_test`:

1. Created a family contact, linked the existing demo patient by MRN/full name.
2. Approved scheduling scope separately from consent.
3. Recorded consent and a successful caller check; scheduling showed ready while
   follow-up remained unauthorized.
4. Withdrew consent; readiness became blocked and both decisions remained in history.
5. Created a different person sharing the same phone after duplicate review.
6. Checked Dari layout and call-centre access: no authorization/link controls,
   no Patients navigation, patient reference hidden without that agent's check.

Browser testing caught and corrected missing form submit types and duplicate
React form keys. Final web build passed after both corrections. Synthetic preview
records were removed and preview servers stopped; main API/web return HTTP 200.

Migration `20261014120000_crm_contacts` is applied to both databases (39 total).
Backup: `.test-runtime/redmars-before-crm2-20261014.dump`, 439,378 bytes;
`pg_restore --list` validated its archive structure. This is not a full restore rehearsal.

## Files changed

- Prisma schema and `20261014120000_crm_contacts/migration.sql`: additive tables,
  composite facility foreign keys, checks and permission grants.
- CRM contacts controller/service/module and `auth/permissions.ts`: scoped API,
  authorization, consent and verification rules.
- Shared `crmContacts.ts`/index: request and response contracts, phone normalization.
- `transactional-audit.ts`, exception filter and their unit tests: safe logging.
- `CrmContacts.tsx`, `CrmPage.tsx`, en/prs/ps locales: forms, history and readiness.
- CRM API/shared tests, role documentation, assessment and AGENTS instructions.

## Operational limits and UAT

Caller verification records a staff attestation, not automated identity proof.
The hospital must approve identity questions, document-check practice and the
evidence needed for patient/guardian authorization. Do not record secret answers
or clinical information in safe-contact instructions. Consent history is retained;
there is no merge, bulk import or outbound delivery in this module. Those later
roadmap capabilities remain separate work. Alternative phone is recorded for
reference; readiness uses the primary phone or email with matching consent.

Duplicate review detects normalized exact names, phone formatting variants and
case-insensitive email matches. It does not infer country codes or automatically
merge people. Refresh a contact after a conflict before re-entering a change.

To test: open `/crm`, create a contact, then (as admin) link an existing patient
using exact MRN/full name and authorize a scope. Record channel/purpose consent,
perform the caller check, and confirm readiness. Withdraw consent or enable
do-not-contact and confirm communication becomes blocked. User acceptance and
hospital SOP signoff remain operational steps; Module 3 has not started.
