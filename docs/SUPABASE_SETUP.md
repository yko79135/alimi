# Supabase Setup

Alimi needs its own Supabase project — never point it at an existing
Holga (or any other) production project. This is a single project shared
by every school tenant; there is no per-school Supabase project.

## 1. Create the project

1. Create a new project at [supabase.com](https://supabase.com).
2. Note the **Project URL** and **anon/publishable key** (Project
   Settings → API) — these become `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Note the **service_role key** from the same page — this becomes
   `SUPABASE_SERVICE_ROLE_KEY`. **Never** put this in a `NEXT_PUBLIC_*`
   variable or commit it anywhere.

## 2. Apply the schema

Run every file in `supabase/migrations/` **in filename order** (they're
timestamp-prefixed, so a plain alphabetical sort is correct) via the
Supabase SQL Editor, pasting and running each one in turn, or with the
Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Each migration is self-contained and idempotent-ish (`drop policy if
exists` / `create or replace function` / `if not exists` throughout), so
re-running the full set on a project that already has some of them
applied is safe.

## 3. Bootstrap the first platform admin

School creation is fully self-service (see `docs/MULTI_TENANCY.md`), but
platform-admin access is not, on purpose. After the account that should
run the Alimi deployment itself has signed up through the normal
`/signup` flow:

1. Open `supabase/bootstrap-platform-admin.sql`.
2. Replace the placeholder email with that account's real email.
3. Run it once in the SQL Editor.

## 4. Auth configuration

- **Authentication → URL Configuration**: set **Site URL** to your
  deployed app's URL (e.g. `https://app.yourdomain.com`), and add
  `{site-url}/auth/callback` to **Redirect URLs** — this is required for
  both the staff-invite email flow and any future magic-link/password-
  recovery flows.
- **Authentication → Email Templates**: the default Supabase invite/
  confirmation email templates work out of the box; customize the
  wording/branding as needed (there is no Alimi-specific SMTP setup
  required to start — Supabase's built-in email sending is sufficient
  for development and light production use; configure a custom SMTP
  provider under **Authentication → SMTP Settings** before real-volume
  usage, since Supabase's default sender has rate limits).
- Email confirmation for the general `/signup` flow follows whatever
  your project's **Authentication → Providers → Email → Confirm email**
  setting is; the app handles both cases (see `app/signup/actions.ts`'s
  `checkEmail` branch). Parent self-signup via `/join/[token]` uses
  `auth.admin.createUser` with `email_confirm: true` intentionally — the
  verification-code flow described in `docs/MULTI_TENANCY.md` is treated
  as sufficient identity proof for guardians, since the friction of a
  second confirmation email would work against the "school hands a
  parent a code and they're in immediately" goal of that flow.

## 5. Storage buckets

Created automatically by
`supabase/migrations/20260811011500_storage.sql`
(`school-logos` public, `notice-attachments` private, both with size/
MIME-type limits and RLS policies). No manual bucket setup needed.

## 6. Realtime

`guardian_dashboard_events` is added to the `supabase_realtime`
publication by its migration. No manual toggle needed unless your
project has Realtime disabled at the project level (Project Settings →
Realtime), which it isn't by default.

## 7. Environment variables

Copy `.env.example` to `.env.local` for local development and fill in
the values from steps 1–3, plus (optional but recommended before
enabling the parent-facing "turn on notifications" toggle) a VAPID key
pair for Web Push:

```bash
npx web-push generate-vapid-keys
```

See `.env.example` for the full variable list and `docs/VERCEL_DEPLOYMENT.md`
for where these go in production.

## 8. Verify locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`, create an account, create a school, and
walk through the setup checklist on the staff dashboard.
