# AlbumASU application

The production React, authentication, and voting application behind
[albumasu.com](https://albumasu.com).

AlbumASU gives Arizona State University's Album Listening Club a single system
for member approval, album nominations, primary elections, ranked final
ballots, instant-runoff results, events, and its listening archive. The platform
has supported more than 100 members across four production elections.

For the project overview, architecture, and measured results, start with the
[repository README](../README.md).

## Product capabilities

### Member experience

- Email/password and Google OAuth authentication
- Email verification and password recovery
- Membership approval status
- One nomination per election
- One-to-five album primary ballots
- Complete ranked ballots for five finalists
- Persistent ballot confirmation and duplicate-vote prevention

### Administrator experience

- Approve, reject, and review memberships
- Create polls and advance election phases
- Review nomination and primary totals
- Select and order five finalists
- Inspect instant-runoff rounds and tie states
- Edit current-album, event, and archive content

### Public website

- Current listening selection
- Searchable and sortable album archive
- Upcoming and recent events
- Club information and privacy documentation
- Responsive navigation and accessible keyboard flow

## Voting integrity

Critical election operations are implemented as PostgreSQL RPCs rather than a
sequence of client-side writes. Each submission validates:

- the authenticated user and approved membership;
- the active election and expected phase;
- one submission per user and phase;
- candidate membership and ballot shape;
- nomination bans and normalized album/artist names.

The transaction either commits the complete vote and its choices or writes
nothing. Database constraints, row-level security, restricted grants, and
transactional functions provide overlapping protection.

The deterministic instant-runoff engine is independently unit tested for
multi-round transfers, exhausted ballots, invalid rankings, and ties.

## Local development

```sh
npm install
cp .env.example .env.local
npm run dev
```

Configure:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_TURNSTILE_SITE_KEY=YOUR_PUBLIC_TURNSTILE_SITE_KEY
```

The public interface can run without Supabase configuration. Authentication,
live membership state, and production voting require a configured project.

The production `/api/current-poll` function additionally requires
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as
server-side Azure application settings. The service-role key must never be put
in a `VITE_` variable or shipped to the browser.

## Database setup

Database changes live in numbered, immutable `supabase/migrations/*.sql` files.
The runner applies pending migrations in order, in one transaction, and records
their SHA-256 checksums in `app_migrations.history`. Re-running it is a no-op;
changed or missing historical files are rejected.

```sh
# Supply DATABASE_URL securely in your shell; use a direct/session connection.
npm run db:status
npm run db:migrate
```

For an existing database created with the old SQL Editor workflow, first follow
[the verified legacy-adoption procedure](docs/database-migrations.md). The runner
refuses to replay the initial schema over an untracked existing database.

Run `npm run test:db` to install from an empty embedded PostgreSQL database and
exercise voting, roles, migration replay, rollback, and legacy adoption. CI also
runs the same suite against PostgreSQL 17. Production Supabase platform objects
are represented by a test-only auth/storage contract; email delivery and the
Storage HTTP API are separate integration concerns.

Create the first account through `/account`, then promote its membership to
`status = 'approved'` and `role = 'admin'` using the Supabase administrator.
Enable Supabase Cron and run `supabase/automatic-winner-cron.sql` to configure
the optional deadline scheduler. Manual closing publishes immediately. A closed
final with no ballots can be reopened by an admin for another 18 hours.

See [database deployment and recovery](docs/database-migrations.md) for backups,
legacy adoption, schema drift, scheduler setup, and catalog verification.

## Quality and delivery
- Set the Supabase production Site URL to `https://albumasu.com`.
- Add `https://albumasu.com/account` and `https://albumasu.com/reset-password`
  to the Supabase redirect allow list.
- Update the Google OAuth redirect URI in Google Cloud and Supabase.
- Configure custom SMTP for reliable signup and password reset email.
- Run `npm run lint`, `npm run test`, and `npm run build`.
- Complete [`docs/production-launch-checklist.md`](docs/production-launch-checklist.md).

## Automated quality checks

Run the complete local quality gate with:

```sh
npm run check
```

This runs linting, voting/content unit tests, a production build, and Playwright
tests against a production fixture build across desktop Chromium and a mobile viewport. GitHub Actions runs
the same gate for every pull request and push to `main`.

The production build also prerenders every known route into its own HTML file.
Public pages therefore ship useful headings, descriptions, social metadata, and
canonical URLs before React starts; authenticated routes ship equivalent
`noindex` fallbacks.

The quality gate runs:

1. ESLint
2. Voting and content unit tests
3. A production Vite build
4. Clean-database migration and voting tests
5. Playwright tests against the production build across desktop Chromium and mobile

GitHub Actions executes the same gate for pull requests. Merges to `main`
deploy the verified production build to Azure Static Web Apps.

## Performance testing

The k6 suite covers Cloudflare/Azure page delivery and the rate-limited
same-origin poll API. Lightweight, read-only production smoke checks run every
six hours; load testing is restricted to an isolated staging environment.

- [Test design and safety constraints](docs/performance-testing.md)
- [Verified 100-user benchmark](docs/performance-benchmark.md)

## Operational documentation

- [Production launch checklist](docs/production-launch-checklist.md)
- [Authentication and email setup](docs/auth-launch-checklist.md)
- [Supabase security verification](docs/supabase-security-checklist.md)
- [Manual election test plan](docs/manual-voting-test.md)
- [Azure infrastructure](infra/README.md)
