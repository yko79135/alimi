# Vercel Deployment

## 1. Import the repository

Import `yko79135/alimi` into Vercel (Framework Preset: Next.js — detected
automatically). One Vercel project serves every school tenant; there is
no per-school deployment.

## 2. Environment variables

Set these in Vercel Project Settings → Environment Variables (Production,
and Preview if you want preview deployments to work against the same or
a separate Supabase project):

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Project Settings → API — **server-only**, do not expose |
| `NEXT_PUBLIC_APP_URL` | Your production URL, e.g. `https://app.yourdomain.com` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | same command, **server-only** |
| `VAPID_SUBJECT` | e.g. `mailto:support@yourdomain.com` |

Never commit real values for any of these — see `.env.example`.

## 3. Point Supabase Auth at the deployed URL

In the Supabase dashboard: **Authentication → URL Configuration**, set
**Site URL** to the Vercel production URL and add
`{that-url}/auth/callback` to **Redirect URLs** (see
`docs/SUPABASE_SETUP.md` step 4). Without this, staff invite emails will
redirect to the wrong place.

## 4. Deploy

Push to the branch Vercel is configured to deploy from. `next build`
runs the TypeScript compiler as part of the build (`Running TypeScript
...` in the build log) — a type error fails the build, which is the
intended safety net.

## 5. Custom domain

Add your domain in Vercel Project Settings → Domains, then update
`NEXT_PUBLIC_APP_URL` and the Supabase Site URL/Redirect URLs to match
before relying on invite emails or Web Push deep links.

## 6. What's NOT set up yet

- **No CI pipeline** (GitHub Actions or equivalent) exists in this
  repository — Vercel's own build-time typecheck/build is the only
  automated gate today. Add a workflow running `npm run typecheck`,
  `npm run lint`, and the SQL test suite (`tests/rls_isolation.test.sql`)
  against a throwaway Postgres before merging, before this is
  production-hardened for a team beyond one operator.
- **No preview-environment Supabase project.** Preview deployments will
  share the production Supabase project's data unless you provision a
  separate project and branch the environment variables per Vercel
  environment.
- **No automated database migration step in the deploy pipeline** —
  applying `supabase/migrations/*.sql` is currently a manual step (see
  `docs/SUPABASE_SETUP.md`), not run automatically on deploy. For a team
  beyond one operator, wire `supabase db push` into CI against a
  migrations-only service account.
