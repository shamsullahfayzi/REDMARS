# REDMARS HMIS

**A bilingual (Dari / English), on-premise hospital management system for outpatient clinics in Afghanistan.**
Built end to end — database, API, UI, deployment — and designed with a working psychiatric hospital in Kabul as the design partner.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

<!-- Add 2–3 screenshots here (dummy data only): reception screen, consult screen, lab queue -->
<!-- ![Consult screen](docs/screenshots/consult.png) -->

---

## The problem

Clinics in Afghanistan typically run on paper registers, spreadsheets, or legacy desktop software that has no Dari support, no audit trail, and no link between reception, the doctor, the lab and the pharmacy. Internet is unreliable, so cloud SaaS isn't an option. Staff are busy and non-technical, so anything slower than paper loses.

REDMARS covers one full outpatient visit on a single LAN server that keeps working when the internet doesn't:

**Reception → Doctor's queue → Consult & prescription → Lab → Billing → Pharmacy → Reports**

## Features

**Patient flow**
- Registration, visit, invoice and payment on **one screen** — the receptionist is the bottleneck, so this was designed first
- Patient search by name, MRN or phone, with fuzzy duplicate detection
- Live doctor queues, appointments, follow-up lists

**Clinical**
- Keyboard-first consult screen with hotkeys (F2 save & continue, F4 save & print, F9 save & exit)
- ICD-10 diagnosis autocomplete, vitals, structured psychiatric assessment (MSE, risk assessment)
- Prescription builder with drug-formulary autocomplete, **hard-block allergy checks** (override needs a reason) and **drug-interaction warnings**
- Bilingual, right-to-left prescription and lab report printing on hospital letterhead

**Lab, billing & pharmacy**
- Lab orders flow instantly into reception (for payment) and the lab queue; abnormal results auto-flagged from age/sex reference ranges
- Results are never overwritten — amendments keep the original
- Multiple invoices per visit, partial payments, refunds, discount ceiling with admin approval, daily till reconciliation
- Pharmacy sees only drugs and allergies — not the full clinical record

**Platform**
- Full Dari ↔ English toggle with RTL layout from day one
- Hospital modules (lab, pharmacy, …) can be switched on/off per facility
- Management reports

## Engineering highlights

| Area | What I did |
|---|---|
| **Security** | argon2 password hashing, short-lived JWT access tokens + revocable refresh sessions, no default passwords anywhere (seed generates and prints a random admin password once) |
| **Authorization** | ~60 permissions across 6 roles enforced by a NestJS `PermissionsGuard`; disabled modules are blocked server-side by a `ModuleGuard`, not just hidden in the UI |
| **Audit trail** | An `AuditInterceptor` logs every write with before/after values, and every **read** of a clinical record |
| **Data model** | 47 Prisma models, 18 migrations, multi-facility from the start |
| **Performance** | Load-tested at 40 concurrent patients / 6 staff. Found the default Prisma pool (9 connections) exhausting in seconds and tuned it — documented in `.env.example` |
| **Operations** | Nightly `pg_dump` backups with a **tested restore**, HTTPS on the LAN via Caddy, server hardening guide, containerized production build |
| **Type safety** | Shared Zod schemas and types in `packages/shared`, used by both API and web |

## Architecture

```
┌────────────── Hospital LAN ──────────────┐
│  Reception · Doctors · Lab · Pharmacy    │
│        (any browser on the network)      │
└───────────────────┬──────────────────────┘
                    │ HTTPS
              ┌─────▼─────┐
              │   Caddy   │  TLS front door
              └──┬─────┬──┘
     ┌───────────▼┐   ┌▼────────────┐
     │  apps/web  │   │  apps/api   │  NestJS · Prisma
     │ React+Vite │   │  REST + RBAC│
     └────────────┘   └──────┬──────┘
                       ┌─────▼──────┐    ┌──────────┐
                       │ PostgreSQL │───►│ backups  │ nightly pg_dump
                       └────────────┘    └──────────┘
```

**Monorepo (pnpm workspaces)**
```
apps/api        NestJS API — 30+ domain modules (patient, visit, prescription, lab-order, invoice, pharmacy…)
apps/web        React 19 + Vite + Tailwind + shadcn/ui + TanStack Query + i18next
packages/shared Shared Zod schemas & types
docs/           Install, HTTPS, hardening and site-setup guides
```

## Getting started

**Requirements:** Node.js (see `.nvmrc`), pnpm, Docker.

```bash
git clone https://github.com/shamsullahfayzi/REDMARS.git
cd REDMARS
pnpm install

cp .env.example .env
cp apps/api/.env.example apps/api/.env
# set JWT_SECRET in apps/api/.env:  openssl rand -base64 48

pnpm db:up                     # Postgres + Adminer in Docker
pnpm --filter api exec prisma migrate dev
pnpm seed                      # prints a one-time admin password
pnpm dev                       # API + web
```

Web: http://localhost:5173 · API: http://localhost:3000

**Production (LAN server):** `pnpm deploy:up` — see [`docs/server-install.md`](docs/server-install.md) and [`docs/https-lan.md`](docs/https-lan.md).

## Status

| Phase | Scope | Status |
|---|---|---|
| 0–1 | Foundation, auth, RBAC, audit | ✅ |
| 2–3 | Master data, registration, visits, queues | ✅ |
| 4–5 | Consult, prescriptions, lab | ✅ |
| 6 | Billing, pharmacy, reports | ✅ |
| 7 | Hardening, backups, load test, containerized deploy | ✅ mostly · staff training & go-live next |

## Author

**Shamsullah Fayzi** — full-stack engineer · [GitHub](https://github.com/shamsullahfayzi)

## License

Proprietary — © Shamsullah Fayzi. All rights reserved. The source is shown for portfolio review only; it may not be copied, deployed or redistributed without written permission.
