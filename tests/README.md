# Tests

## RLS tenant isolation (`rls_isolation.test.sql`)

Plain-SQL test suite (no pgTAP dependency) that proves tenant isolation at
the database layer — the layer that actually matters, since RLS is the
real enforcement boundary in this app (see `docs/SECURITY.md`). It creates
two schools with staff/parents/students, then runs assertions as each
simulated user (via the `request.jwt.claims` GUC + `SET ROLE authenticated`,
exactly how PostgREST/Supabase evaluates RLS) confirming:

- A school's admin/teacher only ever sees their own school's students,
  notices, and guardian links — never another school's, not even by
  guessing an id.
- A parent sees only their own linked child, never another family's.
- A user who is `school_admin` at School A and `parent` at School B gets
  exactly the union of what each role grants at each school — nothing
  more.
- An anonymous/no-session connection sees nothing.
- Holding a school_admin role never resolves as platform-admin access.

The whole script runs inside `begin; ... rollback;`, so it never leaves
fixture data behind.

### Running locally against plain Postgres

Real Supabase provides `auth.uid()`/`auth.role()`, the `auth.users` table,
and `storage.buckets`/`storage.objects`. `local_postgres_stub.sql`
reproduces just enough of that surface (with `auth.uid()`/`auth.role()`
implemented identically to Supabase's own functions, reading the
`request.jwt.claims` GUC) so the same test file runs unmodified against a
throwaway local Postgres:

```bash
createdb alimi_test
psql -d alimi_test -v ON_ERROR_STOP=1 -f tests/local_postgres_stub.sql
for f in supabase/migrations/*.sql; do
  psql -d alimi_test -v ON_ERROR_STOP=1 -f "$f"
done
psql -d alimi_test -v ON_ERROR_STOP=1 -f tests/rls_isolation.test.sql
```

A clean run ends with a single `ALL ASSERTIONS PASSED` row. Any RLS
regression raises `ASSERTION FAILED: ...` and aborts.

### Running against a real Supabase project

Apply `supabase/migrations/*.sql` to the project first (see
`docs/SUPABASE_SETUP.md`), then run `rls_isolation.test.sql` with `psql`
against the project's connection string using a role that can insert into
`auth.users` directly (the Supabase `postgres` role). No changes to the
test file are needed — `auth.uid()`/`auth.role()` already behave the way
the stub emulates.

## Application-level tests

Deferred until the Next.js app has enough server actions/API routes to
warrant integration tests beyond what RLS already guarantees — see the
Phase 8 hardening pass in `docs/ARCHITECTURE.md` for what's planned
(signup invite redemption, CSV import validation, notice targeting at the
API layer).
