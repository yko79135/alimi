# Holga Reference Audit

This document records what was learned from studying `yko79135/holga_alimi`
(read-only reference; nothing in that repository was modified) before
designing Alimi's own schema and application. Holga is a proven,
single-tenant Next.js + Supabase school-parent portal built for one
Christian school ("Holy Guide"). Alimi generalizes the workflows that work
well there into a multi-tenant, religiously/institutionally neutral SaaS
product. This is a study source, not a template to copy verbatim — several
sections below identify things that must change, not just be ported.

Reference commit inspected: `2d4c236` (shallow clone, single squashed
commit — no line-by-line git history was available, so lessons below are
drawn from in-code comments and the ordering/content of Holga's numbered
migration files, which are unusually well self-documented).

## 1. Authentication & authorization

**Supabase client boundaries** — Holga uses four distinct Supabase client
helpers, each with a clear trust boundary: a browser client (anon key, RLS
enforced), a per-request server client built from cookies (anon key, RLS
enforced, used for the *majority* of reads/writes including staff writes),
an admin client (service-role key, RLS bypassed, reserved for
`auth.admin.*` user provisioning, storage signed URLs, and background
tasks), and a `proxy.ts` (Next's current name for `middleware.ts`) that
refreshes the auth cookie and redirects based on session state. **Alimi
keeps this four-client pattern** (`lib/supabase/{client,server,admin}.ts`
+ `proxy.ts`).

**Multi-role support** — Holga evolved from a single `profiles.role`
column to a proper `profile_roles` many-to-many table, letting one login
hold multiple roles (e.g. teacher *and* parent) with a UI toggle between
dashboard views. Alimi generalizes this one step further: roles are scoped
to `(school_id, user_id)` pairs via `school_memberships`, not just
global-per-user, so the same person can be `school_admin` at School A and
`parent` at School B, or hold two roles at the same school.

**RLS-scoped writes over service-role writes** — the single most important
lesson from Holga's migration history. Its first behavior-points migration
(`20260714_student_warnings.sql`) shipped with SELECT-only grants and no
INSERT policy for `authenticated`, meaning writes could only have worked
through the RLS-bypassing admin client with authorization checked solely
in application code. A follow-up migration
(`20260714_warning_save_rls_fix.sql`) explicitly added
`with check (public.is_staff() and author_id = (select auth.uid()))`
insert policies so staff write through their own session and Postgres
itself is the enforcement layer. The later `attendance_entries` migration
was built with its insert policy present from day one — the lesson had
been internalized. **Alimi's rule, stated once and followed everywhere:
every table gets real INSERT/UPDATE/DELETE RLS policies from its first
migration. The service-role client is reserved for `auth.admin.*` calls,
storage signed URLs, and genuinely tenant-agnostic background jobs —
never as a substitute for a missing policy.**

**Admin safety checks worth keeping**: Holga's role-removal endpoint
refuses to strip a user's last role, and refuses to remove the platform's
last admin. Alimi generalizes the second check to "last `school_admin` of
*this* school" (not last admin globally, which doesn't make sense once
there are many tenants) plus a separate, real platform-admin table that
Holga never had at all (see §10).

## 2. Signup invite system — reuse the shape, replace the identity proof

Holga's flow: an admin issues a reusable, unscoped invite token → a parent
fills in name/email/password plus up to 5 children, each with a
name+grade → the client asks the server to name-match children against
the roster (case-insensitive, whitespace-collapsed exact match, no fuzzy
matching) → the parent confirms matches → a single `security definer` RPC
(`redeem_signup_invite_children`) re-validates every match server-side and
atomically creates the account, links matched students, and inserts any
genuinely-new student rows, rolling back the whole batch if any child
fails — explicitly to avoid a signup that half-succeeds.

**The atomic-RPC-with-rollback shape is worth reusing directly.** Alimi's
`redeem_parent_signup_invite` RPC follows the same pattern.

