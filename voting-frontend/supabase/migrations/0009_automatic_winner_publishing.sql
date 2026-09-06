-- Automatic winner publishing and archive/banned-list consistency.
--
-- Run after:
--   record-shelf-queue.sql
--   event-voting-hardening.sql
--
-- This migration is idempotent. It deliberately does not open a new poll.
-- When a final closes, the outgoing listen is archived and the IRV winner is
-- published as the current album. An administrator still creates the next
-- nomination poll after choosing its genre/cycle label.


alter table public.polls
  add column if not exists winner_candidate_id text,
  add column if not exists winner_published_at timestamptz,
  add column if not exists published_album jsonb;

do $constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.polls'::regclass
      and conname = 'polls_winner_candidate_fk'
  ) then
    alter table public.polls
      add constraint polls_winner_candidate_fk
      foreign key (winner_candidate_id)
      references public.poll_candidates(id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.polls'::regclass
      and conname = 'polls_published_winner_complete'
  ) then
    alter table public.polls
      add constraint polls_published_winner_complete check (
        (winner_published_at is null and published_album is null)
        or
        (
          winner_published_at is not null
          and winner_candidate_id is not null
          and published_album is not null
          and nullif(btrim(published_album ->> 'title'), '') is not null
          and nullif(btrim(published_album ->> 'artist'), '') is not null
        )
      );
  end if;
end;
$constraint$;

comment on column public.polls.winner_candidate_id is
  'Official IRV winner after the final closes and every manual tie is resolved.';
comment on column public.polls.winner_published_at is
  'Timestamp when the winner became the publicly displayed current album.';
comment on column public.polls.published_album is
  'Stable current-album snapshot for a closed poll; album_of_week remains the rated outgoing listen.';

-- An archived album is always ineligible for nomination. Keep banned_albums
-- as the manual-extension table too, but make archive -> banned an invariant
-- instead of relying on every archive writer to remember both inserts.
create or replace function public.sync_archived_album_to_banned()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.banned_albums (name)
  values (new.album_title)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists sync_album_archive_entry_to_banned on public.album_archive_entries;
create trigger sync_album_archive_entry_to_banned
after insert or update of album_title on public.album_archive_entries
for each row
execute function public.sync_archived_album_to_banned();

-- Repair historical drift once. The trigger maintains the invariant after
-- this backfill, while the normalized unique index prevents spelling/case
-- variants from becoming separate bans.
insert into public.banned_albums (name)
select archive.album_title
from public.album_archive_entries archive
where public.clean_music_text(archive.album_title) is not null
on conflict do nothing;

-- When the admin later opens nominations, carry any corrected metadata or
-- uploaded cover from the published winner into the new poll automatically.
create or replace function public.inherit_published_album_metadata()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  previous_poll public.polls%rowtype;
  previous_album jsonb;
begin
  select *
  into previous_poll
  from public.polls p
  order by p.created_at desc
  limit 1;

  if previous_poll.id is not null
    and previous_poll.phase = 'final'
    and previous_poll.winner_published_at is null then
    raise exception 'FINAL_WINNER_REQUIRED: Resolve and publish the current final before opening a new poll.'
      using errcode = 'P0001';
  end if;

  select p.published_album
  into previous_album
  from public.polls p
  where p.winner_published_at is not null
    and p.published_album is not null
    and public.normalize_music_name(p.published_album ->> 'title') =
      public.normalize_music_name(new.album_of_week ->> 'title')
    and public.normalize_music_name(p.published_album ->> 'artist') =
      public.normalize_music_name(new.album_of_week ->> 'artist')
  order by p.winner_published_at desc
  limit 1;

  if previous_album is not null then
    new.album_of_week := previous_album || new.album_of_week;
  end if;

  return new;
end;
$$;

drop trigger if exists inherit_published_album_on_poll_insert on public.polls;
create trigger inherit_published_album_on_poll_insert
before insert on public.polls
for each row
execute function public.inherit_published_album_metadata();

