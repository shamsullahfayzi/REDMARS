# Phase 2 — Master Data: build guide

You're writing this phase yourself. This is the map, the guardrails, and the
gotchas — not the code. When a task is done, hand me the diff and I'll review it
against everything here.

> **Key fact:** all 14 Phase 2 models already exist in `schema.prisma` (built in
> 0.3). Phase 2 is **CRUD + seeds on existing tables**, not schema design. The one
> schema change we needed — splitting `nameLocal` into `nameLocalPrs` (Dari) +
> `nameLocalPs` (Pashto) on Facility/Department/LabTest — is already done.

---

## The recipe — every CRUD task is a vertical slice

Your blueprint is the **1.7 users module**. For each task, copy and adapt these
files in this order:

| Step | File to create | Copy from |
|---|---|---|
| 1. Shared contract | `packages/shared/src/<thing>.ts` | `src/user.ts` |
| 2. Backend module | `apps/api/src/<thing>/{module,controller,service}.ts` | `src/users/` |
| 3. e2e test | `apps/api/test/<thing>.e2e-spec.ts` | `test/users.e2e-spec.ts` |
| 4. Frontend hook | `apps/web/src/hooks/use<Thing>.ts` | `hooks/useUsers.ts` |
| 5. Frontend page | `apps/web/src/pages/<Thing>Page.tsx` | `pages/UsersPage.tsx` |
| 6. i18n | keys in `en.json` / `prs.json` / `ps.json` | existing keys |

After step 1, always `pnpm --filter @redmars/shared build`. Register the new
module in `apps/api/src/app.module.ts`. Wire the page into `apps/web/src/router.tsx`.

---

## Guardrails — the non-negotiables (I check every one)

1. **Every route names one permission.** `@RequirePermission('department.manage')`.
   No `@RequirePermission` and no `@Public` = denied even to admin. The Phase 2
   permissions already exist in the matrix (all admin): `department.manage`,
   `room.manage`, `practitioner.manage`, `service.manage`, `price.change`,
   `drug.manage`, `labtest.manage`, `panel.manage`, `setting.manage`.
2. **Writes go through `this.prisma.db.MODEL`** — never `this.prisma.MODEL`. The
   `.db` client auto-writes the audit row; the bare one is the un-audited base.
3. **Scope every query by `facilityId`** from `req.auth.facilityId`. One tenant
   today, but never assume it in code.
4. **Never hard-delete.** Soft-delete via `deletedAt` or a status/`isActive` flag.
   Master data gets referenced by clinical records later; deleting orphans them.
5. **Parse request bodies with zod.** `@Body() body: unknown` + `schema.safeParse`
   (see `auth.controller.ts` / `users.controller.ts`). Types are gone at runtime.
6. **RTL/i18n.** Logical CSS only: `ps-/pe-`, `ms-/me-`, `text-start/end`. Never
   `pl-/pr-/ml-/mr-/text-left/right`. Every visible string is a translation key,
   in all three locale files.
7. **Money stays off clinical tables.** A price on a `Service` catalog row is fine;
   a price on `Visit` or any clinical record is not.
8. **Snapshot names on clinical records** (later phases): when a prescription
   stores a drug name, copy it (`drugNameAtTime`), don't just FK — the catalog can
   change, the historical record must not.

---

## Gotchas that will bite you (learned the hard way in Phase 1)

- **Schema change → migration workflow** (this env can't run `migrate dev` — no TTY):
  1. Edit `schema.prisma`, then `npx prisma format`.
  2. Generate the SQL:
     ```
     npx prisma migrate diff \
       --from-url "postgresql://redmars:7863@localhost:5433/redmars?schema=public" \
       --to-schema-datamodel prisma/schema.prisma --script
     ```
  3. Hand-write it into `prisma/migrations/<YYYYMMDDHHMMSS>_name/migration.sql`.
     **If it's a rename, write `RENAME COLUMN`, not drop+add** — diff generates
     drop+add, which throws away data.
  4. `npx prisma migrate deploy` then `npx prisma generate`.
  5. Verify in sync: the `migrate diff` above should now print *"empty migration"*.
- **Stop your dev server before `prisma generate`** — a running node process locks
  the engine DLL on Windows (EPERM). The TS types still update; only the (identical)
  engine binary fails to copy, which is harmless — but stop it to avoid the noise.
- **`.prettierrc` printWidth is 100.** Write to it. Run `npx eslint --fix` on
  **only the file you just wrote**, never the whole tree — it reformats unrelated
  files into your diff.
- **e2e share one database** (`maxWorkers: 1` is set). Prefix test rows (e.g.
  `e2e_dept_`), delete them in `afterAll`, and don't assume an empty table.
- **Two linters:** api is `eslint` (`npx eslint "src/**/*.ts"`), web is `oxlint`
  (`pnpm lint`). Both must be clean. The one pre-existing `button.tsx` oxlint
  warning is known — ignore only that one.
- **The read-permission gap.** For an admin management screen, gate the list on
  `.manage`. When a *later* phase needs all roles to read the data (e.g. a
  receptionist picking a department at visit creation), add a `.read` permission
  **then** — don't build it now. This gap already bit me once (I added `user.read`
  in 1.7 and `auth.me` in 1.6).

---

## Per-task notes — just the non-obvious bits