**The identity proof is the part that must change.** Holga's only gate
against impersonation is knowledge of a student's name + grade — checked
against the real roster, with no second factor, no per-family scoping, and
no admin approval step. The audit agent's assessment: *"anyone possessing
the shared invite link, plus a guessable or overheard child's full name
and grade/class, can self-register as that child's parent"* — a real
weakness in a school setting where classmates' parents legitimately know
each other's kids' names and grades. The match endpoint is also an
unthrottled oracle for enumerating the roster by name/grade to anyone
holding the link.

Alimi's design (see `docs/MULTI_TENANCY.md` for the full writeup): every
student gets a short server-generated `verification_code` at creation/
import time, communicated to families out-of-band (enrollment paperwork,
a note home) rather than embedded in the link. A signup match requires
name + grade + this code, not name + grade alone. Each school can also
mark its invite link as `requires_approval`, queuing any match against an
*existing* student for admin confirmation before the guardian link is
created, and the match endpoint returns a generic "no match" for every
failure mode (wrong name, wrong grade, wrong code, or genuinely no such
student) so it never confirms which part was wrong or whether an
arbitrary name exists on the roster.

## 3. Notice system — targeting, attachments, tracking, push

**Targeting is enforced in RLS, not just app code.** Holga's `notices`
SELECT policy is the canonical pattern: staff see everything; parents see
school-wide notices, notices for any grade one of their linked children is
in, or notices individually addressed to a linked child — all as one
`using()` expression, so even a raw PostgREST query without any app-level
filtering cannot cross a targeting boundary. Alimi keeps this shape and
extends the scopes with `homeroom` (Holga has school/grade/student only)
and adds `school_id` to every branch.

**A real bug to not repeat**: Holga's `notice_attachments` SELECT policy
only checks that the parent `notices` row exists at all
(`exists (select 1 from public.notices n where n.id = notice_attachments.notice_id)`),
not that the current parent is an authorized recipient of that notice —
unlike the real `notices_select` policy, which replicates the full
targeting logic. Because `notice_attachments` also carries realtime
replication, any authenticated parent subscribing to Postgres changes on
that table would receive attachment metadata (filename, size, notice
linkage) for every attachment in the system, including individually
targeted notices for other families. The download itself stays gated
(the API route re-checks the parent `notices` row through the user's own
RLS-scoped client before minting a signed URL), so this is a metadata
leak rather than a file leak — but it should never have been weaker than
the parent policy it references. **Alimi's `notice_attachments` policy
replicates the exact same targeting predicate as `notices_select`
(school_id match + scope check), not a mere existence check.**

**Attachment storage**: private bucket, MIME/size enforced at both the
bucket config and app validation, upload via a short-lived signed upload
URL (server never proxies file bytes), download via a route that first
confirms visibility through the RLS-scoped client and only then mints a
60-second signed URL with the admin client. Alimi keeps this shape,
scoping storage paths by `school_id/notice_id/...` so cross-tenant path
guessing is meaningless even before RLS is considered.

**Read/confirm/reply tracking**: one `acknowledgements` row per
`(notice_id, parent_id)` (not per student, since two guardians of the same
child track state independently) — `read_at` set on open, `confirmed_at`
set on explicit confirmation, `parent_reply`/`replied_at` for free-text
replies. Alimi keeps this model, renaming `parent_id` conceptually to
`guardian_id`.

**Web Push**: payloads are intentionally generic/non-identifying (no
student name or notice content in the push body, to avoid leaking to a
lock-screen notification) with a deep-link URL only; dead subscriptions
(404/410) are pruned automatically; sends happen via a fire-and-forget
background task after the durable database write is already committed, so
a slow push provider never blocks a save. Alimi keeps all three
properties and adds `school_id` to `push_subscriptions` so a push payload
can never be built by resolving recipients across tenants.

## 4. Attendance — exception-based ledger, not a row per student per day

Holga's model, stated in its own migration comment: *"A student with no
row for a given date is implicitly present — rows are only written for
exceptions or to correct a prior exception back to present."* It's an
append-only ledger (`change_type: exception | correction`); a correction
inserts a new row rather than mutating history, and "current status" is
derived as the most recent row for that `(student, date)`, defaulting to
present. This directly satisfies the product requirement to avoid storing
"millions of redundant present rows without a reason," and Alimi adopts it
unchanged in shape, adding `school_id` and generalizing the status set
already (present/late/absent/early_leave/excused maps directly).

