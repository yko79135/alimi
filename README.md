# Alimi

Alimi is a multi-tenant school management and parent communication
platform. One deployment serves any number of independently-branded
schools — students, guardians, notices, attendance, and behavior/conduct
records, each fully isolated from every other school on the platform.

Built for small private, independent, and international schools that
need something focused and trustworthy, without the weight of a full
SIS/ERP.

## Core features

- **Students & guardians** — roster management with archiving, CSV
  import (Korean/Excel-friendly), and guardian links that are tenant-safe
  by construction.
- **Communication** — notices targeted by school, grade, homeroom, or
  individual student, with read receipts, confirmations, replies, PDF
  attachments, and Web Push.
- **Attendance** — fast daily entry backed by an exception-based ledger
  (no wasted rows for an ordinary present day), with idempotent,
  conflict-checked saves.
- **Behavior** — configurable conduct/praise categories in each school's
  own terminology, recorded as a signed-delta ledger.
- **School administration** — self-service onboarding, staff invites,
  parent signup links, branding, a setup checklist, an audit log, and
  CSV exports.
- **Platform administration** — a separate console for the Alimi
  operator to see aggregate per-school metrics and manage subscription
  status, without visibility into individual student records or
  messages.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Supabase
(Postgres, Auth, Storage, Realtime) · Tailwind CSS v4 · Web Push.

## Architecture and design docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the app is put
  together.
- [`docs/MULTI_TENANCY.md`](docs/MULTI_TENANCY.md) — the tenant
  isolation and membership model (start here for the security story).
- [`docs/SECURITY.md`](docs/SECURITY.md) — defense-in-depth, service-role
  usage, and known gaps.
- [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) — provisioning a
  Supabase project for this app.
- [`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md) — deploying
  to Vercel.
- [`docs/BILLING_ARCHITECTURE.md`](docs/BILLING_ARCHITECTURE.md) — the
  subscription/plan model and how a real payment provider slots in.
- [`docs/HOLGA_REFERENCE_AUDIT.md`](docs/HOLGA_REFERENCE_AUDIT.md) — what
  was studied from an internal single-tenant reference implementation
  and how Alimi generalizes or improves on it.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in real values, see docs/SUPABASE_SETUP.md
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

See [`.env.example`](.env.example) for the full list (Supabase URL/keys,
app URL, VAPID keys for Web Push). Never commit real values.

## Database migrations

All schema lives in [`supabase/migrations/`](supabase/migrations), one
file per concern, applied in filename order. See
[`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) for how to apply them
to a fresh Supabase project.

## Development commands

```bash
npm run dev         # start the dev server
npm run build        # production build (also runs the TypeScript check)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
```

## Tests

```bash
# Tenant-isolation RLS test suite (plain SQL, no live Supabase required)
createdb alimi_test
psql -d alimi_test -f tests/local_postgres_stub.sql
for f in supabase/migrations/*.sql; do psql -d alimi_test -f "$f"; done
psql -d alimi_test -f tests/rls_isolation.test.sql
```

See [`tests/README.md`](tests/README.md) for details, including how to
run the same suite against a real Supabase project.

## Deployment overview

One Vercel project, one Supabase project, serving every school tenant.
See [`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md) for the full
checklist (environment variables, Supabase Auth redirect URLs, what's
not yet automated).
