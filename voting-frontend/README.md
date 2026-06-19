# Album Listening Club Website

React/Vite frontend for the Album Listening Club site and voting flow.

## Local setup

```sh
npm install
npm run dev
```

REMEMBER TO CHANGE GOOGLE OAUTH REDIRECT!! WHEN U GO LIVE

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
5. Create your first account through the vote page.
6. In Supabase, manually set that row in `memberships` to `status = 'approved'` and `role = 'admin'`.
7. Use `/admin` to approve future members.

The database enforces one vote per approved account per poll phase through the `votes_one_per_user_per_poll_phase` constraint.

For phase-by-phase manual QA, see [`docs/manual-voting-test.md`](docs/manual-voting-test.md).
For Google OAuth and SMTP launch setup, see [`docs/auth-launch-checklist.md`](docs/auth-launch-checklist.md).

## Live site content

Run `supabase/site-content.sql` to enable admin editing for the current album.
The site uses bundled event content by default; to also manage events from Supabase,
set `VITE_ENABLE_SITE_EVENTS=true` in `.env.local`.