### 2.1 Departments + rooms CRUD — *done when admin can add "OPD-2"*
- Schema decision already made: `nameLocalPrs` + `nameLocalPs` (both optional).
  Your create/edit form should have a field for each; show them under `dir="rtl"`.
- Room belongs to a Department (`departmentId`). Room CRUD is a child list — build
  it after Department, likely nested under a department's detail view.
- Department has a unique `(facilityId, code)` — a duplicate code is a 409, handle
  it like `users.create` does for usernames.

### 2.2 Specialities + practitioners, link practitioner ↔ user — *doctor in OPD and IPD*
- `Practitioner.userId` is a **unique 1:1** to `AppUser` — a practitioner may be
  linked to a login account, or not (a visiting consultant with no login).
- `PractitionerDepartment` is the **many-to-many**: this is what lets one doctor
  belong to OPD *and* IPD. The done-when is specifically about this join.
- Speciality is a tiny lookup CRUD — do it first, practitioners reference it.

### 2.3 Services + fees — *admin sets the OPD consultation fee*
- `Service` is a catalog with a price. That's the allowed home for money.
- `price.change` is a separate permission from `service.manage` — changing a price
  may deserve its own route/audit later, but for 2.3, `service.manage` on the CRUD
  is fine. Note it and move on.

### 2.4 Drug formulary CRUD + CSV import — *200+ drugs, searchable*
- CSV import = read file → parse rows → validate **each row** against a zod schema
  → collect the bad rows and report them → bulk-insert the good ones. Make it
  re-runnable (skip/upsert on an existing code). Don't let one bad row abort the lot.
- Search: index the columns you search on; start simple (`contains`), refine later.

### 2.5 Seed MoPH Essential Medicines + Farhat's psych drugs — *the drugs Dr. H prescribes exist*
- Pure data task. Put it in a seed script (or reuse 2.4's import). Keep the source
  list in the repo so it's reproducible.

### 2.6 Drug default route/frequency/duration — *duloxetine autofills OD / oral / 1 month*
- Columns on `Drug`. The consultation screen (Phase 4) reads them to pre-fill a
  prescription. Just make sure they're captured and editable here.

### 2.7 Lab test catalog + panels + prices — *"LFT" expands to 5 tests*
- `LabPanel` ↔ `LabTest` is many-to-many via `LabPanelTest`. A panel is an ordering
  convenience that expands to its member tests. `nameLocalPrs/Ps` now exist on
  `LabTest` too — use them.

### 2.8 Reference ranges per test — *Hb 11 flags L for a man, normal for a woman*
- `ReferenceRange` is keyed by test + sex + age band. The flag logic (L/H/normal)
  is read at result-entry time (Phase 5), but the data model + CRUD is here.

### 2.9 ICD-10 seed + search — *typing "depress" suggests F32.x*
- Import the WHO file into `IcdCode`. It's large — bulk insert, and index the
  description for search. Search is the point; make it fast.

### 2.10 NumberSequence — *gapless, per-year* ⚠️ THE TRICKY ONE
- MRN, visit no, invoice no, lab order no. **Gapless and per-year means you cannot
  just `count() + 1`** — two concurrent receptionists would collide.
- Use an **interactive transaction** that atomically reads-and-increments a counter
  row (a `NumberSequence` row per (facility, type, year)), e.g. an `UPDATE ...
  SET current = current + 1 RETURNING current`, or a row lock. One transaction,
  one increment, one returned number.
- **Test it under concurrency** — fire N parallel calls and assert you get N
  distinct, contiguous numbers. This is the one task where a naive version passes
  a single-threaded test and fails in production.

### 2.11 Drug interaction seed — *SSRI + MAOI fires a warning*
- Seed ~50 top psych interactions only. **Put a visible line in the UI: "warning
  aid, not a safety net."** The plan is explicit — a half-complete checker that
  looks complete is worse than none. Don't let it read as authoritative.

### 2.12 FacilityModule seed + admin toggle — *admin flips "lab" on/off*
- `FacilityModule` rows per (facility, `ModuleKey`). OPD is never toggleable — the
  system *is* OPD. Admin screen is a list of switches.

### 2.13 ModuleGuard — *disabled module → 403, even hand-crafted requests* ⚠️ NEW GUARD
- Same shape as your `PermissionsGuard`: a `@RequiresModule('lab')` decorator + a
  global guard that reads the route's module and 403s if that `FacilityModule` is
  off. Register it as an `APP_GUARD` **after** the auth guards (order matters, like
  in `auth.module.ts`).
- Nav hides disabled modules — that's courtesy. The guard is the control. Keep
  module boundaries clean: everything hangs off `Visit`, never off a sibling
  module, so disabling `lab` can't break `billing`.

---

## Before you hand a task to me for review

- [ ] `pnpm build` clean (all 3 packages).
- [ ] `pnpm lint` clean — api `eslint` **and** web `oxlint`.
- [ ] An e2e test whose **first case is the done-when**, plus deny cases
      (non-admin → 403) and the validation cases (duplicate code → 409, bad body → 400).
- [ ] Every new route has a `@RequirePermission`; every write uses `prisma.db`.
- [ ] Every query scoped by `facilityId`.
- [ ] No physical CSS; i18n keys in all three locales.
- [ ] Commit per task: `feat(<area>): … (task 2.x)`.

**To request review:** commit, then tell me the commit range or say "review 2.x"
and run `/code-review`. I'll check it against this guide and the done-when, flag
anything, and we fix together — same rhythm as Phase 1.
