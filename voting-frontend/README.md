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
```

The public interface can run without Supabase configuration. Authentication,
live membership state, and production voting require a configured project.

## Database setup

Apply the SQL files in this order:

1. `supabase/schema.sql`
2. `supabase/nomination-validation.sql`
3. `supabase/three-phase-voting.sql`
4. `supabase/site-content.sql`
5. `supabase/security-hardening.sql` **last**

Create the first account through `/account`, then promote its `memberships` row
to `status = 'approved'` and `role = 'admin'`. Future accounts can be reviewed
from the application admin page.

Reapply `security-hardening.sql` after any older setup script because those
scripts recreate their original grants and policies.

## Quality and delivery

```sh
npm run check
```

The quality gate runs:

1. ESLint
2. Voting and content unit tests
3. A production Vite build
4. 22 Playwright tests across desktop Chromium and a mobile viewport

GitHub Actions executes the same gate for pull requests. Merges to `main`
deploy the verified production build to Azure Static Web Apps.

## Performance testing

The k6 suite covers Azure page delivery and the public Supabase/PostgreSQL poll
RPC. A controlled profile ramps to 100 concurrent virtual users; lightweight
production smoke checks run every six hours.

- [Test design and safety constraints](docs/performance-testing.md)
- [Verified 100-user benchmark](docs/performance-benchmark.md)

## Operational documentation

- [Production launch checklist](docs/production-launch-checklist.md)
- [Authentication and email setup](docs/auth-launch-checklist.md)
- [Supabase security verification](docs/supabase-security-checklist.md)
- [Manual election test plan](docs/manual-voting-test.md)
- [Azure infrastructure](infra/README.md)
