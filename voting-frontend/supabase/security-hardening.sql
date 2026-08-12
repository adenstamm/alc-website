-- Least-privilege API hardening for the Album Listening Club schema.
-- Run this LAST, after every other SQL file in this directory. Re-run it after
-- any older setup file that creates a function, policy, or table grant.

begin;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Supabase
-- may also install default table grants for API roles. Make future objects
-- private until a migration grants the exact access the frontend needs.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges in schema public
  revoke all privileges on sequences from public, anon, authenticated;

-- API roles need USAGE on the exposed schema, but they must never be able to
-- create objects that could be resolved by a SECURITY DEFINER search path.
revoke create on schema public from public, anon, authenticated;

-- Keep RLS asserted even if a table was recreated before this migration ran.
alter table public.memberships enable row level security;
alter table public.votes enable row level security;
alter table public.banned_albums enable row level security;
alter table public.banned_artists enable row level security;
alter table public.polls enable row level security;
alter table public.poll_candidates enable row level security;
alter table public.vote_choices enable row level security;
alter table public.record_shelf_covers enable row level security;
alter table public.site_events enable row level security;

-- RLS role checks live outside the exposed `public` schema. Authenticated
-- requests may execute them inside policies, but PostgREST cannot offer them
-- as /rpc endpoints because app_private is not an exposed schema.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

alter default privileges in schema app_private
  revoke execute on functions from public, anon, authenticated;

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = (select auth.uid())
      and status = 'approved'
      and role = 'admin'
  );
$$;

create or replace function app_private.is_approved_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = (select auth.uid())
      and status = 'approved'
  );
$$;

revoke execute on function app_private.is_admin() from public, anon, authenticated;
revoke execute on function app_private.is_approved_member() from public, anon, authenticated;
grant execute on function app_private.is_admin() to authenticated;
grant execute on function app_private.is_approved_member() to authenticated;

-- Rebuild policies that use role helpers so none depend on a callable helper
-- in the exposed public schema. Wrapping fixed-value helpers in SELECT also
-- lets PostgreSQL evaluate each one once per statement.
drop policy if exists "members can read own membership" on public.memberships;
create policy "members can read own membership"
on public.memberships
for select
to authenticated
using ((select auth.uid()) = user_id or (select app_private.is_admin()));

drop policy if exists "admins can update memberships" on public.memberships;
create policy "admins can update memberships"
on public.memberships
for update
to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists "members can read own votes" on public.votes;
create policy "members can read own votes"
on public.votes
for select
to authenticated
using ((select auth.uid()) = user_id or (select app_private.is_admin()));

drop policy if exists "admins can delete votes" on public.votes;
create policy "admins can delete votes"
on public.votes
for delete
to authenticated
using ((select app_private.is_admin()));

drop policy if exists "anyone can read active polls" on public.polls;
create policy "anyone can read active polls"
on public.polls
for select
to anon, authenticated
using (is_active);

drop policy if exists "admins can manage polls" on public.polls;
create policy "admins can manage polls"
on public.polls
for all
to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists "approved members can read poll candidates" on public.poll_candidates;
create policy "approved members can read poll candidates"
on public.poll_candidates
for select
to authenticated
using ((select app_private.is_approved_member()));

drop policy if exists "admins can manage poll candidates" on public.poll_candidates;
create policy "admins can manage poll candidates"
on public.poll_candidates
for all
to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists "members can read own vote choices" on public.vote_choices;
create policy "members can read own vote choices"
on public.vote_choices
for select
to authenticated
using (
  (select app_private.is_admin())
  or exists (
    select 1
    from public.votes v
    where v.id = vote_choices.vote_id
      and v.user_id = (select auth.uid())
  )
);

drop policy if exists "admins can manage banned albums" on public.banned_albums;
create policy "admins can manage banned albums"
on public.banned_albums
for all
to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists "admins can manage banned artists" on public.banned_artists;
create policy "admins can manage banned artists"
on public.banned_artists
for all
to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists "Admins can manage record shelf covers" on public.record_shelf_covers;
create policy "Admins can manage record shelf covers"
on public.record_shelf_covers
for all
to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists "Admins can upload record shelf cover files" on storage.objects;
create policy "Admins can upload record shelf cover files"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'record-shelf-covers' and (select app_private.is_admin()));

drop policy if exists "Admins can update record shelf cover files" on storage.objects;
create policy "Admins can update record shelf cover files"
on storage.objects
for update
to authenticated
using (bucket_id = 'record-shelf-covers' and (select app_private.is_admin()))
with check (bucket_id = 'record-shelf-covers' and (select app_private.is_admin()));

drop policy if exists "Admins can delete record shelf cover files" on storage.objects;
create policy "Admins can delete record shelf cover files"
on storage.objects
for delete
to authenticated
using (bucket_id = 'record-shelf-covers' and (select app_private.is_admin()));

-- Ballots must go through the phase-aware RPCs. The old policies allowed an
-- approved user to insert a vote for an arbitrary poll/phase and then attach
-- choices without the RPC limits, finalist check, or active-phase check.
drop policy if exists "approved members can vote once" on public.votes;
drop policy if exists "approved members can insert vote choices" on public.vote_choices;