-- Finalize one closed final. This function is safe to retry: the poll row is
-- locked, winner_published_at is the idempotency marker, archive poll_id is
-- unique, and banned album names are normalized-unique.
create or replace function public.finalize_poll_winner(target_poll_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_poll public.polls%rowtype;
  irv_result jsonb;
  winner public.poll_candidates%rowtype;
  outgoing_title text;
  outgoing_artist text;
  outgoing_average numeric(4, 2);
  outgoing_rating_count integer;
  winner_album jsonb;
begin
  select * into target_poll
  from public.polls
  where id = target_poll_id
  for update;

  if target_poll.id is null then
    return jsonb_build_object('pollId', target_poll_id, 'state', 'not_found');
  end if;

  if target_poll.phase <> 'final' then
    return jsonb_build_object('pollId', target_poll.id, 'state', 'not_final');
  end if;

  if target_poll.winner_published_at is not null then
    return jsonb_build_object(
      'pollId', target_poll.id,
      'state', 'already_published',
      'winnerId', target_poll.winner_candidate_id,
      'album', target_poll.published_album,
      'publishedAt', target_poll.winner_published_at
    );
  end if;

  if target_poll.final_opened_at is null or target_poll.final_closes_at is null then
    return jsonb_build_object('pollId', target_poll.id, 'state', 'deadline_missing');
  end if;

  if target_poll.final_closed_at is null and now() < target_poll.final_closes_at then
    return jsonb_build_object(
      'pollId', target_poll.id,
      'state', 'not_due',
      'closesAt', target_poll.final_closes_at
    );
  end if;

  update public.polls
  set final_closed_at = coalesce(final_closed_at, final_closes_at),
      status = 'Final voting is closed'
  where id = target_poll.id;

  irv_result := public.calculate_irv_result(target_poll.id);

  if irv_result -> 'tie' is not null and irv_result -> 'tie' <> 'null'::jsonb then
    update public.polls
    set status = 'Final voting is closed — administrator tie-break needed'
    where id = target_poll.id;

    return jsonb_build_object(
      'pollId', target_poll.id,
      'state', 'tie_break_needed',
      'tie', irv_result -> 'tie'
    );
  end if;

  if nullif(irv_result ->> 'winnerId', '') is null then
    update public.polls
    set status = 'Final voting is closed — no winner available'
    where id = target_poll.id;

    return jsonb_build_object('pollId', target_poll.id, 'state', 'no_winner');
  end if;

  select * into winner
  from public.poll_candidates
  where id = irv_result ->> 'winnerId'
    and poll_id = target_poll.id
    and is_finalist;

  if winner.id is null then
    raise exception 'INVALID_IRV_WINNER: Calculated winner is not a finalist in poll %.', target_poll.id
      using errcode = 'P0001';
  end if;

  outgoing_title := public.clean_music_text(target_poll.album_of_week ->> 'title');
  outgoing_artist := public.clean_music_text(target_poll.album_of_week ->> 'artist');

  if outgoing_title is not null and outgoing_artist is not null then
    select
      round(avg(rating)::numeric, 2),
      count(*)::integer
    into outgoing_average, outgoing_rating_count
    from public.album_ratings
    where poll_id = target_poll.id;

    insert into public.album_archive_entries (
      poll_id,
      album_title,
      artist_name,
      average_rating,
      rating_count,
      archived_at
    )
    values (
      target_poll.id,
      outgoing_title,
      outgoing_artist,
      outgoing_average,
      outgoing_rating_count,
      now()
    )
    on conflict (poll_id) do update
    set album_title = excluded.album_title,
        artist_name = excluded.artist_name,
        average_rating = excluded.average_rating,
        rating_count = excluded.rating_count;
  end if;

  winner_album := jsonb_build_object(
    'title', winner.album_title,
    'artist', winner.artist_name,
    'note', 'Selected by the club',
    'coverClass', 'cover-week'
  );

  -- The winner becomes ineligible immediately, even though it should not
  -- enter the listening archive until a later cycle has actually rated it.
  insert into public.banned_albums (name)
  values (winner.album_title)
  on conflict do nothing;

  update public.polls
  set winner_candidate_id = winner.id,
      winner_published_at = now(),
      published_album = winner_album,
      status = 'Winner published — next nominations have not opened'
  where id = target_poll.id;

  return jsonb_build_object(
    'pollId', target_poll.id,
    'state', 'published',
    'winnerId', winner.id,
    'album', winner_album,
    'publishedAt', now()
  );
end;
$$;

-- The cron job calls this lightweight sweep once per minute. Normally there
-- is only one active poll, but processing every due unpublished final makes a
-- missed run recoverable even if an administrator later starts a new cycle.
create or replace function public.finalize_due_polls()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  due_poll record;
  outcomes jsonb := '[]'::jsonb;
begin
  for due_poll in
    select id
    from public.polls
    where phase = 'final'
      and winner_published_at is null
      and final_opened_at is not null
      and final_closes_at is not null
      and (final_closed_at is not null or now() >= final_closes_at)
    order by final_closes_at, id
  loop
    outcomes := outcomes || jsonb_build_array(public.finalize_poll_winner(due_poll.id));
  end loop;

  return outcomes;
end;
$$;

-- Public/member reads see the published winner as the current album while the
-- rated outgoing album remains available to authenticated admin UI.
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
  final_is_closed boolean := false;
  effective_status text;
  display_album jsonb;
begin
  select * into active_poll
  from public.polls
  where is_active
  order by created_at desc
  limit 1;

  if active_poll.id is null then
    return null;
  end if;

  final_is_closed := active_poll.phase = 'final'
    and (
      active_poll.final_closed_at is not null
      or (
        active_poll.final_closes_at is not null
        and now() >= active_poll.final_closes_at
      )
    );

  effective_status := case
    when active_poll.winner_published_at is not null then active_poll.status
    when final_is_closed then 'Final voting is closed'
    else active_poll.status
  end;

  display_album := coalesce(active_poll.published_album, active_poll.album_of_week);

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
    'status', effective_status,
    'question', active_poll.question,
    'description', active_poll.description,
    'cycle_label', active_poll.cycle_label,
    'album_of_week', display_album,
    'ratingAlbumOfWeek', active_poll.album_of_week,
    'publishedWinner', active_poll.published_album,
    'winnerCandidateId', active_poll.winner_candidate_id,
    'winnerPublishedAt', active_poll.winner_published_at,
    'candidates', candidates,
    'finalists', finalists,
    'finalOpenedAt', active_poll.final_opened_at,
    'finalClosesAt', active_poll.final_closes_at,
    'finalClosedAt', active_poll.final_closed_at,
    'finalIsClosed', final_is_closed
  );
