# Album Listening Club Website

React/Vite frontend for the Album Listening Club site and voting flow.

## Local setup

```sh
npm install
npm run dev
```

## Supabase voting setup

Voting is backed by Supabase auth, approved memberships, and a database uniqueness rule.

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`.
3. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Run `supabase/schema.sql` in the Supabase SQL editor.
5. Create your first account through the vote page.
6. In Supabase, manually set that row in `memberships` to `status = 'approved'` and `role = 'admin'`.
7. Use `/admin` to approve future members.

The database enforces one vote per approved account per poll through the `votes_one_per_user_per_poll` constraint.