-- Keep the public event read policy, but do not evaluate the admin helper for
-- anonymous reads. Only authenticated users can ever satisfy the write policy.
drop policy if exists "admins can manage site events" on public.site_events;
create policy "admins can manage site events"
on public.site_events
for all
to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

-- Remove any inherited/default API grants, then restore only the direct table
-- operations used by the current frontend. service_role and the table owners
-- are intentionally untouched.
revoke all privileges on table
  public.memberships,
  public.votes,
  public.banned_albums,
  public.banned_artists,
  public.polls,
  public.poll_candidates,
  public.vote_choices,
  public.record_shelf_covers,
  public.site_events
from public, anon, authenticated;

grant select on table public.memberships to authenticated;
grant update on table public.memberships to authenticated;

grant select on table public.votes to authenticated;
grant select on table public.vote_choices to authenticated;

-- These two tables drive public, non-sensitive site content. Their RLS
-- policies still restrict writes to approved admins.
grant select on table public.site_events to anon, authenticated;
grant insert, update, delete on table public.site_events to authenticated;

grant select on table public.record_shelf_covers to anon, authenticated;
grant insert, update, delete on table public.record_shelf_covers to authenticated;

-- The original public poll reader inserted a default poll when none existed
-- and exposed candidate lists to anonymous callers despite candidate RLS.
-- Keep the public metadata needed by the home page, but make this RPC stable,
-- read-only, and member-aware.
create or replace function public.get_current_poll()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  active_poll public.polls%rowtype;
  candidates jsonb := '[]'::jsonb;
  finalists jsonb := '[]'::jsonb;
  can_view_ballot boolean := false;
begin
  select * into active_poll
  from public.polls
  where is_active
  order by created_at desc
  limit 1;

  if active_poll.id is null then
    return null;
  end if;

  if auth.uid() is not null then
    select exists (
      select 1
      from public.memberships
      where user_id = auth.uid()
        and status = 'approved'
    ) into can_view_ballot;
  end if;

  if can_view_ballot then
    select coalesce(jsonb_agg(public.candidate_json(c) order by c.album_title), '[]'::jsonb)
    into candidates
    from public.poll_candidates c
    where c.poll_id = active_poll.id
      and (active_poll.phase <> 'final' or c.is_finalist);

    select coalesce(jsonb_agg(public.candidate_json(c) order by c.finalist_order), '[]'::jsonb)
    into finalists
    from public.poll_candidates c
    where c.poll_id = active_poll.id
      and c.is_finalist;
  end if;

  return jsonb_build_object(
    'id', active_poll.id,
    'phase', active_poll.phase,
    'status', active_poll.status,
    'question', active_poll.question,
    'description', active_poll.description,
    'cycle_label', active_poll.cycle_label,
    'album_of_week', active_poll.album_of_week,
    'candidates', candidates,
    'finalists', finalists
  );
end;
$$;

-- Revoke direct API execution from every app-owned routine, including helper
-- and trigger functions. This loop covers overloads and remains safe to rerun.
do $hardening$
declare
  app_function record;
begin
  for app_function in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'touch_updated_at',
        'create_membership_for_new_user',
        'is_admin',
        'is_approved_member',
        'update_own_display_name',
        'clean_music_text',
        'normalize_music_name',
        'validate_nomination_vote',
        'get_active_poll_id',
        'assert_poll_phase',
        'candidate_json',
        'get_current_poll',
        'format_vote_json',
        'submit_nomination',
        'rebuild_poll_candidates',
        'advance_to_primary',
        'submit_primary_ballot',
        'save_finalists',
        'advance_to_final',
        'submit_final_ballot',
        'calculate_irv_result',
        'get_admin_poll_results',
        'create_poll',
        'get_primary_candidates',
        'update_current_album',
        'touch_record_shelf_cover_updated_at'
      ])
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon, authenticated',
      app_function.schema_name,
      app_function.function_name,
      app_function.identity_arguments
    );
  end loop;
end;
$hardening$;

-- Poll reads now pass through the same-origin Azure Function. Anonymous callers
-- are intentionally denied at PostgREST; the proxy uses service_role only for
-- the sanitized public response and forwards member JWTs for private ballots.
grant execute on function public.get_current_poll() to authenticated, service_role;

-- Signed-in member RPCs.
grant execute on function public.update_own_display_name(text) to authenticated;
grant execute on function public.submit_nomination(text, text, text) to authenticated;
grant execute on function public.submit_primary_ballot(text, text[]) to authenticated;
grant execute on function public.submit_final_ballot(text, text[]) to authenticated;

-- Admin RPCs. Each function also checks public.is_admin() internally.
grant execute on function public.get_admin_poll_results(text) to authenticated;
grant execute on function public.create_poll(text, text, text, text, text, text) to authenticated;
grant execute on function public.advance_to_primary(text) to authenticated;
grant execute on function public.save_finalists(text, text[]) to authenticated;
grant execute on function public.advance_to_final(text, text[]) to authenticated;
grant execute on function public.update_current_album(text, text, text, text) to authenticated;

commit;