Two implementation details worth carrying over: an **idempotency key**
per save batch (so a retried/double-submitted save doesn't double-write),
and an **optimistic-concurrency check** — the server recomputes current
status from the database and compares it against each change's claimed
previous status before writing, returning a 409 rather than silently
overwriting a concurrent edit from another staff member.

One gap to close: Holga estimates "elapsed present days" for parent stats
by counting Mon–Fri calendar days from a hardcoded semester start with no
school-calendar/holiday table — an explicit approximation by its own code
comments. Alimi does not need to solve a full academic calendar in v1, but
should not hardcode Korean semester boundaries (Jan–Jul / Aug–Dec) the way
Holga does — a per-school `academic_years` table with configurable start/
end dates is enough to remove that assumption without building a holiday
calendar.

A second detail worth keeping: teacher-private notes on an attendance
exception are excluded from parents not just by hiding a column, but by
making the *row itself* invisible to parents whenever a private note is
present, with a separate `security definer` RPC returning only
parent-safe columns for the parent-facing feed. Alimi reuses this
column-hiding-via-row-visibility approach for any future private-note
fields.

## 5. Behavior / conduct — signed-delta ledger, configurable categories

Holga's `warning_entries` is a signed-delta ledger analogous to
attendance: every row records `previous_value`, `new_value`, and a
non-zero `delta`; monthly/semester totals are `SUM(delta)`, not a mutable
counter, so corrections are offsetting rows rather than edits to history.
Discipline deltas are stored negative, praise positive, in the same
column, split by an explicit `kind` column (`discipline | praise`) — an
earlier design tried to infer kind from a closed set of CHECK-constrained
category strings and that proved fragile once a "correction" entry had no
category at all, so a later migration added `kind` as the real source of
truth with a backfill. **Alimi starts directly with an explicit `kind`
column and never tries to infer it from category text.**

The category list itself is the clearest single-tenant assumption in the
whole codebase: 18 hardcoded Korean strings enforced by a **Postgres CHECK
constraint**, several explicitly religious (scripture meditation/QT,
devotional life, chapel attendance). This cannot ship as fixed schema in a
neutral product. Alimi makes `behavior_categories` a per-school table
(school-configurable label, kind, point value, active flag) seeded with a
small secular starter set per school rather than baked into a CHECK
constraint, satisfying the product requirement that terminology
(벌점/Warning/Conduct Record) be configurable per school.

`class_periods` (which class/subject an incident happened in) has the
same problem — Holga seeds 35 hardcoded subject names including chapel/
scripture classes. Alimi's equivalent (`homerooms`/class context) is
school-created data, never seeded with another school's curriculum.

## 6. Parent dashboard & realtime

Holga shows all of a parent's linked children in one combined, deduplicated
notice feed rather than a single-child-switcher UI, with per-child
breakdowns appearing only in the attendance/points stats tabs. Alimi's
product brief calls for explicit multi-child switching, so this is a
deliberate improvement over Holga rather than a straight port.

**The realtime pattern is worth adopting directly.** Rather than
subscribing to `postgres_changes` on wide tables like `notices` or
`acknowledgements` filtered by `parent_id`, Holga inserts into a narrow,
purpose-built `parent_dashboard_events (parent_id, event_type, entity_id,
created_at)` table from every staff-side write, and the parent's client
subscribes only to that table filtered to their own `parent_id`, then
re-fetches. A companion migration's comment ties this to a fixed realtime
race: `replica identity full` was added to tables parents might otherwise
subscribe to directly (needed so DELETE events carry enough old-row data
to match a client-side filter), and a uniqueness constraint was added to
`parent_students(parent_id, student_id)` to stop duplicate link rows from
producing duplicate/missed events. **Alimi adopts the narrow-event-table
pattern outright** (as `guardian_dashboard_events`, scoped by both
`school_id` and `guardian_id`) — it sidesteps realtime-filter correctness
problems entirely and scales cleanly once a tenant dimension is added to
every filter. The generic `useLiveRefresh` hook (debounced, coalesces
overlapping refreshes, also refreshes on window focus/online/visibility
change) is reused as-is.

## 7. Account management

Holga's admin user list actively diagnoses drift between `auth.users` and
`profiles` (`missing_profile | missing_role | unconfirmed_email |
inconsistent`), since profile creation depends on a trigger that could in
principle lag or fail. Account creation and signup-invite redemption both
roll back the just-created `auth.users` row if any downstream step fails,
so a partial failure never leaves a dangling, profile-less auth account.
Password self-change re-authenticates with the current password before
calling `updateUser`, preventing a hijacked session from silently
resetting credentials. Permanent account deletion cascades through
`profiles.id references auth.users(id) on delete cascade`, and Holga
deliberately made `notices.created_by` / `notice_attachments.uploaded_by`
nullable with `on delete set null` so deleting a staff account doesn't
block on their historical notices — those rows survive with a null
creator reference. Alimi keeps all of these patterns; the drift-diagnostic
approach is particularly worth keeping given RLS/trigger-based
provisioning has more moving parts once a tenant dimension is added.

## 8. What must NOT be carried into Alimi

No table in Holga's schema has a tenant/school id at all — every RLS
helper (`is_staff()`, `is_admin()`, `parent_has_student()`) checks role
membership only, globally, because there is only ever one school per
deployment. This is the central thing Alimi generalizes: every one of
these helper functions gains a `school_id` parameter, and every table
gains a `school_id` column with an RLS predicate on it. Concretely, avoid
carrying forward:

- A single global `NEXT_PUBLIC_SCHOOL_NAME` env var and a single static
  `manifest.webmanifest` / `sw.js` with one hardcoded school name, color
  scheme, and logo path — Alimi stores branding per school in the
  database/storage and renders it dynamically (see §10 in the product
  brief; no redeploy to change a school's logo or name).
- Literal "Holy Guide Christian School" branding, logo assets, and
  hardcoded Korean copy referencing a specific school's identity.
- `bootstrap-admin.sql` — a manual SQL script naming one hardcoded email
  as the first admin, requiring direct database access to bootstrap.
  Alimi's onboarding is fully self-service (`create_school_with_admin`
  RPC, see `docs/MULTI_TENANCY.md`).
- `class_periods` and `warning_entries` category CHECK-constrained,
  hardcoded, one-school (and partly religious) content.
- Free-text `students.grade`/`students.homeroom` with zero taxonomy —
  Alimi models `grade_levels` and `homerooms` as real per-school tables
  so reporting and validation have something to stand on, while still
  letting each school choose its own labels (G1, Grade 1, 1학년, 7E, ...).
- Hardcoded Korean-only semester boundaries in application code.
- `lib/supabase/config.ts` hard-requiring the Supabase URL to end in
  `.supabase.co` — a single-vendor lock-in assumption Alimi does not need
  to repeat (Alimi still uses Supabase, but doesn't hard-fail on the
  hostname shape).
- A single global `admin` role that means both "runs this one school" and
  (implicitly) "runs the software" — Holga has no concept of a
  platform-level operator distinct from a school's own admin at all,
  because it only ever has one tenant. Alimi's `platform_admins` table
  (§10 in the product brief) is entirely new, not a port.

## 9. Net effect on Alimi's schema design

Every helper function pattern, RLS-first-writes discipline, ledger-style
append-only model (attendance, behavior), atomic-RPC-with-rollback
pattern (school creation, signup redemption, account creation), signed
storage URL flow, and narrow-realtime-event-table pattern described above
is carried into Alimi's migrations. Every one of them is extended with a
`school_id`/tenant dimension that Holga never needed. The two concrete bugs
found (the under-scoped `notice_attachments` policy, and the
initially-missing INSERT policies on `warning_entries`) are fixed at the
source by writing full CRUD policies for every table in its very first
migration, rather than iterating into them the way Holga did.
