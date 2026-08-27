-- Current-album ratings and durable archive entries.
-- Run after site-content.sql and before security-hardening.sql.

begin;

create table if not exists public.album_ratings (
  poll_id text not null references public.polls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 10),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create index if not exists album_ratings_poll_id_idx
on public.album_ratings(poll_id);

create table if not exists public.album_archive_entries (
  poll_id text primary key references public.polls(id) on delete restrict,
  album_title text not null,
  artist_name text not null,
  average_rating numeric(4, 2) check (
    average_rating is null or average_rating between 1 and 10
  ),
  rating_count integer not null default 0 check (rating_count >= 0),
  archived_at timestamptz not null default now()
);

create index if not exists album_archive_entries_archived_at_idx
on public.album_archive_entries(archived_at);

alter table public.album_ratings enable row level security;
alter table public.album_archive_entries enable row level security;

drop policy if exists "members can read own album rating" on public.album_ratings;
create policy "members can read own album rating"
on public.album_ratings
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "anyone can read album archive entries" on public.album_archive_entries;
create policy "anyone can read album archive entries"
on public.album_archive_entries
for select
to anon, authenticated
using (true);

revoke all privileges on table public.album_ratings from public, anon, authenticated;
revoke all privileges on table public.album_archive_entries from public, anon, authenticated;
grant select on table public.album_ratings to authenticated;
grant select on table public.album_archive_entries to anon, authenticated;

create or replace function public.submit_current_album_rating(
  target_poll_id text,
  rating_input integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_rating public.album_ratings%rowtype;
begin
  if not public.is_approved_member() then
    raise exception 'APPROVED_MEMBER_REQUIRED: Only approved members can rate the current album.' using errcode = 'P0001';
  end if;

  perform public.assert_poll_phase(target_poll_id, 'nominations');

  if rating_input is null or rating_input < 1 or rating_input > 10 then
    raise exception 'RATING_OUT_OF_RANGE: Choose a whole-number rating from 1 to 10.' using errcode = 'P0001';
  end if;

  begin
    insert into public.album_ratings (poll_id, user_id, rating)
    values (target_poll_id, auth.uid(), rating_input)
    returning * into saved_rating;
  exception
    when unique_violation then
      raise exception 'ALREADY_RATED: Your account already rated this album.' using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'poll_id', saved_rating.poll_id,
    'rating', saved_rating.rating,
    'created_at', saved_rating.created_at
  );
end;
$$;

