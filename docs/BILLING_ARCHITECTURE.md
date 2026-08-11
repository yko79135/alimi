# Billing Architecture

## What exists today

A plan catalog (`plans`) and one `subscriptions` row per school, both
defined in `supabase/migrations/20260811011300_billing.sql`. A school
starts `trialing` with a 30-day trial the moment it's created (a
trigger on `schools` insert). Three seed plans exist (`starter`,
`standard`, `pro`) with student/staff/storage limits and KRW prices as
placeholders — edit `plans` directly (platform-admin only, via RLS) to
match real pricing before launch.

Subscription state is **platform-admin-controlled**, per the product
brief: `app/platform/page.tsx` lets a platform admin change a school's
plan and its subscription is separately flipped between
`active`/`suspended` alongside the school's own `status` column when a
platform admin suspends/reactivates a tenant
(`app/platform/actions.ts`). There is **no payment collection anywhere
in this codebase** — no Stripe integration, no fake "payment succeeded"
flow, nothing that pretends to charge a card. A school's access is
granted or revoked entirely by a human platform admin's decision, today.

## Why no payment provider is wired in yet

The product brief is explicit: don't hardwire the whole architecture to
one payment provider, and don't build fake payment success. Building a
real Stripe (or Korean PG) integration well — webhooks, idempotent event
handling, proration, dunning, tax — is a substantial scope on its own
and was deliberately deferred so it could be done properly rather than
half-built. What's here instead is the **shape** a provider integration
slots into without a schema change:

```sql
subscriptions (
  school_id,
  plan_id,
  status,                 -- trialing | active | past_due | canceled | suspended
  billing_provider,        -- 'manual' today; 'stripe' / a PG name later
  billing_provider_ref,    -- e.g. a Stripe subscription id, once one exists
  trial_ends_at,
  current_period_end
)
```

## Adding a real provider later

1. Add a webhook route (e.g. `app/api/webhooks/stripe/route.ts`) that
   verifies the provider's signature, using the **admin client** (no
   user session exists for a webhook) — this would be a new, explicit,
   narrowly-scoped service-role use case, consistent with the existing
   ones documented in `docs/SECURITY.md`.
2. On checkout completion, set `billing_provider` and
   `billing_provider_ref`, and update `status`/`current_period_end` from
   the provider's subscription object — a straightforward `UPDATE` on
   the existing `subscriptions` row, no new tables needed for the common
   case.
3. Keep `plans.key` as the stable join point between your Alimi plan
   catalog and the provider's own price/product IDs (add a
   `billing_provider_price_id` column to `plans` when that's needed,
   rather than hardcoding IDs in application code).
4. Decide, before launch, whether self-service downgrade/cancellation is
   exposed to `school_admin`s directly or stays platform-admin-mediated
   — today it's the latter (RLS on `subscriptions` only permits
   `is_platform_admin()` to write), matching "for the initial
   implementation, subscriptions can be platform-admin-controlled" in
   the product brief.

## Enforcing plan limits

`plans.max_students` / `max_staff` / `max_storage_mb` exist as data but
are **not enforced anywhere yet** — CSV import, student creation, and
staff invites don't currently check them. This is listed as remaining
work: the natural place to add the check is inside
`app/api/students/import/route.ts` and
`app/app/students/actions.ts:createStudent` (compare the school's active
student count against its plan's `max_students` before inserting), and
similarly in `app/app/staff/actions.ts:inviteStaff`.
