# Synthetic demo data

Created 2026-10-17 at the user's request for ten test records per implemented module.

## Access

Open http://127.0.0.1:5173/login and sign in with a demo account. Existing hospital
accounts remain scoped to their original facility and will not show this data.
The demo facility is `AXON_DEMO_10`, named **AXON DEMO — Synthetic testing only**.
Usernames: `demo_admin`, `demo_reception`, `demo_doctor`, `demo_agent`,
`demo_reviewer`. The generated password is in the ignored local file
`.test-runtime/demo-credentials.json`; it is not committed here.

## Records

Ten each: patients, appointments, OPD visits, emergency visits, prescriptions,
lab orders/tests, services, invoices, payments, panels, suppliers, supplier bills,
direct expenses, manual journals, cost centres, payroll employees, payroll items,
assets, budgets, CRM contacts, leads, call interactions, calls and tasks.
One payroll calculation contains the ten employee items.

Financial source documents generate 60 balanced journals. Thirty billing/payment
and manual journals are posted through a distinct demo reviewer; thirty bill,
expense and acquisition journals remain drafts for testing approval. Reports
derive from those transactions. CRM tasks include overdue and upcoming dates.
Contacts are marked do-not-contact and use no real phone numbers.

Reserved HR, IPD admissions and radiology workflows have no implemented records
to seed. This does not implement those modules.

## Verification and maintenance

- `node scripts/seed-demo.cjs`: local-only, dedicated facility, stable command keys;
  preserves existing demo records on rerun. No hospital records are seeded.
- `node scripts/verify-demo.cjs`: verifies five logins and their facility, module
  endpoints, CRM counts, journal balances and web availability.
- Both scripts passed; a subsequent seed run retained the same counts.
- Count manifest: `.test-runtime/demo-manifest.json`.
- Validated pre-change backup: `.test-runtime/redmars-before-demo-20261017.dump`.
- Existing CRM Tasks migration `20261016090000_crm_tasks` was deployed, and the
  API restarted to expose the already-built task endpoints.

Do not run a global database reset to remove the demo. Disable its accounts and
facility when finished; any deletion must be scoped to this fixture and respect
the ledger's immutable posted records. Restoring the full backup would also
discard later hospital changes and requires a separate explicit request.
