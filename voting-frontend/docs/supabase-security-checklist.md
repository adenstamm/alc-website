# Supabase Security Checklist

Apply `supabase/security-hardening.sql` **last**, after all other SQL files. Re-run it whenever an older setup SQL file is re-run, because those files recreate earlier policies and grants.

## Expected public surface

The browser uses the publishable/anon key, so the `public` schema remains exposed through the Data API. Access is still denied unless both a SQL grant and an RLS policy (or an explicitly granted RPC) allow it.

Anonymous visitors should only have:

- `SELECT` on `site_events`, `record_shelf_covers`, and `album_archive_entries`, which are public website content.
- Public reads from the `record-shelf-covers` Storage bucket. Its files are intentionally public; only admins may upload, replace, or delete them.

Signed-in users additionally get the member/admin RPCs used by the app and these direct table operations:

| Table | Direct authenticated access | RLS result |
| --- | --- | --- |
| `memberships` | `SELECT`, `UPDATE` | Own row can be read; only admins can update rows. A member changes their own display name through the RPC. |
| `votes`, `vote_choices` | `SELECT` only | Members see their own ballot; admins can read all. Inserts only work through ballot RPCs. |
| `album_ratings` | `SELECT` only | Members see their own current-album rating; admins can read all. Inserts only work through the rating RPC. |
| `album_archive_entries` | `SELECT` | Everyone can read archived album averages; writes only occur inside the admin poll-creation RPC. |
| `site_events` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | Everyone can read; only admins can write. |
| `record_shelf_covers` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | Everyone can read; only admins can write. |

There should be no `anon` table privilege on `memberships`, `votes`, `vote_choices`, `polls`, `poll_candidates`, `banned_albums`, or `banned_artists`. The authenticated role should have no direct insert privilege on either ballot table.

Anonymous browsers must not have `EXECUTE` on any application RPC. The managed
`/api/current-poll` function calls `get_current_poll()` with a server-side role,
removes candidate/finalist arrays from anonymous responses, and applies a
per-IP rate limit. Approved signed-in members keep direct RPC access through
their bearer token.

## Dashboard checks before launch

- In **Database > Tables**, confirm RLS is enabled for every app table: `memberships`, `votes`, `vote_choices`, `album_ratings`, `album_archive_entries`, `polls`, `poll_candidates`, `banned_albums`, `banned_artists`, `site_events`, and `record_shelf_covers`.
- In **Project Settings > Data API**, keep the exposed schemas list minimal. `public` is required by this frontend; do not add a private/admin schema.
- In **Project Settings > Data API**, turn off **Automatically expose new tables and functions** (if shown) and keep the RLS-on-by-default option enabled. The migration also revokes default grants so new objects fail closed.
- In **Project Settings > API Keys**, use only the publishable/anon key in `VITE_SUPABASE_ANON_KEY`. Never put `service_role`, secret, or database credentials in a `VITE_` variable. Rotate any secret that has ever been committed or shipped to a browser.
- In **Authentication > Providers**, disable anonymous sign-ins unless you deliberately add support for anonymous accounts. Keep email confirmation enabled for password signups.
- In **Authentication > Attack Protection**, configure Cloudflare Turnstile for public email sign-up, password sign-in, and password-reset flows. Review Auth rate limits and keep leaked-password protection enabled when the plan exposes it.
- In **Authentication > URL Configuration**, set the exact production Site URL and only the required `/account` and `/reset-password` redirect URLs. Remove stale preview origins after launch.
- In **Storage**, confirm `record-shelf-covers` is the only intentionally public app bucket. Check that its insert/update/delete policies require `public.is_admin()`.
- Run the Supabase **Security Advisor** after applying the migration and after every schema change. Investigate any table in an exposed schema reported without RLS.

The advisor can flag intentionally callable `SECURITY DEFINER` RPCs.
`get_current_poll` is intentionally granted only to `authenticated` and
`service_role`; the other voting/admin RPCs are authenticated-only and perform
their own member/admin checks. Treat any additional callable definer function
as a problem rather than dismissing the category wholesale.

The `service_role` key bypasses RLS by design. These checks cannot make it safe to expose that key to the browser.

## SQL verification

Run these read-only queries in the SQL editor after the hardening migration.

All rows returned here should show `rls_enabled = true`:

```sql
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = any (array[
    'memberships', 'votes', 'vote_choices', 'album_ratings',
    'album_archive_entries', 'polls', 'poll_candidates', 'banned_albums',
    'banned_artists', 'site_events', 'record_shelf_covers'
  ])
order by c.relname;
```

Review the effective table grants. They should match the table above; in
particular, the ballot and rating tables should not show `INSERT`:

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by grantee, table_name, privilege_type;
```

Confirm that the unsafe ballot and rating insert policies are absent:

```sql
select tablename, policyname, cmd, roles
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in ('votes', 'vote_choices', 'album_ratings')
order by tablename, policyname;
```

`votes`, `vote_choices`, and `album_ratings` should only show their read/admin
policies; none should show an `INSERT` policy.

Review callable functions. `PUBLIC` and `anon` should have no application
function grants. `authenticated` should have the explicitly listed member/admin
RPCs in `security-hardening.sql`; `service_role` should only need
`get_current_poll()` for the managed API:

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by grantee, routine_name;
```

The RLS helpers live in the non-exposed `app_private` schema. Do **not** add that schema to Data API exposed schemas. `authenticated` needs `USAGE` on the schema and `EXECUTE` on those two helpers so policies can evaluate them, but they are not available as public RPCs.

```sql
select routine_schema, routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'app_private'
order by routine_name, grantee;
```

Only `authenticated` should have explicit `EXECUTE` rows for `is_admin` and `is_approved_member`; `PUBLIC` and `anon` should not.

Finally, confirm the intentional public bucket setting:

```sql
select id, public
from storage.buckets
where id = 'record-shelf-covers';
```

If cover files should be private, do not simply toggle this setting: the frontend currently uses public URLs and would need to switch to signed URLs first.
