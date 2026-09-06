-- Forward-only fixes. Previously applied migration bodies remain immutable.
create or replace function public.normalize_music_name(value text)
returns text language sql immutable as $$
  select nullif(trim(regexp_replace(regexp_replace(
    lower(normalize(coalesce(public.clean_music_text(value), ''), NFKC)),
    '[[:punct:]¡¿‘’“”«»]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')), '');
$$;

-- Generated values are stored: consolidate new equivalents before recomputing.
delete from public.banned_albums a using public.banned_albums b
where public.normalize_music_name(a.name) = public.normalize_music_name(b.name)
  and a.name > b.name;
delete from public.banned_artists a using public.banned_artists b
where public.normalize_music_name(a.name) = public.normalize_music_name(b.name)
  and a.name > b.name;
update public.banned_albums set name = name;
update public.banned_artists set name = name;

-- An empty final has no winner or tie to resolve. Allow an admin to reopen it,
-- preserving the candidates and preventing any reset of accepted ballots.
create or replace function public.reopen_empty_final(target_poll_id text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare target_poll public.polls%rowtype;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can reopen voting.' using errcode = 'P0001';
  end if;
  perform public.lock_poll_phase_for_admin(target_poll_id, 'final');
  select * into target_poll from public.polls where id = target_poll_id;
  if target_poll.winner_published_at is not null
    or (target_poll.final_closed_at is null and (target_poll.final_closes_at is null or target_poll.final_closes_at > now())) then
    raise exception 'CLOSED_EMPTY_FINAL_REQUIRED: Only an unpublished closed final can be reopened.' using errcode = 'P0001';
  end if;
  if exists(select 1 from public.votes where poll_id = target_poll_id and phase = 'final') then
    raise exception 'FINAL_HAS_BALLOTS: Accepted ballots cannot be reset.' using errcode = 'P0001';
  end if;
  update public.polls set final_opened_at = now(),
    final_closes_at = now() + interval '18 hours', final_closed_at = null,
    status = 'Final IRV voting is open' where id = target_poll_id;
  return jsonb_build_object('pollId', target_poll_id, 'state', 'reopened');
end;
$$;
revoke all on function public.reopen_empty_final(text) from public, anon, authenticated;
grant execute on function public.reopen_empty_final(text) to authenticated;
