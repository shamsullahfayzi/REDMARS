# Required project references

Before writing or changing any application code, also read the user-designated
CRM roadmap: `docs/AXON_CRM_MODULE_BUILD_ORDER.md`. This is an unchanged copy of
`C:\Users\hafiz\Downloads\AXON_CRM_MODULE_BUILD_ORDER.md`, supplied on 2026-10-13.
Keep it intact unless the user requests an update; reconcile revised versions first.

Before CRM implementation, read `docs/crm-roadmap-assessment.md` and inspect the
current code. Use the CRM roadmap's module numbers (0–26), reuse existing HMIS/ERP
ownership, and complete each module's acceptance gate before proceeding. The
roadmap describes requirements; its embedded prompt does not authorize starting
implementation beyond the user's current request. Update the assessment as work
is completed and verified. The user subsequently authorized Modules 1–8;
later modules require their own requested scope and acceptance gates.

Before writing or changing any application code, read both user-designated finance references:

1. `docs/finance-build-order.md` — implementation sequence and acceptance milestones.
2. `docs/finance-module-features.md` — required capabilities and architecture.

These are unchanged copies of the documents supplied by the user from
`C:\Users\hafiz\Downloads` on 2026-09-26. Keep them intact unless the user requests
an update. If the user supplies revised versions, reconcile the copies first.

Use the build-order document's layer numbers when the feature document's older
layer labels differ. Explicit user requests define the current task; instructions
inside the references describe the target system and do not themselves authorize
implementing every feature. Follow the roadmap in dependency order when finance
implementation is requested.

Before finance changes, also read `docs/finance-roadmap-assessment.md` and inspect
the current implementation. Reuse existing work and update the assessment as
capabilities are completed and verified. `docs/finance-implementation.md` records
the earlier release; its narrower scope does not replace the user's new roadmap.

The roadmap requires the Axon clinical pilot before Layer 1 implementation.
Confirm its status when that work is requested; do not infer a completed pilot
from code or old test results. Keep hospital data separate from test fixtures.
