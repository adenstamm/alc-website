-- Immediate winner publication for manually closed finals.
--
-- Run after:
--   archive-perfect-scores-and-primary-removal.sql
--
-- The scheduled finalize_due_polls job remains the fallback for finals that
-- reach their deadline without an administrator pressing Close. A manual close
-- now finalizes in the same transaction. If IRV still needs an administrator
-- tie-break, resolving the last closed-final tie also finalizes immediately.

begin;

create or replace function public.close_final_voting(target_poll_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can close final voting.' using errcode = 'P0001';
  end if;

  perform public.lock_poll_phase_for_admin(target_poll_id, 'final');

  update public.polls
  set final_closed_at = coalesce(final_closed_at, least(now(), final_closes_at)),
      status = 'Final voting is closed'
  where id = target_poll_id;

  return public.finalize_poll_winner(target_poll_id);
end;
$$;

create or replace function public.resolve_irv_tie(
  target_poll_id text,
  target_round integer,
  eliminated_candidate_id_input text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  irv_result jsonb;
  pending_tie jsonb;
  pending_round integer;
  final_is_closed boolean := false;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can resolve IRV ties.' using errcode = 'P0001';
  end if;

  if target_round is null or target_round < 1 or nullif(trim(eliminated_candidate_id_input), '') is null then
    raise exception 'TIE_DECISION_REQUIRED: Choose a tied candidate and round.' using errcode = 'P0001';
  end if;

  perform public.lock_poll_phase_for_admin(target_poll_id, 'final');

  irv_result := public.calculate_irv_result(target_poll_id);
  pending_tie := irv_result -> 'tie';

  if pending_tie is null or pending_tie = 'null'::jsonb then
    raise exception 'NO_IRV_TIE: The current result has no unresolved elimination tie.' using errcode = 'P0001';
  end if;

  pending_round := (pending_tie ->> 'round')::integer;

  if pending_round <> target_round then
    raise exception 'IRV_TIE_ROUND_MISMATCH: Resolve round % before round %.', pending_round, target_round using errcode = 'P0001';
  end if;

  if not ((pending_tie -> 'candidateIds') ? eliminated_candidate_id_input) then
    raise exception 'INVALID_TIE_ELIMINATION: Choose one of the candidates tied for elimination in round %.', target_round using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.poll_candidates pc
    where pc.poll_id = target_poll_id
      and pc.id = eliminated_candidate_id_input
      and pc.is_finalist
  ) then
    raise exception 'INVALID_FINALIST: The selected elimination is not a finalist in this poll.' using errcode = 'P0001';
  end if;

  begin
    insert into public.poll_irv_tie_resolutions (
      poll_id,
      round_number,
      eliminated_candidate_id,
      decided_by
    )
    values (
      target_poll_id,
      target_round,
      eliminated_candidate_id_input,
      auth.uid()
    );
  exception
    when unique_violation then
      raise exception 'IRV_TIE_ALREADY_RESOLVED: This round already has an administrator decision.' using errcode = 'P0001';
  end;

  irv_result := public.calculate_irv_result(target_poll_id);

  select
    p.final_closed_at is not null
      or (p.final_closes_at is not null and now() >= p.final_closes_at)
  into final_is_closed
  from public.polls p
  where p.id = target_poll_id;

  if final_is_closed
    and (irv_result -> 'tie' is null or irv_result -> 'tie' = 'null'::jsonb)
    and nullif(irv_result ->> 'winnerId', '') is not null then
    perform public.finalize_poll_winner(target_poll_id);
  end if;

  return irv_result;
end;
$$;

revoke execute on function public.close_final_voting(text)
from public, anon, authenticated;
revoke execute on function public.resolve_irv_tie(text, integer, text)
from public, anon, authenticated;

grant execute on function public.close_final_voting(text)
to authenticated;
grant execute on function public.resolve_irv_tie(text, integer, text)
to authenticated;

commit;