create or replace function public.get_admin_poll_results(target_poll_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  nominations jsonb;
  primary_results jsonb;
  finalists jsonb;
  current_album_rating jsonb;
  irv jsonb;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can view aggregate results.' using errcode = 'P0001';
  end if;

  perform public.rebuild_poll_candidates(target_poll_id);

  select coalesce(jsonb_agg(public.candidate_json(c) order by c.nomination_count desc, c.album_title), '[]'::jsonb)
  into nominations
  from public.poll_candidates c
  where c.poll_id = target_poll_id;

  with primary_counts as (
    select
      pc.id,
      count(v.id)::integer as primary_votes
    from public.poll_candidates pc
    left join public.vote_choices vc on vc.candidate_id = pc.id
    left join public.votes v on v.id = vc.vote_id and v.phase = 'primary'
    where pc.poll_id = target_poll_id
    group by pc.id
  )
  select coalesce(jsonb_agg(
    public.candidate_json(pc) || jsonb_build_object('primaryVotes', primary_counts.primary_votes)
    order by primary_counts.primary_votes desc, pc.album_title
  ), '[]'::jsonb)
  into primary_results
  from public.poll_candidates pc
  join primary_counts on primary_counts.id = pc.id
  where pc.poll_id = target_poll_id;

  select coalesce(jsonb_agg(public.candidate_json(c) order by c.finalist_order), '[]'::jsonb)
  into finalists
  from public.poll_candidates c
  where c.poll_id = target_poll_id
    and c.is_finalist;

  select jsonb_build_object(
    'averageRating', round(avg(rating)::numeric, 2),
    'ratingCount', count(*)::integer
  )
  into current_album_rating
  from public.album_ratings
  where poll_id = target_poll_id;

  irv := public.calculate_irv_result(target_poll_id);

  return jsonb_build_object(
    'nominations', nominations,
    'primaryResults', primary_results,
    'finalists', finalists,
    'currentAlbumRating', current_album_rating,
    'irv', irv
  );
end;
$$;

create or replace function public.create_poll(
  new_poll_id text,
  new_cycle_label text,
  new_question text,
  new_description text,
  album_title text,
  album_artist text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_poll_id text;
  clean_cycle_label text;
  clean_question text;
  clean_description text;
  clean_album_title text;
  clean_album_artist text;
  previous_poll public.polls%rowtype;
  previous_album_title text;
  previous_album_artist text;
  previous_average_rating numeric(4, 2);
  previous_rating_count integer;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can create polls.' using errcode = 'P0001';
  end if;

  clean_poll_id := public.clean_music_text(new_poll_id);
  clean_cycle_label := public.clean_music_text(new_cycle_label);
  clean_question := public.clean_music_text(new_question);
  clean_description := public.clean_music_text(new_description);
  clean_album_title := public.clean_music_text(album_title);
  clean_album_artist := public.clean_music_text(album_artist);

  if clean_poll_id is null or clean_cycle_label is null or clean_question is null or clean_description is null then
    raise exception 'POLL_DETAILS_REQUIRED: Add a poll id, cycle label, question, and description.' using errcode = 'P0001';
  end if;

  if clean_album_title is null or clean_album_artist is null then
    raise exception 'CURRENT_ALBUM_REQUIRED: Add the current album title and artist.' using errcode = 'P0001';
  end if;

  select * into previous_poll
  from public.polls
  where is_active
  order by created_at desc
  limit 1;

  if previous_poll.id is not null then
    previous_album_title := public.clean_music_text(previous_poll.album_of_week ->> 'title');
    previous_album_artist := public.clean_music_text(previous_poll.album_of_week ->> 'artist');

    if previous_album_title is not null and previous_album_artist is not null then
      select
        round(avg(rating)::numeric, 2),
        count(*)::integer
      into previous_average_rating, previous_rating_count
      from public.album_ratings
      where poll_id = previous_poll.id;

      insert into public.album_archive_entries (
        poll_id,
        album_title,
        artist_name,
        average_rating,
        rating_count,
        archived_at
      )
      values (
        previous_poll.id,
        previous_album_title,
        previous_album_artist,
        previous_average_rating,
        previous_rating_count,
        now()
      )
      on conflict (poll_id) do update
      set album_title = excluded.album_title,
          artist_name = excluded.artist_name,
          average_rating = excluded.average_rating,
          rating_count = excluded.rating_count;

      insert into public.banned_albums (name)
      values (previous_album_title)
      on conflict do nothing;
    end if;
  end if;

  update public.polls
  set is_active = false
  where is_active;

  insert into public.polls (
    id,
    phase,
    status,
    question,
    description,
    cycle_label,
    album_of_week,
    is_active
  )
  values (
    clean_poll_id,
    'nominations',
    'Nominations are open',
    clean_question,
    clean_description,
    clean_cycle_label,
    jsonb_build_object(
      'title', clean_album_title,
      'artist', clean_album_artist,
      'note', 'Current club listen',
      'coverClass', 'cover-week'
    ),
    true
  );

  return public.get_current_poll();
end;
$$;

create or replace function public.update_current_album(
  album_title text,
  album_artist text,
  album_note text default 'Current club listen',
  cover_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_title text;
  clean_artist text;
  clean_note text;
  clean_cover_url text;
  active_poll public.polls%rowtype;
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
  limit 1;

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
  set album_of_week = jsonb_strip_nulls(jsonb_build_object(
    'title', clean_title,
    'artist', clean_artist,
    'note', clean_note,
    'coverClass', 'cover-week',
    'coverUrl', clean_cover_url
  ))
  where is_active;

  return public.get_current_poll();
end;
$$;

revoke execute on function public.submit_current_album_rating(text, integer)
from public, anon, authenticated;
grant execute on function public.submit_current_album_rating(text, integer)
to authenticated;

commit;
