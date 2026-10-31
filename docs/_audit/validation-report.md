# Documentation self-check

Date: 2026-10-31. This report validates documentation structure and source references, not application or hospital behavior.

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Required documents | PASS | 9 main/inventory files and 12 role files |
| Citations and internal file links | PASS | 11163 source citations; 226 local links; heading fragments require reader review |
| Twelve-section role template | PASS | All role files checked |
| Every inventoried interactive location in a role action table | PASS | 1172 action IDs; 414 button sites; repeated runtime rows not counted individually |
| Every permission in generated matrix | PASS | 135 permission rows; 12 role columns |
| HTTP metadata coverage | PASS | 319 HTTP handlers public or permission-decorated; semantic authorization not tested |
| Navigation role names exist | PASS | Unknown nav roles:  |
| Inspected application sources unchanged | PASS | SHA-256 compared for all 422 inspected source files |
| Code fence balance | PASS | All generated Markdown fences checked |
| Mermaid parser | PASS | 19 diagrams parsed with Mermaid 11.12.0; visual layout not verified |

## Coverage and unresolved review

- 422 source files parsed; 119 Prisma models, 319 HTTP handlers, 34 pages, 12 system roles, 135 permissions.
- 1172 interactive JSX locations and 414 button source locations appear in role tables. This is source-location coverage, not runtime screen-instance coverage.
- 143 interactive locations have static endpoint candidates; 93 are buttons. Candidate matches require branch/role review; they are not successful request evidence.
- 321 button locations have no automatically resolved endpoint. Some are local tabs, dialog toggles, navigation, print or delegated form actions; they are not all broken. Their complete semantic trace, role visibility, destructive confirmations and reversal behavior remain **UNVERIFIED** where marked.
- 764 exception sites are available as exact source expressions. The main dependency table classifies common setup blockers; the remaining sites need workflow-specific interpretation.
- Role list in the supplied request was blank. All executable ROLES are covered; no invented HR officer/cashier/lab supervisor security role was added.

## Checks not performed

- No application tests, CI, browser walkthroughs, live database queries, migrations, deployment, account changes, backup activation or new restore/reboot drills were run in this documentation task.
- No staff UAT, two-week HR pilot, localization sign-off, accountant approval or actual device/printer test occurred.
- Day-0 sequence was checked against forms/schema/service logic, not executed against an empty database.
- Architecture and state diagrams simplify the code. Parser success does not establish all business transitions or rendered layout quality.
- Existing unrelated deleted files and temporary guide sources in Git status were left untouched.

## Failures

No documentation structural/reference failures detected.

**Documentation status:** source-based draft with explicit unresolved semantic/action verification. **Production readiness: NOT READY.**
