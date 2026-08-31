-- Live-event voting hardening: serialized phase changes, an enforced final
-- deadline, authoritative ballot counts, and durable administrator IRV ties.
--
-- Fresh project order:
--   schema.sql
--   nomination-validation.sql
--   three-phase-voting.sql
--   site-content.sql
--   current-album-ratings.sql
--   security-hardening.sql
--   event-voting-hardening.sql (last)
--
-- Existing project where security-hardening.sql already ran:
--   Run only this file. It is deliberately safe to rerun and establishes
--   least-privilege grants for every object it creates or replaces. Do not
--   rerun an older setup file afterward, because it would restore an older
--   function body without these event-safety invariants.

begin;

-- The final phase remains the poll phase after voting closes. Closing is
-- derived from these timestamps, so no cron job or background worker is
-- required for the database to reject late ballots.
alter table public.polls
  add column if not exists final_opened_at timestamptz,
  add column if not exists final_closes_at timestamptz,
  add column if not exists final_closed_at timestamptz;

-- Recover a defensible window for polls that were already in final when this
-- migration was installed. polls.updated_at is the best available record of
-- when the legacy row most recently entered/changed its final state.
update public.polls
set final_opened_at = coalesce(final_opened_at, updated_at),
    final_closes_at = coalesce(final_closes_at, coalesce(final_opened_at, updated_at) + interval '18 hours')
where phase = 'final'
  and (final_opened_at is null or final_closes_at is null);

do $constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.polls'::regclass
      and conname = 'polls_final_window_valid'
  ) then
    alter table public.polls
      add constraint polls_final_window_valid check (
        (
          final_opened_at is null
          and final_closes_at is null
          and final_closed_at is null
        )
        or
        (
          final_opened_at is not null
          and final_closes_at is not null
          and final_closes_at > final_opened_at
          and (final_closed_at is null or final_closed_at >= final_opened_at)
        )
      );
  end if;
end;
$constraint$;

comment on column public.polls.final_opened_at is
  'Server timestamp set when final voting begins.';
comment on column public.polls.final_closes_at is
  'Hard final-ballot deadline, normally final_opened_at plus 18 hours.';
comment on column public.polls.final_closed_at is
  'Optional earlier manual close; a null value does not override final_closes_at.';

create table if not exists public.poll_irv_tie_resolutions (
  poll_id text not null references public.polls(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  eliminated_candidate_id text not null references public.poll_candidates(id) on delete cascade,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now(),
  primary key (poll_id, round_number)
);

comment on table public.poll_irv_tie_resolutions is
  'Append-only administrator decisions for otherwise unresolved IRV elimination ties.';

alter table public.poll_irv_tie_resolutions enable row level security;

drop policy if exists "admins can read IRV tie resolutions" on public.poll_irv_tie_resolutions;
create policy "admins can read IRV tie resolutions"
on public.poll_irv_tie_resolutions
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.status = 'approved'
      and m.role = 'admin'
  )
);

-- No client role may write decisions directly. The RPC below validates the
-- current calculated tie, records the deciding admin, and serializes admins.
revoke all privileges on table public.poll_irv_tie_resolutions
from public, anon, authenticated;
grant select on table public.poll_irv_tie_resolutions to authenticated;

