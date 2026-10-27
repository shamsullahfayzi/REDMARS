# CRM Module 8 — Lead-to-patient linking

## Ownership and workflow

The existing patient master owns registration, duplicate scoring, stable patient
IDs and MRNs. CRM records a mapping from a qualified lead through its contact's
patient relationship. Source, qualification and status history remain on the lead.
There is no automatic patient merge or automatic clinical visit.

Agents link only their assigned qualified leads and currently verified,
authorized patient relationships. Administrators can link across CRM owners.
Both identity confirmation and duplicate review are required. Phone matching
alone never establishes identity. New registration additionally requires the
existing `patient.create`, `patient.search` and `crm.contacts.authorize` grants;
no clinical registration grant is added to call-center roles. Users with combined
registration and CRM authorization roles can register within the lead detail.
Other users use the existing reception workflow, then authorize the contact link.

Registration and mapping share one audited transaction and an idempotency key.
The existing patient form and duplicate warning are reused. All duplicate
candidates require explicit review before creating a separate person. A new
contact relationship starts with pending authority, requiring separate approval.

Correction revokes the mapping with a coded reason, timestamp and actor. It
preserves patient records, appointments, contact relationships and lead history.
An administrator reviews those independent records if they also need correction.
An active mapping prevents changing the lead's contact. One active mapping per
lead is enforced by a partial unique index; facility/patient foreign keys prevent
cross-facility references. Version checks and serializable transactions protect
simultaneous requests. No destructive rollback migration is provided.

## API and UI

`GET /crm/leads/:id/patient` returns minimal authorized patient identities,
candidates and mapping history. POST suffixes `link`, `register`, and `unlink`
apply strict shared contracts, CRM module guards, rate limiting, role checks,
facility filtering, idempotency and transactional audit. Patient details are
hidden when authority or verification expires; the UI also expires visible data.
The lead detail contains the workflow in English, Dari and Pashto.

## Release checks

Implementation verification is in progress. Test fixtures stay in the isolated
test database. Before main deployment, validate a backup and restored upgrade,
run affected integration suites and builds, and demonstrate link/correction in
the browser. Hospital acceptance is a separate user step.

Rollback: disable CRM and restore the prior application while preserving the
additive mapping table and its audit trail. A full database restore is a recovery
operation requiring reconciliation of any later writes.
