-- Provisional IRV tie decisions during an open final.
--
-- Run after:
--   event-voting-hardening.sql
--   automatic-winner-publishing.sql
--
-- An administrator may resolve the exact tie currently shown while voting is
-- still open. The next successfully accepted final ballot clears every saved
-- resolution for that poll before the count is recalculated. Rejected and
-- duplicate submissions do not clear a decision.

begin;

comment on table public.poll_irv_tie_resolutions is
  'Administrator IRV decisions. Decisions made during open final voting are provisional and cleared by the next accepted final ballot.';

create or replace function public.submit_final_ballot(
  target_poll_id text,
  ranked_candidate_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  saved_vote public.votes%rowtype;
  candidate_id_value text;
  rank_index integer := 1;
  finalist_count integer;
  final_opened_at_value timestamptz;
  final_closes_at_value timestamptz;
  final_closed_at_value timestamptz;
begin
  if not public.is_approved_member() then
    raise exception 'APPROVED_MEMBER_REQUIRED: Only approved members can vote.' using errcode = 'P0001';
  end if;

  perform public.assert_poll_phase(target_poll_id, 'final');

  select p.final_opened_at, p.final_closes_at, p.final_closed_at
  into final_opened_at_value, final_closes_at_value, final_closed_at_value
  from public.polls p
  where p.id = target_poll_id;

  if final_opened_at_value is null or final_closes_at_value is null then
    raise exception 'FINAL_WINDOW_NOT_CONFIGURED: Final voting has no valid server deadline.' using errcode = 'P0001';
  end if;

  if final_closed_at_value is not null or now() >= final_closes_at_value then
    raise exception 'FINAL_VOTING_CLOSED: Final voting closed at %.',
      coalesce(final_closed_at_value, final_closes_at_value) using errcode = 'P0001';
  end if;

  select count(*)::integer
  into finalist_count
  from public.poll_candidates
  where poll_id = target_poll_id
    and is_finalist;

  if finalist_count < 1 or coalesce(cardinality(ranked_candidate_ids), 0) <> finalist_count then
    raise exception 'FINAL_RANKING_REQUIRED: Rank all % finalists.', finalist_count using errcode = 'P0001';
  end if;

  if (select count(distinct x) from unnest(ranked_candidate_ids) as x) <> finalist_count then
    raise exception 'DUPLICATE_RANKING: Each finalist can only appear once.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from unnest(ranked_candidate_ids) as x
    where not exists (
      select 1
      from public.poll_candidates pc
      where pc.poll_id = target_poll_id
        and pc.id = x
        and pc.is_finalist
    )
  ) then
    raise exception 'INVALID_FINALIST: Final rankings must use every saved finalist.' using errcode = 'P0001';
  end if;

  begin
    insert into public.votes (poll_id, phase, user_id)
    values (target_poll_id, 'final', auth.uid())
    returning * into saved_vote;
  exception
    when unique_violation then
      raise exception 'ALREADY_VOTED: Your account already submitted this phase.' using errcode = 'P0001';
  end;

  -- Keep the current decision when the attempted ballot was rejected. Only a
  -- newly inserted vote reaches this statement. The member's shared poll-row
  -- lock and the administrator's exclusive lock prevent a crossing race.
  delete from public.poll_irv_tie_resolutions
  where poll_id = target_poll_id;

  foreach candidate_id_value in array ranked_candidate_ids loop
    insert into public.vote_choices (vote_id, candidate_id, rank)
    values (saved_vote.id, candidate_id_value, rank_index);
    rank_index := rank_index + 1;
  end loop;

  return public.format_vote_json(saved_vote.id);
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

  return public.calculate_irv_result(target_poll_id);
end;
$$;

revoke execute on function public.submit_final_ballot(text, text[])
from public, anon, authenticated;
revoke execute on function public.resolve_irv_tie(text, integer, text)
from public, anon, authenticated;

grant execute on function public.submit_final_ballot(text, text[])
to authenticated;
grant execute on function public.resolve_irv_tie(text, integer, text)
to authenticated;

commit;
