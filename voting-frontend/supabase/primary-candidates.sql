-- Derive phase-two primary candidates from nomination votes.
-- Run this after nomination-validation.sql so normalize_music_name exists.

create or replace function public.get_primary_candidates(
  target_poll_id text,
  candidate_limit integer default 5
)
returns table (
  candidate_id text,
  album_title text,
  artist_name text,
  nomination_count bigint,
  last_nominated_at timestamptz,
  candidate_rank integer,
  advances_to_primary boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_approved_member() then
    raise exception 'APPROVED_MEMBER_REQUIRED: Only approved members can view the primary ballot.'
      using errcode = 'P0001';
  end if;

  return query
  with grouped_nominations as (
    select
      public.normalize_music_name(v.album_title) as normalized_album_title,
      public.normalize_music_name(v.artist_name) as normalized_artist_name,
      (array_agg(public.clean_music_text(v.album_title) order by v.created_at desc))[1] as display_album_title,
      (array_agg(public.clean_music_text(v.artist_name) order by v.created_at desc))[1] as display_artist_name,
      count(*)::bigint as total_nominations,
      max(v.created_at) as most_recent_nomination_at
    from public.votes v
    where v.poll_id = target_poll_id
      and v.phase = 'nominations'
      and public.clean_music_text(v.album_title) is not null
      and public.clean_music_text(v.artist_name) is not null
    group by
      public.normalize_music_name(v.album_title),
      public.normalize_music_name(v.artist_name)
  ),
  ranked_nominations as (
    select
      md5(normalized_album_title || '|' || normalized_artist_name) as candidate_id,
      display_album_title as album_title,
      display_artist_name as artist_name,
      total_nominations as nomination_count,
      most_recent_nomination_at as last_nominated_at,
      row_number() over (
        order by total_nominations desc, most_recent_nomination_at desc, display_album_title asc
      )::integer as candidate_rank
    from grouped_nominations
  )
  select
    ranked_nominations.candidate_id,
    ranked_nominations.album_title,
    ranked_nominations.artist_name,
    ranked_nominations.nomination_count,
    ranked_nominations.last_nominated_at,
    ranked_nominations.candidate_rank,
    ranked_nominations.candidate_rank <= greatest(candidate_limit, 1) as advances_to_primary
  from ranked_nominations
  order by ranked_nominations.candidate_rank;
end;
$$;

grant execute on function public.get_primary_candidates(text, integer) to authenticated;
