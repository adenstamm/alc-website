# Album Listening Club Website

React/Vite frontend for the Album Listening Club site and voting flow.

## Local setup

```sh
npm install
npm run dev
```

## Launch checklist

Before sharing the production URL:

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
smoke tests across desktop Chromium and a mobile viewport. GitHub Actions runs
the same gate for every pull request and push to `main`.

## Supabase voting setup

Voting is backed by Supabase auth, approved memberships, and a database uniqueness rule.

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`.
3. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Run the Supabase SQL files in this order:
   - `supabase/schema.sql`
   - `supabase/nomination-validation.sql`
   - `supabase/three-phase-voting.sql`
   - `supabase/site-content.sql`
   - `supabase/security-hardening.sql` **last**
5. Create your first account through `/account`.
6. In Supabase, manually set that row in `memberships` to `status = 'approved'` and `role = 'admin'`.
7. Use `/admin` to approve future members.

The database enforces one vote per approved account per poll phase through the `votes_one_per_user_per_poll_phase` constraint.

For phase-by-phase manual QA, see [`docs/manual-voting-test.md`](docs/manual-voting-test.md).
For Google OAuth and SMTP launch setup, see [`docs/auth-launch-checklist.md`](docs/auth-launch-checklist.md).
For the expected RLS/grant surface and read-only verification queries, see
[`docs/supabase-security-checklist.md`](docs/supabase-security-checklist.md).

Re-run `supabase/security-hardening.sql` after any older setup SQL file, because those files recreate their original grants and policies.

## Live site content

Run `supabase/site-content.sql` to enable admin editing for the current album.
The site uses bundled event content by default; to also manage events from Supabase,
set `VITE_ENABLE_SITE_EVENTS=true` in `.env.local`.
