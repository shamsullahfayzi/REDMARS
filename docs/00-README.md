# REDMARS operator and system documentation

Snapshot: **2026-10-31**, repository source audit. No application code or live database was changed. “Source-confirmed” describes inspected code, not a passed browser, deployment or hospital test. ⚠️ UNVERIFIED = unresolved or untested; 🚧 NOT IMPLEMENTED = absent from the inspected ownership/routes; 🐞 SUSPECTED BUG = evidence needs a focused reproduction. Testing VPS and legacy LAN deployments are distinct. Actual VPS state and actual hospital configuration are not inferred from this checkout.

**Read the Doctor onboarding explanation first:** [Day 0: supported Employee → account → Practitioner path](02-initial-setup-runbook.md#doctor-onboarding-exact-supported-path). The reported HR-first error is real; the correct normal route is **HR → Employees → Create linked account**, with a Clinical position for Doctor. A job title alone does not create a doctor login.

## Reading order

| Reader | Start here | Then read |
| --- | --- | --- |
| Hospital administrator | [Day 0](02-initial-setup-runbook.md) | [Administrator role](roles/admin.md), [dependencies](03-dependency-matrix.md), [gap report](06-gap-and-issue-report.md) |
| Reception/clinical/lab/pharmacy staff | Your role guide below | [Workflows](04-workflows.md), exact errors/actions in linked references |
| Finance/HR/management | Your role guide below | [Workflows](04-workflows.md), [permission matrix](07-permission-matrix.md), cutover/acceptance gaps |
| VPS/system operator | [Operations](05-production-operations.md) | [Testing VPS kit](../output/redmars-testing-vps-kit/GUIDE.md), backup/restore and incident sections |
| Developer/reviewer | [Raw inventory](_inventory.md) | [UI actions](_audit/ui-actions.md), [API effects](_audit/endpoint-effects.md), [gaps](06-gap-and-issue-report.md) |

## Documents

- [01 System overview, architecture, model and glossary](01-system-overview.md)
- [02 Initial setup and doctor onboarding](02-initial-setup-runbook.md)
- [03 Master dependency matrix](03-dependency-matrix.md)
- [04 End-to-end workflows and UAT scripts](04-workflows.md)
- [05 Deployment, security, backups, incidents and readiness](05-production-operations.md)
- [06 Prioritized gaps and proposed onboarding wizard](06-gap-and-issue-report.md)
- [07 All 135 permissions across all 12 roles](07-permission-matrix.md)

## Role guides

- [Auditor](roles/auditor.md)
- [Payroll officer](roles/payroll-officer.md)
- [Accountant](roles/accountant.md)
- [Finance manager](roles/finance-manager.md)
- [Administrator](roles/admin.md)
- [Receptionist / Cashier](roles/receptionist.md)
- [Nurse](roles/nurse.md)
- [Doctor / Consultant](roles/doctor.md)
- [Lab technician](roles/lab-tech.md)
- [Pharmacist](roles/pharmacist.md)
- [CEO / Management](roles/management.md)
- [Call center](roles/call-center.md)

## Coverage and limits

The source snapshot is commit **2961d61** (plus existing local unrelated deletions, left untouched). Inventory reads 422 TypeScript/TSX/Prisma source files, 119 models, 319 HTTP handlers and 34 page files. It records **414 button locations** and **1,172 total interactive JSX source locations**, including form inputs, links and submissions. Looped row controls count once per source site, not once per runtime row. Additional actions hidden in dynamically constructed components or imperative DOM require manual semantic review.

All inventoried action IDs appear in at least one role reference; the Administrator guide contains the complete inventory **for documentation coverage**, including controls the Administrator cannot use. A row is not a permission grant. **The static audit is not a fully browser-verified button-by-button manual:** only a subset has an automatically resolved endpoint chain; local actions, dynamic callbacks and compound flows explicitly retain ⚠️ UNVERIFIED fields. Refer to the [validation report](_audit/validation-report.md) for exact counts and failed/unperformed checks. Do not replace those caveats with a claim that all workflows passed.

Every permission cell is generated from the executable matrix. Actual deployed database grants, role combinations and hospital approvals can differ and must be checked. The supplied request's role list is blank, so there is no independent requested role list to reconcile; all executable roles receive a guide. Development fixtures cover seven roles while executable roles cover twelve; that is documented drift, not missing evidence silently filled in.

## Audit appendices

- [Raw roles/routes/models/source hashes](_inventory.md)
- [All interactive JSX actions](_audit/ui-actions.md)
- [Frontend API call expressions](_audit/api-calls.md)
- [Endpoint → service → direct database effects](_audit/endpoint-effects.md)
- [764 exact exception sites](_audit/validation-messages.md)
- [Environment variable names and sources](_audit/environment.md)
- [Self-check results and limitations](_audit/validation-report.md)

Machine-readable inventory and action traces live in _audit/. Scripts there only read application sources and write documentation. They do not migrate, seed, start services or alter accounts.

## Keep documentation in sync

1. When changing routes, forms, handlers, schema or permission logic, update the source first in the authorized implementation task; then regenerate documentation inventory from the reviewed revision.
2. From the repository root run **node docs/_audit/inventory.cjs**, **node docs/_audit/write-roles.cjs**, **node docs/_audit/write-operations.cjs**, **node docs/_audit/write-index-and-gaps.cjs**, then **node docs/_audit/validate.cjs**. Generation needs the already-installed API TypeScript dependency. Fix broken citations rather than guessing line numbers.
3. Review generated UI/endpoint candidates manually. Do not treat a regex/AST match as a passed behavior test. Update semantic gaps and role procedures; retain honest unresolved labels.
4. Rerun the affected technical tests in an isolated environment when application behavior changes. Record actual date, commit, scope and results; retain hospital UAT/pilot/print acceptance separately.
5. Use English labels from the current locale/source; ask hospital staff to approve Dari/Pashto wording. Keep immutable user roadmap references intact. Review generated docs before committing; this task does not commit or push them.

Optional Mermaid syntax QA uses **Mermaid 11.12.0 and jsdom 26.1.0**, temporarily installed with **npm install --prefix docs/_audit/diagram-qa --no-save --package-lock=false mermaid@11.12.0 jsdom@26.1.0**. Run **node docs/_audit/validate.cjs**, **node docs/_audit/check-diagrams.mjs**, then **node docs/_audit/validate.cjs**. The temporary dependency directory is not a deliverable and was removed after checking; parser evidence remains in _audit/diagram-results.json. A source hash prevents stale diagram results from being reported as current after diagram edits. Syntax parsing does not verify visual layout.

No application code, database, secrets, existing roadmap copy or deployment configuration was changed by this documentation task. Production remains **NOT READY** until mandatory gaps and hospital acceptance pass.
