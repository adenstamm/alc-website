-- Archived perfect-score totals and safe primary-candidate removal.
--
-- Run after:
--   provisional-tie-breaks.sql
--
-- Archive rows retain the number of members who rated an album 10/10. During
-- primary voting, an administrator may exclude an invalid album without it
-- being recreated from its original nomination rows. Existing selections for
-- that album are removed atomically; a member whose ballot becomes empty may
-- submit primary choices again.

begin;

alter table public.album_archive_entries
  add column if not exists ten_rating_count integer not null default 0;

do $constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.album_archive_entries'::regclass
      and conname = 'album_archive_entries_ten_rating_count_nonnegative'
  ) then
    alter table public.album_archive_entries
      add constraint album_archive_entries_ten_rating_count_nonnegative
      check (ten_rating_count >= 0);
  end if;
end;
$constraint$;

update public.album_archive_entries archive
set ten_rating_count = (
  select count(*)::integer
  from public.album_ratings rating
  where rating.poll_id = archive.poll_id
    and rating.rating = 10
);

create or replace function public.sync_album_archive_ten_rating_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.ten_rating_count := (
    select count(*)::integer
    from public.album_ratings rating
    where rating.poll_id = new.poll_id
      and rating.rating = 10
  );

  return new;
end;
$$;

drop trigger if exists album_archive_entries_sync_ten_rating_count
on public.album_archive_entries;
create trigger album_archive_entries_sync_ten_rating_count
before insert or update of poll_id, rating_count
on public.album_archive_entries
for each row
execute function public.sync_album_archive_ten_rating_count();

create table if not exists public.poll_candidate_exclusions (
  poll_id text not null references public.polls(id) on delete cascade,
  normalized_album_title text not null,
  normalized_artist_name text not null,
  album_title text not null,
  artist_name text not null,
  removed_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz not null default now(),
  primary key (poll_id, normalized_album_title, normalized_artist_name)
);

comment on table public.poll_candidate_exclusions is
  'Albums removed by an administrator during primary voting. Entries prevent candidate rebuilds from restoring the removed choice.';

alter table public.poll_candidate_exclusions enable row level security;

revoke all privileges on table public.poll_candidate_exclusions
from public, anon, authenticated;

create or replace function public.rebuild_poll_candidates(target_poll_id text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.poll_candidates candidate
  using public.poll_candidate_exclusions exclusion
  where candidate.poll_id = target_poll_id
    and exclusion.poll_id = candidate.poll_id
    and exclusion.normalized_album_title = candidate.normalized_album_title
    and exclusion.normalized_artist_name = candidate.normalized_artist_name;

  delete from public.votes ballot
  where ballot.poll_id = target_poll_id
    and ballot.phase = 'primary'
    and not exists (
      select 1
      from public.vote_choices choice
      where choice.vote_id = ballot.id
    );

  insert into public.poll_candidates (
    id,
    poll_id,
    album_title,
    artist_name,
    normalized_album_title,
    normalized_artist_name,
    nomination_count
  )
  select
    pg_catalog.md5(
      target_poll_id
      || '|'
      || public.normalize_music_name(vote.album_title)
      || '|'
      || public.normalize_music_name(vote.artist_name)
    ),
    target_poll_id,
    (array_agg(public.clean_music_text(vote.album_title) order by vote.created_at desc))[1],
    (array_agg(public.clean_music_text(vote.artist_name) order by vote.created_at desc))[1],
    public.normalize_music_name(vote.album_title),
    public.normalize_music_name(vote.artist_name),
    count(*)::integer
  from public.votes vote
  where vote.poll_id = target_poll_id
    and vote.phase = 'nominations'
    and not exists (
      select 1
      from public.poll_candidate_exclusions exclusion
      where exclusion.poll_id = target_poll_id
        and exclusion.normalized_album_title = public.normalize_music_name(vote.album_title)
        and exclusion.normalized_artist_name = public.normalize_music_name(vote.artist_name)
    )
  group by
    public.normalize_music_name(vote.album_title),
    public.normalize_music_name(vote.artist_name)
  on conflict (poll_id, normalized_album_title, normalized_artist_name) do update
    set album_title = excluded.album_title,
        artist_name = excluded.artist_name,
        nomination_count = excluded.nomination_count;
end;
$$;

create or replace function public.remove_primary_candidate(
  target_poll_id text,
  candidate_id_input text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_candidate public.poll_candidates%rowtype;
  affected_ballot_count integer := 0;
  reset_ballot_ids uuid[] := '{}'::uuid[];
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can remove albums from primary voting.' using errcode = 'P0001';
  end if;

  if nullif(pg_catalog.btrim(candidate_id_input), '') is null then
    raise exception 'CANDIDATE_REQUIRED: Choose an album to remove.' using errcode = 'P0001';
  end if;

  perform public.lock_poll_phase_for_admin(target_poll_id, 'primary');

  select candidate.*
  into target_candidate
  from public.poll_candidates candidate
  where candidate.poll_id = target_poll_id
    and candidate.id = candidate_id_input
  for update of candidate;

  if target_candidate.id is null then
    raise exception 'CANDIDATE_NOT_FOUND: That album is no longer in this primary ballot.' using errcode = 'P0001';
  end if;

  select count(distinct ballot.id)::integer
  into affected_ballot_count
  from public.votes ballot
  join public.vote_choices choice on choice.vote_id = ballot.id
  where ballot.poll_id = target_poll_id
    and ballot.phase = 'primary'
    and choice.candidate_id = target_candidate.id;

  select coalesce(array_agg(ballot.id), '{}'::uuid[])
  into reset_ballot_ids
  from public.votes ballot
  where ballot.poll_id = target_poll_id
    and ballot.phase = 'primary'
    and exists (
      select 1
      from public.vote_choices choice
      where choice.vote_id = ballot.id
        and choice.candidate_id = target_candidate.id
    )
    and not exists (
      select 1
      from public.vote_choices other_choice
      where other_choice.vote_id = ballot.id
        and other_choice.candidate_id <> target_candidate.id
    );

  insert into public.poll_candidate_exclusions (
    poll_id,
    normalized_album_title,
    normalized_artist_name,
    album_title,
    artist_name,
    removed_by
  )
  values (
    target_candidate.poll_id,
    target_candidate.normalized_album_title,
    target_candidate.normalized_artist_name,
    target_candidate.album_title,
    target_candidate.artist_name,
    auth.uid()
  )
  on conflict (poll_id, normalized_album_title, normalized_artist_name) do update
  set album_title = excluded.album_title,
      artist_name = excluded.artist_name,
      removed_by = excluded.removed_by,
      removed_at = now();

  delete from public.poll_candidates
  where poll_id = target_poll_id
    and id = target_candidate.id;

  delete from public.votes
  where id = any(reset_ballot_ids);

  return jsonb_build_object(
    'candidateId', target_candidate.id,
    'title', target_candidate.album_title,
    'artist', target_candidate.artist_name,
    'affectedBallotCount', affected_ballot_count,
    'resetBallotCount', coalesce(cardinality(reset_ballot_ids), 0)
  );
end;
$$;

revoke execute on function public.sync_album_archive_ten_rating_count()
from public, anon, authenticated;
revoke execute on function public.rebuild_poll_candidates(text)
from public, anon, authenticated;
revoke execute on function public.remove_primary_candidate(text, text)
from public, anon, authenticated;

grant execute on function public.remove_primary_candidate(text, text)
to authenticated;

commit;