-- This helper is used by member nomination, primary, final, and rating RPCs.
-- FOR SHARE allows every member request to proceed concurrently, while still
-- conflicting with an administrator's exclusive poll-row lock. That prevents
-- a phase change from crossing a ballot without turning the poll row into a
-- 100-voter serialization bottleneck.
create or replace function public.assert_poll_phase(
  target_poll_id text,
  expected_phase text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_phase text;
begin
  select p.phase
  into current_phase
  from public.polls p
  where p.id = target_poll_id
    and p.is_active
  for share of p;

  if current_phase is null then
    raise exception 'POLL_NOT_ACTIVE: The requested poll is not active.' using errcode = 'P0001';
  end if;

  if current_phase <> expected_phase then
    raise exception 'PHASE_CLOSED: This poll is currently in the % phase.', current_phase using errcode = 'P0001';
  end if;
end;
$$;

-- Administrator mutations take the exclusive form of the same row lock from
-- the start of their transaction. Keeping this separate from the member
-- helper avoids share-to-exclusive lock upgrades and their deadlock risk when
-- two administrators act concurrently.
create or replace function public.lock_poll_phase_for_admin(
  target_poll_id text,
  expected_phase text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_phase text;
begin
  select p.phase
  into current_phase
  from public.polls p
  where p.id = target_poll_id
    and p.is_active
  for update of p;

  if current_phase is null then
    raise exception 'POLL_NOT_ACTIVE: The requested poll is not active.' using errcode = 'P0001';
  end if;

  if current_phase <> expected_phase then
    raise exception 'PHASE_CLOSED: This poll is currently in the % phase.', current_phase using errcode = 'P0001';
  end if;
end;
$$;

-- Preserve the member-aware reader installed by security-hardening.sql while
-- exposing the final window. The returned status is derived at read time so
-- an expired poll looks closed even though no scheduler updated its row.
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
    when final_is_closed then 'Final voting is closed'
    else active_poll.status
  end;

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
    'album_of_week', active_poll.album_of_week,
    'candidates', candidates,
    'finalists', finalists,
    'finalOpenedAt', active_poll.final_opened_at,
    'finalClosesAt', active_poll.final_closes_at,
    'finalClosedAt', active_poll.final_closed_at,
    'finalIsClosed', final_is_closed
  );
end;
$$;

-- Phase mutations take the exclusive lock before they rebuild candidates or
-- change finalist flags. This preserves concurrent member reads/writes while
-- giving every transition an atomic boundary.
create or replace function public.advance_to_primary(target_poll_id text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can advance phases.' using errcode = 'P0001';
  end if;

  perform public.lock_poll_phase_for_admin(target_poll_id, 'nominations');
  perform public.rebuild_poll_candidates(target_poll_id);

  if not exists (
    select 1
    from public.poll_candidates
    where poll_id = target_poll_id
  ) then
    raise exception 'NO_NOMINATIONS: Add nominations before moving to primary.' using errcode = 'P0001';
  end if;

  update public.polls
  set phase = 'primary',
      status = 'Primary voting is open',
      description = 'Choose one to five albums from the full nomination pool.'
  where id = target_poll_id;
end;
$$;

create or replace function public.save_finalists(
  target_poll_id text,
  candidate_ids text[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  candidate_id_value text;
  rank_index integer := 1;
  available_candidate_count integer;
  required_finalist_count integer;
  selected_finalist_count integer := coalesce(cardinality(candidate_ids), 0);
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can choose finalists.' using errcode = 'P0001';
  end if;

  perform public.lock_poll_phase_for_admin(target_poll_id, 'primary');

  select count(*)::integer
  into available_candidate_count
  from public.poll_candidates
  where poll_id = target_poll_id;

  required_finalist_count := least(5, available_candidate_count);

  if required_finalist_count < 1 then
    raise exception 'NO_FINALISTS_AVAILABLE: Add at least one album before moving to final voting.' using errcode = 'P0001';
  end if;

  if selected_finalist_count <> required_finalist_count then
    raise exception 'FINALIST_COUNT_REQUIRED: Select exactly % finalists.', required_finalist_count using errcode = 'P0001';
  end if;

  if (select count(distinct x) from unnest(candidate_ids) as x) <> selected_finalist_count then
    raise exception 'DUPLICATE_FINALIST: Each finalist can only appear once.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from unnest(candidate_ids) as x
    where not exists (
      select 1
      from public.poll_candidates pc
      where pc.poll_id = target_poll_id
        and pc.id = x
    )
  ) then
    raise exception 'INVALID_FINALIST: Finalists must come from this poll.' using errcode = 'P0001';
  end if;

  update public.poll_candidates
  set is_finalist = false,
      finalist_order = null
  where poll_id = target_poll_id;

  foreach candidate_id_value in array candidate_ids loop
    update public.poll_candidates
    set is_finalist = true,
        finalist_order = rank_index
    where poll_id = target_poll_id
      and id = candidate_id_value;
    rank_index := rank_index + 1;
  end loop;
end;
$$;

-- Opening final voting is the only normal way the deadline is created. The
-- exclusive row lock acquired by save_finalists also prevents a ballot or
-- another phase transition from crossing this update.
create or replace function public.advance_to_final(
  target_poll_id text,
  candidate_ids text[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  available_candidate_count integer;
  required_finalist_count integer;
  saved_finalist_count integer;
  opened_at timestamptz;
begin
  if candidate_ids is not null then
    perform public.save_finalists(target_poll_id, candidate_ids);
  end if;

  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can advance phases.' using errcode = 'P0001';
  end if;

  perform public.lock_poll_phase_for_admin(target_poll_id, 'primary');

  select count(*)::integer
  into available_candidate_count
  from public.poll_candidates
  where poll_id = target_poll_id;

  required_finalist_count := least(5, available_candidate_count);

  select count(*)::integer
  into saved_finalist_count
  from public.poll_candidates
  where poll_id = target_poll_id
    and is_finalist;

  if required_finalist_count < 1 or saved_finalist_count <> required_finalist_count then
    raise exception 'FINALIST_COUNT_REQUIRED: Save exactly % finalists before final voting.', required_finalist_count using errcode = 'P0001';
  end if;

  opened_at := now();

  update public.polls
  set phase = 'final',
      status = 'Final IRV voting is open',
      description = format(
        'Rank all %s %s from favorite to least favorite.',
        required_finalist_count,
        case when required_finalist_count = 1 then 'finalist' else 'finalists' end
      ),
      final_opened_at = opened_at,
      final_closes_at = opened_at + interval '18 hours',
      final_closed_at = null
  where id = target_poll_id;
end;
$$;

-- The deadline check happens while holding the same poll-row lock as phase
-- changes and manual closure. Exactly one of a concurrent close or ballot can
-- win the lock first; the other observes the committed state and behaves
-- deterministically.
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

  foreach candidate_id_value in array ranked_candidate_ids loop
    insert into public.vote_choices (vote_id, candidate_id, rank)
    values (saved_vote.id, candidate_id_value, rank_index);
    rank_index := rank_index + 1;
  end loop;

  return public.format_vote_json(saved_vote.id);
end;
$$;

-- An admin may deliberately close early (for example, after an in-person
-- deadline). Automatic closure still occurs at final_closes_at without this
-- RPC. The earlier timestamp is retained for auditability.
create or replace function public.close_final_voting(target_poll_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  final_poll public.polls%rowtype;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can close final voting.' using errcode = 'P0001';
  end if;

  perform public.lock_poll_phase_for_admin(target_poll_id, 'final');

  update public.polls
  set final_closed_at = coalesce(final_closed_at, least(now(), final_closes_at)),
      status = 'Final voting is closed'
  where id = target_poll_id
  returning * into final_poll;

  return jsonb_build_object(
    'id', final_poll.id,
    'finalOpenedAt', final_poll.final_opened_at,
    'finalClosesAt', final_poll.final_closes_at,
    'finalClosedAt', final_poll.final_closed_at,
    'finalIsClosed', true
  );
end;
$$;

-- Stored tie decisions are applied only when the candidate is still tied for
-- last in that exact round. Invalid/stale data never silently eliminates a
-- candidate; it is returned as an unresolved tie for administrator attention.
create or replace function public.calculate_irv_result(target_poll_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  active_candidates text[];
  current_round_number integer := 1;
  rounds jsonb := '[]'::jsonb;
  round_tallies jsonb;
  active_ballots integer;
  max_votes integer;
  min_votes integer;
  winner_candidate_id text;
  eliminated_candidate_id text;
  tied_candidate_ids text[];
  elimination_method text;
begin
  select array_agg(id order by finalist_order)
  into active_candidates
  from public.poll_candidates
  where poll_id = target_poll_id
    and is_finalist;

  if coalesce(array_length(active_candidates, 1), 0) < 1 then
    return jsonb_build_object('rounds', rounds, 'winnerId', null, 'tie', null);
  end if;

  loop
    eliminated_candidate_id := null;
    elimination_method := null;

    with ballot_next_choices as (
      select distinct on (v.id)
        v.id as vote_id,
        vc.candidate_id
      from public.votes v
      join public.vote_choices vc on vc.vote_id = v.id
      where v.poll_id = target_poll_id
        and v.phase = 'final'
        and vc.candidate_id = any(active_candidates)
      order by v.id, vc.rank
    ),
    tallies as (
      select
        c.candidate_id,
        count(b.vote_id)::integer as votes
      from unnest(active_candidates) as c(candidate_id)
      left join ballot_next_choices b on b.candidate_id = c.candidate_id
      group by c.candidate_id
    )
    select
      coalesce(sum(votes), 0)::integer,
      coalesce(max(votes), 0)::integer,
      coalesce(min(votes), 0)::integer,
      jsonb_agg(jsonb_build_object('candidateId', candidate_id, 'votes', votes) order by votes desc, candidate_id)
    into active_ballots, max_votes, min_votes, round_tallies
    from tallies;

    rounds := rounds || jsonb_build_array(jsonb_build_object(
      'round', current_round_number,
      'activeBallots', active_ballots,
      'tallies', coalesce(round_tallies, '[]'::jsonb)
    ));

    if active_ballots = 0 then
      return jsonb_build_object('rounds', rounds, 'winnerId', null, 'tie', null);
    end if;

    if max_votes > active_ballots / 2 then
      with tallies as (
        select
          (tally ->> 'candidateId') as candidate_id,
          (tally ->> 'votes')::integer as votes
        from jsonb_array_elements(round_tallies) as tally
      )
      select candidate_id into winner_candidate_id
      from tallies
      where votes = max_votes
      order by candidate_id
      limit 1;

      return jsonb_build_object('rounds', rounds, 'winnerId', winner_candidate_id, 'tie', null);
    end if;

    if array_length(active_candidates, 1) = 1 then
      return jsonb_build_object('rounds', rounds, 'winnerId', active_candidates[1], 'tie', null);
    end if;

    with tallies as (
      select
        (tally ->> 'candidateId') as candidate_id,
        (tally ->> 'votes')::integer as votes
      from jsonb_array_elements(round_tallies) as tally
    )
    select array_agg(candidate_id order by candidate_id)
    into tied_candidate_ids
    from tallies
    where votes = min_votes;

    if array_length(tied_candidate_ids, 1) > 1 then
      select r.eliminated_candidate_id
      into eliminated_candidate_id
      from public.poll_irv_tie_resolutions r
      where r.poll_id = target_poll_id
        and r.round_number = current_round_number;

      if eliminated_candidate_id is null
        or not (eliminated_candidate_id = any(tied_candidate_ids)) then
        return jsonb_build_object(
          'rounds', rounds,
          'winnerId', null,
          'tie', jsonb_strip_nulls(jsonb_build_object(
            'round', current_round_number,
            'candidateIds', tied_candidate_ids,
            'invalidResolutionCandidateId', eliminated_candidate_id
          ))
        );
      end if;

      elimination_method := 'adminTieBreak';
    else
      eliminated_candidate_id := tied_candidate_ids[1];
      elimination_method := 'lowestVotes';
    end if;

    rounds := jsonb_set(
      rounds,
      array[(jsonb_array_length(rounds) - 1)::text],
      (rounds -> (jsonb_array_length(rounds) - 1)) || jsonb_build_object(
        'eliminatedCandidateId', eliminated_candidate_id,
        'eliminationMethod', elimination_method
      )
    );
    active_candidates := array_remove(active_candidates, eliminated_candidate_id);
    current_round_number := current_round_number + 1;
  end loop;
end;
$$;

-- A tie decision is append-only and only valid after final voting has closed.
-- The poll-row lock prevents two admins from resolving the same tie or a late
-- ballot from crossing the decision.
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
  final_poll public.polls%rowtype;
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

  select * into final_poll
  from public.polls
  where id = target_poll_id;

  if not (
    final_poll.final_closed_at is not null
    or (
      final_poll.final_closes_at is not null
      and now() >= final_poll.final_closes_at
    )
  ) then
    raise exception 'FINAL_STILL_OPEN: Close final voting before resolving an IRV tie.' using errcode = 'P0001';
  end if;

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

-- Preserve rating results while exposing exact unique voter counts and final
-- timing. These counts come from committed database rows, never client state.
create or replace function public.get_admin_poll_results(target_poll_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_poll public.polls%rowtype;
  nominations jsonb;
  primary_results jsonb;
  finalists jsonb;
  current_album_rating jsonb;
  ballot_counts jsonb;
  final_is_closed boolean := false;
  irv jsonb;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can view aggregate results.' using errcode = 'P0001';
  end if;

  select * into target_poll
  from public.polls
  where id = target_poll_id;

  if target_poll.id is null then
    raise exception 'POLL_NOT_FOUND: The requested poll does not exist.' using errcode = 'P0001';
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

  select jsonb_build_object(
    'nominations', count(distinct user_id) filter (where phase = 'nominations')::integer,
    'primary', count(distinct user_id) filter (where phase = 'primary')::integer,
    'final', count(distinct user_id) filter (where phase = 'final')::integer
  )
  into ballot_counts
  from public.votes
  where poll_id = target_poll_id;

  final_is_closed := target_poll.phase = 'final'
    and (
      target_poll.final_closed_at is not null
      or (
        target_poll.final_closes_at is not null
        and now() >= target_poll.final_closes_at
      )
    );

  irv := public.calculate_irv_result(target_poll_id);

  return jsonb_build_object(
    'nominations', nominations,
    'primaryResults', primary_results,
    'finalists', finalists,
    'currentAlbumRating', current_album_rating,
    'ballotCounts', ballot_counts,
    'finalVoting', jsonb_build_object(
      'openedAt', target_poll.final_opened_at,
      'closesAt', target_poll.final_closes_at,
      'closedAt', target_poll.final_closed_at,
      'isClosed', final_is_closed
    ),
    'irv', irv
  );
end;
$$;

-- Poll creation also archives the prior album/rating. A transaction-scoped
-- advisory lock covers the otherwise un-lockable "no active row" case; the
-- existing active row is then locked in the same way as ballot operations.
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
set search_path = pg_catalog, public
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('albumasu:active-poll-creation', 0)
  );

  select * into previous_poll
  from public.polls
  where is_active
  order by created_at desc
  limit 1
  for update;

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
    is_active,
    final_opened_at,
    final_closes_at,
    final_closed_at
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
    true,
    null,
    null,
    null
  );

  return public.get_current_poll();
end;
$$;

-- Serialize album replacement with current-album ratings and poll creation so
-- a rating cannot race past the "album has ratings" guard.
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
  where id = active_poll.id;

  return public.get_current_poll();
end;
$$;

-- Reinforce the RPC-only ballot boundary even when this migration is applied
-- before security-hardening.sql on a fresh project.
drop policy if exists "approved members can vote once" on public.votes;
drop policy if exists "approved members can insert vote choices" on public.vote_choices;
revoke insert, update on table public.votes from public, anon, authenticated;
revoke insert, update on table public.vote_choices from public, anon, authenticated;

-- CREATE OR REPLACE retains an existing function's ACL, while a newly-created
-- function can inherit environment defaults. Normalize every affected ACL so
-- this file is safe both before and after security-hardening.sql.
revoke execute on function public.assert_poll_phase(text, text)
from public, anon, authenticated;
revoke execute on function public.lock_poll_phase_for_admin(text, text)
from public, anon, authenticated;
revoke execute on function public.get_current_poll()
from public, anon, authenticated;
revoke execute on function public.advance_to_primary(text)
from public, anon, authenticated;
revoke execute on function public.save_finalists(text, text[])
from public, anon, authenticated;
revoke execute on function public.advance_to_final(text, text[])
from public, anon, authenticated;
revoke execute on function public.submit_final_ballot(text, text[])
from public, anon, authenticated;
revoke execute on function public.close_final_voting(text)
from public, anon, authenticated;
revoke execute on function public.calculate_irv_result(text)
from public, anon, authenticated;
revoke execute on function public.resolve_irv_tie(text, integer, text)
from public, anon, authenticated;
revoke execute on function public.get_admin_poll_results(text)
from public, anon, authenticated;
revoke execute on function public.create_poll(text, text, text, text, text, text)
from public, anon, authenticated;
revoke execute on function public.update_current_album(text, text, text, text)
from public, anon, authenticated;

grant execute on function public.get_current_poll()
to authenticated, service_role;
grant execute on function public.advance_to_primary(text)
to authenticated;
grant execute on function public.save_finalists(text, text[])
to authenticated;
grant execute on function public.advance_to_final(text, text[])
to authenticated;
grant execute on function public.submit_final_ballot(text, text[])
to authenticated;
grant execute on function public.close_final_voting(text)
to authenticated;
grant execute on function public.resolve_irv_tie(text, integer, text)
to authenticated;
grant execute on function public.get_admin_poll_results(text)
to authenticated;
grant execute on function public.create_poll(text, text, text, text, text, text)
to authenticated;
grant execute on function public.update_current_album(text, text, text, text)
to authenticated;

commit;
