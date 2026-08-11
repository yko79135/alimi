# Security

Alimi holds information about minors. This document states the security
model plainly, including what's implemented and what's still a gap —
being wrong quietly is worse than being incomplete visibly.

## Defense in depth, in order of what actually stops an attack

1. **Postgres RLS** — the real boundary. Every tenant-owned table has
   policies covering every operation the app performs; see
   `docs/MULTI_TENANCY.md` for the helper-function pattern. This is what
   stops a manually-edited request, not application code.
2. **Server-side membership re-verification** — `lib/auth/require.ts`'s
   `requireSchoolRole()` et al. re-check a caller's membership against
   the database before any Server Action or API route acts on a
   client-supplied `school_id`. This exists even though RLS would also
   catch a mismatch, because it lets the app return a clean 403 instead
   of a confusing empty result, and because some operations (Web Push
   recipient resolution, storage signed URLs) go through the
   RLS-bypassing admin client and need their own gate.
3. **Application-level input validation** — form/route handlers reject
   malformed input (dates, enum values, file types/sizes) before it
   reaches the database. Constraints are also enforced at the database
   layer (CHECK constraints, NOT NULL, foreign keys) as a second line of
   defense, since app-level validation can have bugs.

## Service-role key usage — the exhaustive list

The `SUPABASE_SERVICE_ROLE_KEY` (in `lib/supabase/admin.ts`,
`server-only`) bypasses RLS entirely. It is used in exactly these places,
and nowhere else:

- `app/app/staff/actions.ts` — `auth.admin.inviteUserByEmail` /
  `auth.admin.listUsers` (no RLS equivalent for user provisioning).
- `app/join/[token]/actions.ts` — `auth.admin.createUser` for parent
  self-signup, and the `redeem_parent_signup_invite` RPC call (the new
  guardian has no session yet at that point in the flow).
- `app/app/notices/actions.ts` — minting a signed Storage upload URL for
  attachments.
- `app/api/attachments/[id]/route.ts` — minting a signed *download* URL,
  **only after** the caller's own RLS-scoped client has confirmed they
  can see the parent notice.
- `lib/push/send.ts` — reading *other users'* `push_subscriptions` rows
  to deliver Web Push, which those users' own RLS policy (owner-only)
  correctly forbids to everyone else, including staff.
- `app/platform/actions.ts` is the one exception that does NOT use the
  admin client — platform-admin mutations go through the caller's own
  RLS-scoped session, and a database trigger
  (`protect_school_status` in `20260811010400_school_memberships.sql`)
  independently blocks a non-platform-admin from flipping a school's
  `status`, so there's no reliance on the service role there at all.

**The service-role key must never reach the browser.** It's read only in
server-only modules (enforced by the `"server-only"` import in
`lib/supabase/admin.ts`, which fails the build if imported from a Client
Component) and is never a `NEXT_PUBLIC_*` variable.

## IDOR / cross-tenant enumeration

- Every list/detail query is scoped by `school_id` at the RLS layer, so
  guessing another school's UUIDs returns empty results, not an error
  that would confirm existence.
- The signup-link lookup (`get_active_signup_link`) and the
  parent-signup redemption RPC both return a single generic failure for
  every invalid case (bad token, expired, wrong name, wrong grade, wrong
  code) — see `docs/MULTI_TENANCY.md` — specifically so they can't be
  used as an oracle to enumerate a school's roster or valid tokens.
- CSV/data exports (`app/api/exports/*`) always resolve `school_id`
  through `requireSchoolStaff()`, never trusting the query string alone
  to determine which rows to return.

## Invitations

- **Staff invites** ride Supabase's own `auth.admin.inviteUserByEmail`
  email flow (token generation, expiry, and delivery handled by
  Supabase Auth) rather than a custom token system — one less thing to
  get wrong. A `school_memberships` row is created with `status:
  'invited'` immediately, and only flips to `'active'` via
  `accept_school_invite()`, a `SECURITY DEFINER` RPC that lets a user
  activate *only their own* invited row (see
  `supabase/migrations/20260811011600_staff_invite_accept.sql`) —
  it cannot be used to activate someone else's membership or change a
  role.
- **Revoking** a pending staff invite deletes the `invited` membership
  row rather than hard-deleting the underlying `auth.users` account —
  deliberate, because that same person may hold a legitimate,
  unrelated membership at a different school (the whole point of the
  membership model), and deleting their auth account would destroy that
  too.
- **Parent signup links** are reusable, revocable (`active` flag, soft),
  optionally expiring, optionally use-capped, and require a
  per-student verification code as described in `docs/MULTI_TENANCY.md`.

## Storage

Both buckets are tenant-path-scoped and RLS-protected; see
`docs/MULTI_TENANCY.md`'s "Storage isolation" section. `notice-attachments`
is a **private** bucket — downloads always go through a server route that
re-checks visibility before minting a 60-second signed URL, never a
long-lived or public link. `school-logos` is public-read by design
(branding must render on the unauthenticated landing page and PWA
manifest) but write-restricted to that school's admin.

## Error handling

Server Actions and API routes catch `AuthError` (from
`lib/auth/require.ts`) and return a clean, user-safe message with the
right HTTP status; unexpected errors are logged server-side
(`console.error`) and returned to the client as a generic
"something went wrong" message — never a raw Postgres error, stack
trace, or internal identifier. This is deliberately less sophisticated
than a full structured-logging/request-ID system (no error tracking
service is wired up in v1) — see "Remaining work" in the top-level
summary.

## What is NOT implemented yet (be honest about gaps)

- **Rate limiting.** Public endpoints (`/join/[token]`, the signup-link
  lookup RPCs, `/api/signup`-style flows) have no request-rate limiting
  in this codebase. Before accepting real signups, put these behind a
  provider-level rate limiter (Vercel's, or a Supabase Edge Function
  with a KV-backed limiter) — this is explicitly called out as required
  hardening before launch.
- **Automated dependency/vulnerability scanning** is not wired into CI
  (there is no CI configuration in this repository yet — see
  `docs/VERCEL_DEPLOYMENT.md`).
- **Structured audit-log alerting** (e.g., paging on a burst of failed
  signup attempts) — the data is captured (`parent_signup_requests`,
  `audit_logs`) but nothing consumes it proactively yet.
- **Data export for a specific guardian/data-subject request** (a
  "download everything about me" self-service flow) is not built;
  today an admin would need to query the database directly to fulfill
  such a request. Each school customer remains responsible for its own
  privacy/retention policy and legal compliance — this product provides
  the controls (archiving, deactivation, scoped access, audit logs) but
  does not itself constitute legal compliance with any specific
  jurisdiction's student-data law.

## Privacy controls that do exist

- Archiving (not deleting) students and deactivating (not deleting)
  staff/guardian memberships, preserving historical attendance/behavior/
  notice records while cutting off access.
- Hard deletion of a student is admin-only and separate from archiving.
- Deactivating a `school_membership` immediately cuts off access to
  every linked child for a guardian, and to every school resource for
  staff, because `guardian_has_student()`/`is_school_staff()` check
  `status = 'active'` — no separate cleanup step needed.
- Tenant-scoped audit logging for the administrative actions listed in
  the product brief (student create/edit/archive, membership changes,
  guardian links, attendance/behavior corrections, notice deletion,
  invite issuance/revocation, settings changes) — see
  `lib/audit/log.ts` and `app/app/audit/page.tsx`. Audit rows store
  identifiers and small metadata, never full record bodies.
