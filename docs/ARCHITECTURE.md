# Architecture

Alimi is a Next.js App Router application backed by a single Supabase
project (Postgres + Auth + Storage + Realtime). One deployment serves
every tenant (school); there is no per-tenant infrastructure. Tenant
isolation is a database-layer property (Row Level Security), not an
application-layer one — see `docs/MULTI_TENANCY.md` and
`docs/SECURITY.md` for the full model.

## Stack

- **Next.js 16 (App Router, Turbopack)** — chosen to match the proven
  Holga stack (see `docs/HOLGA_REFERENCE_AUDIT.md`); `proxy.ts` is Next
  16's renamed `middleware.ts` convention.
- **React 19 / TypeScript 5, strict mode.**
- **Supabase**: Postgres 15+, Auth (email/password + invite links),
  Storage (two buckets: `school-logos`, `notice-attachments`), Realtime
  (`postgres_changes` on a narrow event table).
- **Tailwind CSS v4** for styling; no component library — a small,
  intentional set of hand-built primitives (see `app/globals.css` for
  the design tokens).
- **web-push** for Web Push notifications, **papaparse** for CSV import
  parsing.

## Request flow

Every authenticated request carries a Supabase session cookie, refreshed
on each request by `proxy.ts` → `lib/supabase/proxy.ts` (`updateSession`).
Unauthenticated requests to non-public paths are redirected to `/login`;
authenticated requests to `/login`/`/signup` are redirected to `/app`.

Server Components and Server Actions call `lib/supabase/server.ts`'s
`createClient()`, which builds a per-request, cookie-bound Supabase client.
**This client is RLS-scoped** — every query it makes is evaluated against
Postgres RLS policies as the signed-in user, which is the actual
enforcement layer for tenant isolation and role-based access (see
`docs/SECURITY.md`). Client Components use `lib/supabase/client.ts`'s
browser client, same RLS scoping, for a small number of interactive
writes (acknowledgement upserts, push subscription management) where
going through a Server Action would just add latency without any extra
security benefit.

`lib/supabase/admin.ts`'s `createAdminClient()` uses the Supabase
service-role key and bypasses RLS entirely. It is used **only** for:
provisioning/inviting `auth.users` (`auth.admin.*`, which has no RLS
equivalent), minting short-lived signed Storage URLs, and the Web Push
send job (which must read *other users'* `push_subscriptions` rows,
something their own RLS policy correctly forbids). Every one of these
call sites performs its own authorization check first — see
`lib/auth/require.ts`.

## Directory layout

```
app/
  page.tsx                 marketing landing page
  login/, signup/           auth entry points
  onboarding/                self-service "create a school" flow
  invite/accept/              staff invite acceptance (Supabase invite-email callback)
  join/[token]/               parent self-signup via a school's invite link
  auth/callback/               exchanges Supabase email-link codes for a session
  app/                        the tenant-scoped application shell
    layout.tsx                 resolves active school, renders nav
    dashboard/                  staff dashboard (metrics + setup checklist)
    students/                   roster, CSV import, student detail
    staff/                      staff invites & membership management
    notices/                    notice composer, list, detail
    attendance/                 exception-based attendance entry
    behavior/                   behavior/conduct records
    settings/                   branding, grade levels, parent signup links
    audit/                      audit log viewer
    family/                     parent/guardian dashboard
  platform/                   platform-admin console (cross-tenant)
  api/                        route handlers for CSV export/import, attachments, templates
lib/
  supabase/                  the four Supabase client helpers + config
  auth/require.ts             requireUser/requireSchoolRole/requirePlatformAdmin
  tenant/active-school.ts     resolves which school a multi-school user is acting in
  audit/log.ts                 audit_logs writer
  dashboard/                  server-side data loaders for staff/guardian dashboards
  push/send.ts                 Web Push sender
  csv/, utils/                 small framework-free helpers
types/database.ts            hand-written Supabase Database type (see note in the file)
supabase/migrations/         ordered SQL migrations — the actual schema + RLS
tests/                       RLS tenant-isolation test suite (plain SQL, no live Supabase needed)
docs/                        this file and its siblings
```

## Data model at a glance

`profiles` (one row per person) → `school_memberships` (role at a
specific school, `school_admin | teacher | parent`) → everything else,
scoped by `school_id`. `platform_admins` is a separate, small table
unrelated to school roles. Full schema in `supabase/migrations/`, one
migration per concern, each self-documenting why it exists (a convention
adopted from Holga's migration history — see
`docs/HOLGA_REFERENCE_AUDIT.md` §9).

Notable modeling choices, explained in depth in their own docs:
- Multi-tenancy and RLS strategy: `docs/MULTI_TENANCY.md`.
- Attendance and behavior are both **append-only, exception/delta
  ledgers**, not row-per-day-per-student tables — see the comments at
  the top of `20260811011000_attendance.sql` and
  `20260811011100_behavior.sql`.
- Notice targeting (school/grade/homeroom/student) is enforced by a
  single shared SQL predicate (`guardian_can_see_notice()`) reused by
  both the `notices` and `notice_attachments` RLS policies, specifically
  to avoid the drift bug documented in
  `docs/HOLGA_REFERENCE_AUDIT.md` §3.
- Parent signup requires a per-student verification code, not just
  name+grade — `docs/MULTI_TENANCY.md` has the full tradeoff writeup.

## Realtime

Rather than subscribing to `postgres_changes` on wide tables like
`notices` or `acknowledgements`, guardian-facing realtime updates flow
through a narrow `guardian_dashboard_events` table
(`school_id`, `guardian_id`, `event_type`, `entity_id`), written by
staff-side actions and subscribed to by the parent dashboard filtered on
the guardian's own id. This pattern is carried over deliberately from
Holga (`docs/HOLGA_REFERENCE_AUDIT.md` §6) because it sidesteps a whole
class of realtime-filter correctness problems. **Not yet wired into the
UI** — the table and RLS policies exist, but `app/app/family/page.tsx`
currently does a plain server-rendered fetch rather than subscribing.
Wiring a `useLiveRefresh`-style hook (see the audit doc for the pattern
Holga used) is listed as remaining work in the top-level summary.

## Background work

Web Push sends (`lib/push/send.ts`) run via Next's `after()`, scheduled
from `app/app/notices/actions.ts` after the notice row has already
committed — a slow or failing push provider can never block or fail a
notice publish. There is no other background job infrastructure (no
queue, no cron) in v1; CSV import and exports are synchronous request/
response.

## What's intentionally not built yet

See the "Remaining work" section of the final delivery summary for the
full list. In short: course-scheduling/timetabling, payroll/HR,
accounting, a full LMS, and any AI features are out of scope by design
(see the product brief) — Alimi stays focused on students, guardians,
communication, attendance, behavior, and school administration.