end;
$$;

-- Let admins correct winner metadata or upload its cover while the closed poll
-- is waiting for the next genre. The rated outgoing album stays immutable.
create or replace function public.update_current_album(
  album_title text,
  album_artist text,
  album_note text default 'Current club listen',
  cover_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_title text;
  clean_artist text;
  clean_note text;
  clean_cover_url text;
  active_poll public.polls%rowtype;
  next_album jsonb;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can update the current album.' using errcode = 'P0001';
  end if;

  clean_title := public.clean_music_text(album_title);
  clean_artist := public.clean_music_text(album_artist);
  clean_note := coalesce(public.clean_music_text(album_note), 'Current club listen');
  clean_cover_url := nullif(trim(cover_url), '');

  if clean_title is null or clean_artist is null then
    raise exception 'CURRENT_ALBUM_REQUIRED: Add the current album title and artist.' using errcode = 'P0001';
  end if;

  select * into active_poll
  from public.polls
  where is_active
  order by created_at desc
  limit 1
  for update;

  if active_poll.id is null then
    raise exception 'POLL_NOT_ACTIVE: There is no active poll to update.' using errcode = 'P0001';
  end if;

  next_album := jsonb_strip_nulls(jsonb_build_object(
    'title', clean_title,
    'artist', clean_artist,
    'note', clean_note,
    'coverClass', 'cover-week',
    'coverUrl', clean_cover_url
  ));

  if active_poll.winner_published_at is not null then
    update public.polls
    set published_album = next_album
    where id = active_poll.id;

    insert into public.banned_albums (name)
    values (clean_title)
    on conflict do nothing;

    return public.get_current_poll();
  end if;

  if exists (
    select 1
    from public.album_ratings
    where poll_id = active_poll.id
  ) and (
    public.normalize_music_name(active_poll.album_of_week ->> 'title') is distinct from public.normalize_music_name(clean_title)
    or public.normalize_music_name(active_poll.album_of_week ->> 'artist') is distinct from public.normalize_music_name(clean_artist)
  ) then
    raise exception 'CURRENT_ALBUM_HAS_RATINGS: The album cannot be replaced after members have rated it.' using errcode = 'P0001';
  end if;

  update public.polls
  set album_of_week = next_album
  where id = active_poll.id;

  return public.get_current_poll();
end;
$$;

revoke execute on function public.sync_archived_album_to_banned()
from public, anon, authenticated;
revoke execute on function public.inherit_published_album_metadata()
from public, anon, authenticated;
revoke execute on function public.finalize_poll_winner(text)
from public, anon, authenticated;
revoke execute on function public.finalize_due_polls()
from public, anon, authenticated;
revoke execute on function public.get_current_poll()
from public, anon, authenticated;
revoke execute on function public.update_current_album(text, text, text, text)
from public, anon, authenticated;

grant execute on function public.get_current_poll()
to authenticated, service_role;
grant execute on function public.update_current_album(text, text, text, text)
to authenticated;
grant execute on function public.finalize_poll_winner(text)
to service_role;
grant execute on function public.finalize_due_polls()
to service_role;
