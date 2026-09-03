-- Read-only live-state verification for the complete production migration set.
-- Run this in Supabase SQL Editor after the final documented migration. It reads
-- PostgreSQL catalogs and current poll metadata only; it creates or changes
-- nothing. Every returned row must say PASS before an event.

with
required_columns(column_name) as (
  values
    ('final_opened_at'),
    ('final_closes_at'),
    ('final_closed_at')
),
column_inventory as (
  select
    e.column_name,
    c.data_type,
    c.column_name is not null as is_present
  from required_columns e
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = 'polls'
   and c.column_name = e.column_name
),
required_functions(function_name, signature) as (
  values
    ('assert_poll_phase', 'public.assert_poll_phase(text,text)'),
    ('lock_poll_phase_for_admin', 'public.lock_poll_phase_for_admin(text,text)'),
    ('get_current_poll', 'public.get_current_poll()'),
    ('submit_nomination', 'public.submit_nomination(text,text,text)'),
    ('submit_primary_ballot', 'public.submit_primary_ballot(text,text[])'),
    ('submit_current_album_rating', 'public.submit_current_album_rating(text,integer)'),
    ('advance_to_primary', 'public.advance_to_primary(text)'),
    ('remove_primary_candidate', 'public.remove_primary_candidate(text,text)'),
    ('save_finalists', 'public.save_finalists(text,text[])'),
    ('advance_to_final', 'public.advance_to_final(text,text[])'),
    ('submit_final_ballot', 'public.submit_final_ballot(text,text[])'),
    ('close_final_voting', 'public.close_final_voting(text)'),
    ('calculate_irv_result', 'public.calculate_irv_result(text)'),
    ('resolve_irv_tie', 'public.resolve_irv_tie(text,integer,text)'),
    ('get_admin_poll_results', 'public.get_admin_poll_results(text)'),
    ('create_poll', 'public.create_poll(text,text,text,text,text,text)'),
    ('update_current_album', 'public.update_current_album(text,text,text,text)'),
    ('finalize_poll_winner', 'public.finalize_poll_winner(text)'),
    ('finalize_due_polls', 'public.finalize_due_polls()'),
    ('sync_archived_album_to_banned', 'public.sync_archived_album_to_banned()'),
    ('inherit_published_album_metadata', 'public.inherit_published_album_metadata()'),
    ('save_record_shelf_order', 'public.save_record_shelf_order(jsonb)'),
    ('enqueue_archived_album_on_shelf', 'public.enqueue_archived_album_on_shelf()')
),
function_inventory as (
  select
    e.function_name,
    e.signature,
    pg_catalog.to_regprocedure(e.signature) as function_oid
  from required_functions e
),
checks(area, check_name, passed, details) as (
  select
    'schema',
    'final-window columns exist',
    coalesce(bool_and(is_present and data_type = 'timestamp with time zone'), false),
    string_agg(
      format('%s=%s', column_name, coalesce(data_type, 'MISSING')),
      ', ' order by column_name
    )
  from column_inventory

  union all

  select
    'schema',
    'archive perfect-score count exists',
    count(*) = 1
      and max(data_type) = 'integer'
      and max(is_nullable) = 'NO',
    coalesce(string_agg(format('%s=%s nullable=%s', column_name, data_type, is_nullable), ', '), 'MISSING')
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'album_archive_entries'
    and column_name = 'ten_rating_count'

  union all

  select
    'schema',
    'candidate-exclusion table has RLS',
    coalesce((
      select c.relrowsecurity
      from pg_catalog.pg_class c
      where c.oid = pg_catalog.to_regclass('public.poll_candidate_exclusions')
    ), false),
    format(
      'table=%s, rls=%s',
      coalesce(pg_catalog.to_regclass('public.poll_candidate_exclusions')::text, 'MISSING'),
      coalesce((
        select c.relrowsecurity::text
        from pg_catalog.pg_class c
        where c.oid = pg_catalog.to_regclass('public.poll_candidate_exclusions')
      ), 'false')
    )

  union all

  select
    'schema',
    'archive perfect-score trigger is enabled',
    exists (
      select 1
      from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid = pg_catalog.to_regclass('public.album_archive_entries')
        and trigger_row.tgname = 'album_archive_entries_sync_ten_rating_count'
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled <> 'D'
    ),
    coalesce((
      select format('enabled=%s', trigger_row.tgenabled)
      from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid = pg_catalog.to_regclass('public.album_archive_entries')
        and trigger_row.tgname = 'album_archive_entries_sync_ten_rating_count'
        and not trigger_row.tgisinternal
    ), 'MISSING')

  union all

  select
    'schema',
    'winner publication columns exist',
    count(*) = 3
      and count(*) filter (where column_name = 'winner_candidate_id' and data_type = 'text') = 1
      and count(*) filter (where column_name = 'winner_published_at' and data_type = 'timestamp with time zone') = 1
      and count(*) filter (where column_name = 'published_album' and data_type = 'jsonb') = 1,
    coalesce(string_agg(format('%s=%s', column_name, data_type), ', ' order by column_name), 'MISSING')
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'polls'
    and column_name in ('winner_candidate_id', 'winner_published_at', 'published_album')

  union all

  select
    'schema',
    'final-window consistency constraint exists',
    exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid = pg_catalog.to_regclass('public.polls')
        and conname = 'polls_final_window_valid'
        and contype = 'c'
    ),
    coalesce((
      select pg_catalog.pg_get_constraintdef(oid)
      from pg_catalog.pg_constraint
      where conrelid = pg_catalog.to_regclass('public.polls')
        and conname = 'polls_final_window_valid'
    ), 'MISSING')

  union all

  select
    'schema',
    'IRV tie-resolution table has RLS',
    coalesce((
      select c.relrowsecurity
      from pg_catalog.pg_class c
      where c.oid = pg_catalog.to_regclass('public.poll_irv_tie_resolutions')
    ), false),
    format(
      'table=%s, rls=%s',
      coalesce(pg_catalog.to_regclass('public.poll_irv_tie_resolutions')::text, 'MISSING'),
      coalesce((
        select c.relrowsecurity::text
        from pg_catalog.pg_class c
        where c.oid = pg_catalog.to_regclass('public.poll_irv_tie_resolutions')
      ), 'false')
    )

  union all

  select
    'schema',
    'record shelf table exists with RLS and five-slot constraint',
    coalesce((
      select c.relrowsecurity
      from pg_catalog.pg_class c
      where c.oid = pg_catalog.to_regclass('public.record_shelf_items')
    ), false)
    and exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid = pg_catalog.to_regclass('public.record_shelf_items')
        and conname = 'record_shelf_items_position_check'
        and contype = 'c'
    ),
    format(
      'table=%s, rls=%s',
      coalesce(pg_catalog.to_regclass('public.record_shelf_items')::text, 'MISSING'),
      coalesce((
        select c.relrowsecurity::text
        from pg_catalog.pg_class c
        where c.oid = pg_catalog.to_regclass('public.record_shelf_items')
      ), 'false')
    )

  union all

  select
    'schema',
    'one vote per user, poll, and phase remains enforced',
    exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid = pg_catalog.to_regclass('public.votes')
        and conname = 'votes_one_per_user_per_poll_phase'
        and contype = 'u'
    ),
    coalesce((
      select pg_catalog.pg_get_constraintdef(oid)
      from pg_catalog.pg_constraint
      where conrelid = pg_catalog.to_regclass('public.votes')
        and conname = 'votes_one_per_user_per_poll_phase'
    ), 'MISSING')

  union all

  select
    'functions',
    'all event RPC signatures exist',
    coalesce(bool_and(function_oid is not null), false),
    string_agg(
      format('%s=%s', function_name, coalesce(function_oid::text, 'MISSING')),
      ', ' order by function_name
    )
  from function_inventory

  union all

  select
    'locking',
    'member phase assertion takes a concurrent shared lock',
    coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.assert_poll_phase(text,text)')
      ) ilike '%for share%',
      false
    ),
    format(
      'definition_md5=%s',
      coalesce(md5(pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.assert_poll_phase(text,text)')
      )), 'MISSING')
    )

  union all

  select
    'locking',
    'administrator phase helper takes an exclusive lock',
    coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.lock_poll_phase_for_admin(text,text)')
      ) ilike '%for update%',
      false
    ),
    format(
      'definition_md5=%s',
      coalesce(md5(pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.lock_poll_phase_for_admin(text,text)')
      )), 'MISSING')
    )

  union all

  select
    'locking',
    'active-poll creation uses an advisory lock',
    coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.create_poll(text,text,text,text,text,text)')
      ) ilike '%pg_advisory_xact_lock%',
      false
    ),
    format(
      'definition_md5=%s',
      coalesce(md5(pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.create_poll(text,text,text,text,text,text)')
      )), 'MISSING')
    )

  union all

  select
    'locking',
    'all member writes use the shared phase helper',
    coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.submit_nomination(text,text,text)')
      ) ilike '%assert_poll_phase%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.submit_primary_ballot(text,text[])')
      ) ilike '%assert_poll_phase%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.submit_final_ballot(text,text[])')
      ) ilike '%assert_poll_phase%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.submit_current_album_rating(text,integer)')
      ) ilike '%assert_poll_phase%',
      false
    ),
    'nomination, primary, final, and rating RPCs call assert_poll_phase'

  union all

  select
    'locking',
    'all administrator phase operations start with the exclusive helper',
    coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.advance_to_primary(text)')
      ) ilike '%lock_poll_phase_for_admin%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.save_finalists(text,text[])')
      ) ilike '%lock_poll_phase_for_admin%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.advance_to_final(text,text[])')
      ) ilike '%lock_poll_phase_for_admin%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.close_final_voting(text)')
      ) ilike '%lock_poll_phase_for_admin%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.resolve_irv_tie(text,integer,text)')
      ) ilike '%lock_poll_phase_for_admin%',
      false
    ),
    'advance-primary, finalists, advance-final, close, and tie RPCs use the exclusive helper'

  union all

  select
    'locking',
    'poll creation and album replacement take exclusive row locks',
    coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.create_poll(text,text,text,text,text,text)')
      ) ilike '%for update%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.update_current_album(text,text,text,text)')
      ) ilike '%for update%',
      false
    ),
    'create_poll and update_current_album contain FOR UPDATE'

  union all

  select
    'finalization',
    'manual close and closed-final tie resolution publish immediately',
    coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.close_final_voting(text)')
      ) ilike '%finalize_poll_winner%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.resolve_irv_tie(text,integer,text)')
      ) ilike '%finalize_poll_winner%',
      false
    ),
    'close_final_voting finalizes directly; the last closed-final tie resolution does the same'

  union all

  select
    'locking',
    'manual and automatic shelf writers share one advisory lock',
    coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.save_record_shelf_order(jsonb)')
      ) ilike '%albumasu:record-shelf-queue%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.save_record_shelf_order(jsonb)')
      ) ilike '%pg_advisory_xact_lock%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.enqueue_archived_album_on_shelf()')
      ) ilike '%albumasu:record-shelf-queue%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.enqueue_archived_album_on_shelf()')
      ) ilike '%pg_advisory_xact_lock%',
      false
    ),
    'save_record_shelf_order and enqueue trigger use albumasu:record-shelf-queue'

  union all

  select
    'functions',
    'record shelf writers are security definer with a fixed search path',
    coalesce(bool_and(
      p.prosecdef
      and p.proconfig @> array['search_path=pg_catalog, public']::text[]
    ), false),
    string_agg(
      format('%s: security_definer=%s, config=%s', p.proname, p.prosecdef, p.proconfig::text),
      '; ' order by p.proname
    )
  from pg_catalog.pg_proc p
  where p.oid in (
    pg_catalog.to_regprocedure('public.save_record_shelf_order(jsonb)'),
    pg_catalog.to_regprocedure('public.enqueue_archived_album_on_shelf()')
  )

  union all

  select
    'trigger',
    'archive insert trigger invokes the shelf enqueue function',
    exists (
      select 1
      from pg_catalog.pg_trigger t
      where t.tgrelid = pg_catalog.to_regclass('public.album_archive_entries')
        and t.tgname = 'enqueue_album_archive_entry_on_shelf'
        and not t.tgisinternal
        and t.tgenabled <> 'D'
        and t.tgfoid = pg_catalog.to_regprocedure('public.enqueue_archived_album_on_shelf()')
    ),
    coalesce((
      select format('enabled=%s, function=%s', t.tgenabled, t.tgfoid::regprocedure)
      from pg_catalog.pg_trigger t
      where t.tgrelid = pg_catalog.to_regclass('public.album_archive_entries')
        and t.tgname = 'enqueue_album_archive_entry_on_shelf'
        and not t.tgisinternal
    ), 'MISSING')

  union all

  select
    'trigger',
    'archive changes automatically synchronize the banned list',
    exists (
      select 1
      from pg_catalog.pg_trigger t
      where t.tgrelid = pg_catalog.to_regclass('public.album_archive_entries')
        and t.tgname = 'sync_album_archive_entry_to_banned'
        and not t.tgisinternal
        and t.tgenabled <> 'D'
        and t.tgfoid = pg_catalog.to_regprocedure('public.sync_archived_album_to_banned()')
    ),
    coalesce((
      select format('enabled=%s, function=%s', t.tgenabled, t.tgfoid::regprocedure)
      from pg_catalog.pg_trigger t
      where t.tgrelid = pg_catalog.to_regclass('public.album_archive_entries')
        and t.tgname = 'sync_album_archive_entry_to_banned'
        and not t.tgisinternal
    ), 'MISSING')

  union all

  select
    'deadline',
    'final opening creates an 18-hour window',
    coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.advance_to_final(text,text[])')
      ) ilike '%interval ''18 hours''%',
      false
    ),
    format(
      'definition_md5=%s',
      coalesce(md5(pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.advance_to_final(text,text[])')
      )), 'MISSING')
    )

  union all

  select
    'deadline',
    'final submission rejects closed windows',
    coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.submit_final_ballot(text,text[])')
      ) ilike '%FINAL_VOTING_CLOSED%',
      false
    ),
    format(
      'definition_md5=%s',
      coalesce(md5(pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.submit_final_ballot(text,text[])')
      )), 'MISSING')
    )

  union all

  select
    'results',
    'poll reader exposes final timing and derived closure',
    coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.get_current_poll()')
      ) ilike '%finalOpenedAt%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.get_current_poll()')
      ) ilike '%finalClosesAt%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.get_current_poll()')
      ) ilike '%finalIsClosed%',
      false
    ),
    format(
      'definition_md5=%s',
      coalesce(md5(pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.get_current_poll()')
      )), 'MISSING')
    )

  union all

  select
    'results',
    'admin results expose counts and final timing',
    coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.get_admin_poll_results(text)')
      ) ilike '%ballotCounts%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.get_admin_poll_results(text)')
      ) ilike '%finalVoting%',
      false
    ),
    format(
      'definition_md5=%s',
      coalesce(md5(pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.get_admin_poll_results(text)')
      )), 'MISSING')
    )

  union all

  select
    'IRV',
    'IRV calculation consumes persisted admin resolutions',
    coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.calculate_irv_result(text)')
      ) ilike '%poll_irv_tie_resolutions%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.calculate_irv_result(text)')
      ) ilike '%adminTieBreak%',
      false
    ),
    format(
      'definition_md5=%s',
      coalesce(md5(pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.calculate_irv_result(text)')
      )), 'MISSING')
    )

  union all

  select
    'primary',
    'candidate removal is serialized and durable',
    coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.remove_primary_candidate(text,text)')
      ) ilike '%lock_poll_phase_for_admin%primary%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.remove_primary_candidate(text,text)')
      ) ilike '%poll_candidate_exclusions%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.rebuild_poll_candidates(text)')
      ) ilike '%poll_candidate_exclusions%',
      false
    ),
    format(
      'remove_md5=%s, rebuild_md5=%s',
      coalesce(md5(pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.remove_primary_candidate(text,text)')
      )), 'MISSING'),
      coalesce(md5(pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.rebuild_poll_candidates(text)')
      )), 'MISSING')
    )

  union all

  select
    'IRV',
    'administrators can resolve the current tie while final voting is open',
    coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.resolve_irv_tie(text,integer,text)')
      ) ilike '%lock_poll_phase_for_admin%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.resolve_irv_tie(text,integer,text)')
      ) not ilike '%FINAL_STILL_OPEN%',
      false
    ),
    format(
      'definition_md5=%s',
      coalesce(md5(pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.resolve_irv_tie(text,integer,text)')
      )), 'MISSING')
    )

  union all

  select
    'IRV',
    'accepted final ballots clear provisional tie decisions',
    coalesce(
      position(
        'delete from public.poll_irv_tie_resolutions'
        in lower(pg_catalog.pg_get_functiondef(
          pg_catalog.to_regprocedure('public.submit_final_ballot(text,text[])')
        ))
      ) > position(
        'insert into public.votes'
        in lower(pg_catalog.pg_get_functiondef(
          pg_catalog.to_regprocedure('public.submit_final_ballot(text,text[])')
        ))
      ),
      false
    ),
    format(
      'definition_md5=%s',
      coalesce(md5(pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.submit_final_ballot(text,text[])')
      )), 'MISSING')
    )

  union all

  select
    'RLS',
    'only admins can directly read tie-resolution audit rows',
    exists (
      select 1
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = 'poll_irv_tie_resolutions'
        and policyname = 'admins can read IRV tie resolutions'
        and cmd = 'SELECT'
        and 'authenticated' = any(roles)
    ),
    coalesce((
      select format('roles=%s, using=%s', roles::text, qual)
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = 'poll_irv_tie_resolutions'
        and policyname = 'admins can read IRV tie resolutions'
    ), 'MISSING')

  union all

  select
    'grants',
    'member and admin RPC grants are least privilege',
    coalesce(pg_catalog.has_function_privilege(
      'authenticated',
      pg_catalog.to_regprocedure('public.submit_final_ballot(text,text[])'),
      'EXECUTE'
    ), false)
    and coalesce(pg_catalog.has_function_privilege(
      'authenticated',
      pg_catalog.to_regprocedure('public.resolve_irv_tie(text,integer,text)'),
      'EXECUTE'
    ), false)
    and coalesce(pg_catalog.has_function_privilege(
      'authenticated',
      pg_catalog.to_regprocedure('public.remove_primary_candidate(text,text)'),
      'EXECUTE'
    ), false)
    and not coalesce(pg_catalog.has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure('public.submit_final_ballot(text,text[])'),
      'EXECUTE'
    ), false)
    and not coalesce(pg_catalog.has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure('public.resolve_irv_tie(text,integer,text)'),
      'EXECUTE'
    ), false)
    and not coalesce(pg_catalog.has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure('public.remove_primary_candidate(text,text)'),
      'EXECUTE'
    ), false),
    'authenticated can execute submit/resolve/remove; anon cannot'

  union all

  select
    'grants',
    'candidate exclusions are RPC-only',
    not exists (
      select 1
      from information_schema.role_table_grants grant_row
      where grant_row.table_schema = 'public'
        and grant_row.table_name = 'poll_candidate_exclusions'
        and grant_row.grantee in ('anon', 'authenticated')
    ),
    'anon/authenticated have no direct table privileges'

  union all

  select
    'grants',
    'poll reader remains proxy-only for anonymous traffic',
    coalesce(pg_catalog.has_function_privilege(
      'authenticated',
      pg_catalog.to_regprocedure('public.get_current_poll()'),
      'EXECUTE'
    ), false)
    and coalesce(pg_catalog.has_function_privilege(
      'service_role',
      pg_catalog.to_regprocedure('public.get_current_poll()'),
      'EXECUTE'
    ), false)
    and not coalesce(pg_catalog.has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure('public.get_current_poll()'),
      'EXECUTE'
    ), false),
    'authenticated=true, service_role=true, anon=false'

  union all

  select
    'grants',
    'winner finalization is service-only',
    coalesce(pg_catalog.has_function_privilege(
      'service_role',
      pg_catalog.to_regprocedure('public.finalize_poll_winner(text)'),
      'EXECUTE'
    ), false)
    and coalesce(pg_catalog.has_function_privilege(
      'service_role',
      pg_catalog.to_regprocedure('public.finalize_due_polls()'),
      'EXECUTE'
    ), false)
    and not coalesce(pg_catalog.has_function_privilege(
      'authenticated',
      pg_catalog.to_regprocedure('public.finalize_poll_winner(text)'),
      'EXECUTE'
    ), false)
    and not coalesce(pg_catalog.has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure('public.finalize_due_polls()'),
      'EXECUTE'
    ), false),
    'service_role=true; authenticated/anon=false'

  union all

  select
    'grants',
    'tie decisions cannot be written directly by API roles',
    coalesce(pg_catalog.has_table_privilege(
      'authenticated',
      pg_catalog.to_regclass('public.poll_irv_tie_resolutions'),
      'SELECT'
    ), false)
    and not coalesce(pg_catalog.has_table_privilege(
      'authenticated',
      pg_catalog.to_regclass('public.poll_irv_tie_resolutions'),
      'INSERT'
    ), false)
    and not coalesce(pg_catalog.has_table_privilege(
      'authenticated',
      pg_catalog.to_regclass('public.poll_irv_tie_resolutions'),
      'UPDATE'
    ), false)
    and not coalesce(pg_catalog.has_table_privilege(
      'authenticated',
      pg_catalog.to_regclass('public.poll_irv_tie_resolutions'),
      'DELETE'
    ), false)
    and not coalesce(pg_catalog.has_table_privilege(
      'anon',
      pg_catalog.to_regclass('public.poll_irv_tie_resolutions'),
      'SELECT'
    ), false)
    and not coalesce(pg_catalog.has_table_privilege(
      'anon',
      pg_catalog.to_regclass('public.poll_irv_tie_resolutions'),
      'INSERT'
    ), false)
    and not coalesce(pg_catalog.has_table_privilege(
      'anon',
      pg_catalog.to_regclass('public.poll_irv_tie_resolutions'),
      'UPDATE'
    ), false)
    and not coalesce(pg_catalog.has_table_privilege(
      'anon',
      pg_catalog.to_regclass('public.poll_irv_tie_resolutions'),
      'DELETE'
    ), false),
    'authenticated=SELECT only; anon=none'

  union all

  select
    'grants',
    'record shelf is read-only except through the admin RPC',
    coalesce(pg_catalog.has_table_privilege(
      'authenticated',
      pg_catalog.to_regclass('public.record_shelf_items'),
      'SELECT'
    ), false)
    and coalesce(pg_catalog.has_table_privilege(
      'anon',
      pg_catalog.to_regclass('public.record_shelf_items'),
      'SELECT'
    ), false)
    and not coalesce(pg_catalog.has_table_privilege(
      'authenticated',
      pg_catalog.to_regclass('public.record_shelf_items'),
      'INSERT'
    ), false)
    and not coalesce(pg_catalog.has_table_privilege(
      'authenticated',
      pg_catalog.to_regclass('public.record_shelf_items'),
      'UPDATE'
    ), false)
    and not coalesce(pg_catalog.has_table_privilege(
      'authenticated',
      pg_catalog.to_regclass('public.record_shelf_items'),
      'DELETE'
    ), false)
    and coalesce(pg_catalog.has_function_privilege(
      'authenticated',
      pg_catalog.to_regprocedure('public.save_record_shelf_order(jsonb)'),
      'EXECUTE'
    ), false)
    and not coalesce(pg_catalog.has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure('public.save_record_shelf_order(jsonb)'),
      'EXECUTE'
    ), false)
    and not coalesce(pg_catalog.has_function_privilege(
      'authenticated',
      pg_catalog.to_regprocedure('public.enqueue_archived_album_on_shelf()'),
      'EXECUTE'
    ), false),
    'anon/authenticated=SELECT; authenticated=save RPC; trigger function is not callable'

  union all

  select
    'RLS',
    'record shelf exposes a read policy and no direct write policy',
    exists (
      select 1
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = 'record_shelf_items'
        and policyname = 'Anyone can read record shelf items'
        and cmd = 'SELECT'
    )
    and not exists (
      select 1
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = 'record_shelf_items'
        and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    ),
    'public SELECT policy present; INSERT/UPDATE/DELETE/ALL policies absent'

  union all

  select
    'grants',
    'direct ballot writes remain disabled',
    not coalesce(pg_catalog.has_table_privilege('authenticated', 'public.votes', 'INSERT'), false)
    and not coalesce(pg_catalog.has_table_privilege('authenticated', 'public.vote_choices', 'INSERT'), false)
    and not exists (
      select 1
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename in ('votes', 'vote_choices')
        and cmd = 'INSERT'
    ),
    'authenticated has no INSERT grant and no INSERT RLS policy exists'

  union all

  select
    'live state',
    'active final poll has a complete deadline',
    not exists (
      select 1
      from public.polls
      where is_active
        and phase = 'final'
        and (
          final_opened_at is null
          or final_closes_at is null
          or final_closes_at <= final_opened_at
        )
    ),
    coalesce((
      select format(
        'id=%s, phase=%s, opened=%s, closes=%s, manually_closed=%s',
        id,
        phase,
        coalesce(final_opened_at::text, 'null'),
        coalesce(final_closes_at::text, 'null'),
        coalesce(final_closed_at::text, 'null')
      )
      from public.polls
      where is_active
      order by created_at desc
      limit 1
    ), 'no active poll')

  union all

  select
    'live state',
    'archived perfect-score totals match ratings',
    not exists (
      select 1
      from public.album_archive_entries archive
      where archive.ten_rating_count <> (
        select count(*)::integer
        from public.album_ratings rating
        where rating.poll_id = archive.poll_id
          and rating.rating = 10
      )
    ),
    format(
      'mismatches=%s',
      (
        select count(*)
        from public.album_archive_entries archive
        where archive.ten_rating_count <> (
          select count(*)::integer
          from public.album_ratings rating
          where rating.poll_id = archive.poll_id
            and rating.rating = 10
        )
      )
    )

  union all

  select
    'live state',
    'record shelf contains at most five valid unique positions',
    count(*) <= 5
      and count(*) = count(distinct position)
      and count(*) = count(distinct album_id)
      and coalesce(bool_and(position between 1 and 5), true),
    format(
      'rows=%s, positions=%s',
      count(*),
      coalesce(string_agg(position::text, ',' order by position), 'empty')
    )
  from public.record_shelf_items

  union all

  select
    'live state',
    'every archived album is also banned',
    not exists (
      select 1
      from public.album_archive_entries archive
      where not exists (
        select 1
        from public.banned_albums banned
        where banned.normalized_name = public.normalize_music_name(archive.album_title)
      )
    ),
    format(
      'missing=%s',
      (
        select count(*)
        from public.album_archive_entries archive
        where not exists (
          select 1
          from public.banned_albums banned
          where banned.normalized_name = public.normalize_music_name(archive.album_title)
        )
      )
    )
)
select
  case when passed then 'PASS' else 'FAIL' end as status,
  area,
  check_name,
  details
from checks
order by
  case when passed then 1 else 0 end,
  area,
  check_name;
