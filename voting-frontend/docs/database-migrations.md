# Database deployment and migration history

`supabase/migrations/0001_…sql` through `0012_…sql` preserve the old twelve-file
installation in its original order. Transaction wrappers are owned by the runner.
`0013_recovery_and_normalization.sql` adds the audit fixes. Future changes append
a new consecutive number; never edit, rename, delete, or rerun an applied file.
`supabase/legacy/` contains superseded reference scripts, not deployment inputs.

## New Supabase project

1. Make a backup and verify the intended project/database. Obtain its direct or
   session-mode PostgreSQL connection string. Transaction-mode pooling is not
   suitable for this multi-statement deployment session.
2. Set `DATABASE_URL` securely in the shell. Never commit it or put it in a
   `VITE_` variable. Keep TLS certificate verification enabled for remote hosts.
3. From `voting-frontend`, run `npm ci`, `npm run db:status`, then
   `npm run db:migrate`.
4. The runner takes a database advisory lock, applies the complete pending batch
   in one transaction, and inserts version/name/SHA-256 into
   `app_migrations.history`. Failure rolls the entire batch back, including its
   history. Normal application roles cannot read or modify the ledger.
5. Run `supabase/event-readiness-verification.sql` as a read-only catalog check.
   Review every result; resolve failures before an event.
6. Configure Auth redirects/SMTP and create the first admin as described in the
   application README. Enable Supabase Cron, then run
   `supabase/automatic-winner-cron.sql` once to register the optional scheduler.
   Scheduler registration is an operational integration step outside the schema
   chain. The SQL is idempotent; it does not reopen or rewrite elections.

Supabase owns `auth` and `storage`. The migration runner does not create those
platform schemas or their service roles in production.

## Existing database without a ledger

Do not run the old files again, and do not mark migrations applied solely from
SQL Editor history. Start with a restored staging copy and a fresh backup.

```sh
npm run db:adopt-legacy
npm run db:status
npm run db:migrate
```

Adoption constructs the trusted 0001–0012 schema in an isolated PostgreSQL
runtime, then compares functions, columns, constraints, indexes, policies, RLS,
and relevant grants with the target. It records the twelve checksums only when
the schema matches. It does not replay application SQL or replace election data.
The new forward migration is applied separately by `db:migrate`.

If adoption reports drift, no history is recorded. Inspect the named catalog
objects on staging, compare them with the canonical migrations, and prepare a
reviewed reconciliation for that specific database. Additional custom objects
or PostgreSQL definition-format differences can also cause conservative
rejection. There is deliberately no force-stamp option. Preserve custom work
and data; do not reset production to make the comparison pass.

## Tests and upgrade discipline

`npm run test:db` starts an empty in-memory PostgreSQL instance using PGlite.
It installs the test-only Supabase platform contract, applies the real migration
files, and exercises nomination/primary/final RPCs as authenticated members and
admins. Tests cover zero-turnout recovery, bans, duplicate ballots, restricted
roles, immutable history, rollback, and adoption with and without schema drift.

CI repeats the application database tests on an empty PostgreSQL 17 service.
The `DATABASE_TEST_URL` option refuses remote hosts and databases whose names do
not start with `alc_test`. Auth/Storage HTTP behavior and email delivery still
need staging integration tests; the test contract is not a replacement for the
Supabase services.

Deploy additive database changes before frontend changes that require them.
Run the database tests and a staging upgrade before production. The frontend
CI deploy job does not receive database administrator credentials and does not
silently migrate production. Use a forward repair migration for defects; the
runner intentionally does not expose destructive down migrations.
