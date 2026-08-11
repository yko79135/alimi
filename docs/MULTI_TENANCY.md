# Multi-Tenancy

## The tenant boundary is `school_id`, enforced by RLS — not by the app

Every table that holds school-owned data carries a `school_id` column, and
every one of those tables has Row Level Security enabled with real
`SELECT`/`INSERT`/`UPDATE`/`DELETE` policies from its first migration
(see `docs/HOLGA_REFERENCE_AUDIT.md` §1 for why "write full policies from
day one" is a hard rule here, not a suggestion — Holga's history shows
what happens when it isn't). **If someone edits a request to change a
`school_id` or a row id, Postgres denies the query before it returns a
row, regardless of what the client believed it was allowed to see.**
Hiding a button, or filtering a list in React, is never the security
boundary in this codebase.

### The helper functions

All policies are built on a small set of `SECURITY DEFINER` SQL
functions defined in `supabase/migrations/20260811010400_school_memberships.sql`:

```sql
has_school_role(target_school, roles[])  -- does the caller hold one of `roles` at `target_school`?
is_school_member(target_school)          -- any active role
is_school_staff(target_school)           -- school_admin or teacher
is_school_admin(target_school)           -- school_admin
is_school_parent(target_school)          -- parent
```

and, added once `students`/`guardian_students` exist,
`guardian_has_student(student_id)` and `guardian_can_see_notice(notice_id)`.
Every RLS policy in the schema is written in terms of these functions,
never inline role/tenant logic — one place to audit, one place to fix.

## Membership model: roles are per-(school, user), not global

```
profiles            -- one row per person (auth.users mirror)
school_memberships  -- (school_id, user_id, role, status) — the actual RBAC table
platform_admins     -- separate, small, unrelated to school roles
```

A person can hold **multiple roles at the same school** (a teacher who is
also a parent — two rows, `unique (school_id, user_id, role)`) and
**different roles at different schools** (school_admin at School A,
parent at School B — this is exactly the `Alice`/`Matthew` scenario in
the product brief, and it's covered by `tests/rls_isolation.test.sql`).
There is no single "role" column anywhere in the schema — Holga started
with one (`profiles.role`) and had to retrofit a many-to-many table
later (`docs/HOLGA_REFERENCE_AUDIT.md` §1); Alimi starts with the correct
shape.

## Platform admin is not a school role

`platform_admins` is a standalone table (`user_id` primary key) with its
own `is_platform_admin()` helper. Holding `school_admin` at even a
thousand schools never implies platform access, and vice versa — the two
are checked by entirely different functions, and `tests/rls_isolation.test.sql`
has an explicit assertion that a plain `school_admin` fails
`is_platform_admin()`. The first platform admin is granted manually via
`supabase/bootstrap-platform-admin.sql` after that person has signed up
through the normal flow — it is deliberately **not** self-service, unlike
school creation (see `docs/SECURITY.md` for why).

## Active school context: never trust a client-supplied `school_id`

A user who belongs to multiple schools has an "active school" — resolved
in `lib/tenant/active-school.ts` from a cookie (`alimi_active_school`)
that names *which of their own memberships* to prefer. Switching schools
(`app/app/actions.ts: switchActiveSchool`) re-verifies the target
membership belongs to the caller before setting the cookie. Critically,
**the cookie is only ever a UI convenience** — every Server Action and API
route that receives a `school_id` (from a form, a route param, a query
string) calls `requireSchoolRole()` / `requireSchoolStaff()` /
`requireSchoolAdmin()` (`lib/auth/require.ts`) to re-check membership
against the database before doing anything with it. A tampered cookie or
a hand-edited request can at most switch which of the *user's own* real
schools they're viewing; it can never grant access to a school they don't
belong to, because the RLS policies underneath don't care what the
cookie or the request claimed — they check `school_memberships` directly
via `auth.uid()`.

A user belonging to only one school never sees a switcher — see
`app/app/layout.tsx`.

## School onboarding: self-service, atomic

`create_school_with_admin(name, slug, timezone, locale)` is a single
`SECURITY DEFINER` RPC (`supabase/migrations/20260811010400_school_memberships.sql`)
that inserts the `schools` row and the creator's `school_admin`
membership **in one transaction**, and a trigger seeds a trialing
`subscriptions` row and default `notice_types`/`behavior_categories` on
insert. There is no window where a school exists without an owner, and
no manual SQL step required (contrast with Holga's `bootstrap-admin.sql`,
which required direct database access — see
`docs/HOLGA_REFERENCE_AUDIT.md` §8).

## Parent self-signup: a real second factor, not just name + grade

Holga's reusable parent-invite link matches a claimed child purely on
name + grade against the real roster — no second factor, and the audit
(`docs/HOLGA_REFERENCE_AUDIT.md` §2) documents the concrete weakness:
anyone with the link and a classmate's name/grade (routinely known to
other parents at a small school) can self-register as that child's
guardian.

Alimi's model:

- Every `students` row gets a server-generated, unguessable
  `verification_code` (8 unambiguous alphanumeric characters) at creation
  or CSV import time — never derived from or related to the student's
  name/grade.
- The school communicates this code to the family **out of band**
  (printed on enrollment paperwork, handed out at orientation) — never
  embedded in the shareable signup link itself.
- `parent_signup_links` are reusable and school-scoped, optionally
  restricted to one grade and/or configured to `requires_approval` (an
  admin reviews the match before the guardian link is created, even for
  an otherwise-valid code match).
- A signup submission must match **name + grade + verification code**
  against an *already-existing* student row. **Alimi never creates a new
  student record from self-reported signup data** — a real, deliberate
  departure from Holga, which would silently register a "new student"
  for any unmatched name (a source of both phantom-record bugs and a
  social-engineering angle). If a family's child genuinely isn't in the
  system yet, a staff member adds them first (directly or via CSV
  import), which also means every student on the roster has been through
  at least one human's judgment before any guardian can attach to them.
- Every signup attempt — matched, rejected, or pending approval — is
  logged to `parent_signup_requests`, giving admins visibility into
  suspicious activity (e.g. a burst of failed attempts), not just
  successful ones.
- The match RPC (`redeem_parent_signup_invite`) and the public link
  lookup (`get_active_signup_link`) both return a generic
  "no match"/"invalid link" for every failure mode — wrong name, wrong
  grade, wrong code, expired link, or a genuinely nonexistent student —
  so the endpoint can never be used to enumerate the roster or confirm
  whether a particular name exists at the school.

**Tradeoff being made explicitly**: this raises the friction of parent
onboarding — a family needs the code from the school, not just a link —
in exchange for closing an impersonation vector that's realistic in a
small-school setting where families know each other. A school that
prefers Holga's lower-friction model can still set `requires_approval:
false` and treat the verification code as the sole gate (as implemented);
there is currently no "code-optional" mode, and adding one would
reintroduce the original weakness, so it's deliberately not offered.

## Storage isolation

Both Storage buckets encode `school_id` as the first path segment
(`school-logos/{school_id}/...`, `notice-attachments/{school_id}/{notice_id}/...`),
and every `storage.objects` policy checks that segment via
`is_school_staff()`/`is_school_admin()`/`is_school_parent()` — see
`supabase/migrations/20260811011500_storage.sql`, including a
`try_cast_uuid()` helper so a malformed or non-UUID path segment (e.g. a
staff draft-upload path) fails the policy check *safely* (denies) instead
of throwing and aborting an unrelated user's query. `notice-attachments`
downloads never rely on storage policies alone — the API route
(`app/api/attachments/[id]/route.ts`) re-checks visibility through the
notices table via the caller's own RLS-scoped client before minting a
60-second signed URL with the admin client.

## Proven, not just designed

`tests/rls_isolation.test.sql` is a runnable test suite (see
`tests/README.md`) that creates two schools with staff/parents/students
and asserts, as each simulated user: staff only see their own school's
roster/notices/memberships; a parent sees only their linked child; a
multi-school user's access is exactly the union their roles grant, no
more; an anonymous session sees nothing; and a `school_admin` never
resolves as a platform admin. It passes against a real (locally stubbed)
Postgres instance running the actual migrations — this is not aspirational
documentation, it's checked.
