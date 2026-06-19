-- Robust three-phase voting with admin phase control and IRV final results.
-- Run after schema.sql and nomination-validation.sql.

create table if not exists public.polls (
  id text primary key,
  phase text not null default 'nominations' check (phase in ('nominations', 'primary', 'final')),
  status text not null default 'Nominations are open',
  question text not null default 'What should the club listen to next?',
  description text not null default 'Submit one album and artist pairing for the next club session.',
  cycle_label text,
  album_of_week jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists polls_single_active_idx
on public.polls(is_active)
where is_active;

create table if not exists public.poll_candidates (
  id text primary key,
  poll_id text not null references public.polls(id) on delete cascade,
  album_title text not null,
  artist_name text not null,
  normalized_album_title text not null,
  normalized_artist_name text not null,
  nomination_count integer not null default 0,
  is_finalist boolean not null default false,
  finalist_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (poll_id, normalized_album_title, normalized_artist_name),
  constraint finalists_have_order check (
    (is_finalist and finalist_order is not null)
    or
    (not is_finalist)
  )
);

create table if not exists public.vote_choices (
  id uuid primary key default gen_random_uuid(),
  vote_id uuid not null references public.votes(id) on delete cascade,
  candidate_id text not null references public.poll_candidates(id) on delete cascade,
  rank integer not null,
  created_at timestamptz not null default now(),
  unique (vote_id, candidate_id),
  unique (vote_id, rank)
);

alter table public.votes drop constraint if exists votes_one_per_user_per_poll;
alter table public.votes drop constraint if exists votes_one_per_user_per_poll_phase;
alter table public.votes drop constraint if exists votes_valid_payload;
alter table public.votes
  add constraint votes_one_per_user_per_poll_phase unique (poll_id, phase, user_id);
alter table public.votes
  add constraint votes_valid_payload check (
    (phase = 'nominations' and album_title is not null and artist_name is not null)
    or
    (phase in ('primary', 'final') and album_title is null and artist_name is null)
  );

create index if not exists poll_candidates_poll_id_idx on public.poll_candidates(poll_id);
create index if not exists poll_candidates_finalist_idx on public.poll_candidates(poll_id, is_finalist);
create index if not exists vote_choices_vote_id_idx on public.vote_choices(vote_id);
create index if not exists vote_choices_candidate_id_idx on public.vote_choices(candidate_id);

drop trigger if exists polls_touch_updated_at on public.polls;
create trigger polls_touch_updated_at
before update on public.polls
for each row execute function public.touch_updated_at();

drop trigger if exists poll_candidates_touch_updated_at on public.poll_candidates;
create trigger poll_candidates_touch_updated_at
before update on public.poll_candidates
for each row execute function public.touch_updated_at();

alter table public.polls enable row level security;
alter table public.poll_candidates enable row level security;
alter table public.vote_choices enable row level security;

drop policy if exists "anyone can read active polls" on public.polls;
create policy "anyone can read active polls"
on public.polls for select
using (is_active or public.is_admin());

drop policy if exists "admins can manage polls" on public.polls;
create policy "admins can manage polls"
on public.polls for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "approved members can read poll candidates" on public.poll_candidates;
create policy "approved members can read poll candidates"
on public.poll_candidates for select
using (public.is_approved_member() or public.is_admin());

drop policy if exists "admins can manage poll candidates" on public.poll_candidates;
create policy "admins can manage poll candidates"
on public.poll_candidates for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "members can read own vote choices" on public.vote_choices;
create policy "members can read own vote choices"
on public.vote_choices for select
using (
  public.is_admin()
  or exists (
    select 1 from public.votes v
    where v.id = vote_choices.vote_id
      and v.user_id = auth.uid()
  )
);

drop policy if exists "approved members can insert vote choices" on public.vote_choices;
create policy "approved members can insert vote choices"
on public.vote_choices for insert
with check (
  public.is_approved_member()
  and exists (
    select 1 from public.votes v
    where v.id = vote_choices.vote_id
      and v.user_id = auth.uid()
  )
);

create or replace function public.get_active_poll_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select id from public.polls where is_active order by created_at desc limit 1;
$$;

create or replace function public.assert_poll_phase(target_poll_id text, expected_phase text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_phase text;
begin
  select phase into current_phase
  from public.polls
  where id = target_poll_id
    and is_active;

  if current_phase is null then
    raise exception 'POLL_NOT_ACTIVE: The requested poll is not active.' using errcode = 'P0001';
  end if;

  if current_phase <> expected_phase then
    raise exception 'PHASE_CLOSED: This poll is currently in the % phase.', current_phase using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.candidate_json(c public.poll_candidates)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', c.id,
    'title', c.album_title,
    'artist', c.artist_name,
    'nominationCount', c.nomination_count,
    'isFinalist', c.is_finalist,
    'finalistOrder', c.finalist_order
  );
$$;

create or replace function public.get_current_poll()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_poll public.polls%rowtype;
  candidates jsonb;
  finalists jsonb;
begin
  select * into active_poll
  from public.polls
  where is_active
  order by created_at desc
  limit 1;

  if active_poll.id is null then
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
      '2026-week-16',
      'nominations',
      'Nominations are open',
      'What should the club listen to next?',
      'Submit one album and artist pairing for the next club session.',
      'Week 16',
      '{"title":"Heaven or Las Vegas","artist":"Cocteau Twins","note":"Current club listen","coverClass":"cover-week"}'::jsonb,
      true
    )
    returning * into active_poll;
  end if;

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

create or replace function public.format_vote_json(target_vote_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'poll_id', v.poll_id,
    'phase', v.phase,
    'album_title', v.album_title,
    'artist_name', v.artist_name,
    'created_at', v.created_at,
    'choices', coalesce(
      jsonb_agg(
        jsonb_build_object('candidate_id', vc.candidate_id, 'rank', vc.rank)
        order by vc.rank
      ) filter (where vc.id is not null),
      '[]'::jsonb
    )
  )
  from public.votes v
  left join public.vote_choices vc on vc.vote_id = v.id
  where v.id = target_vote_id
  group by v.id;
$$;

create or replace function public.submit_nomination(
  target_poll_id text,
  album_title_input text,
  artist_name_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_vote public.votes%rowtype;
begin
  if not public.is_approved_member() then
    raise exception 'APPROVED_MEMBER_REQUIRED: Only approved members can vote.' using errcode = 'P0001';
  end if;

  perform public.assert_poll_phase(target_poll_id, 'nominations');

  begin
    insert into public.votes (poll_id, phase, user_id, album_title, artist_name)
    values (target_poll_id, 'nominations', auth.uid(), album_title_input, artist_name_input)
    returning * into saved_vote;
  exception
    when unique_violation then
      raise exception 'ALREADY_VOTED: Your account already submitted this phase.' using errcode = 'P0001';
  end;

  return public.format_vote_json(saved_vote.id);
end;
$$;

create or replace function public.rebuild_poll_candidates(target_poll_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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
    md5(target_poll_id || '|' || public.normalize_music_name(v.album_title) || '|' || public.normalize_music_name(v.artist_name)),
    target_poll_id,
    (array_agg(public.clean_music_text(v.album_title) order by v.created_at desc))[1],
    (array_agg(public.clean_music_text(v.artist_name) order by v.created_at desc))[1],
    public.normalize_music_name(v.album_title),
    public.normalize_music_name(v.artist_name),
    count(*)::integer
  from public.votes v
  where v.poll_id = target_poll_id
    and v.phase = 'nominations'
  group by public.normalize_music_name(v.album_title), public.normalize_music_name(v.artist_name)
  on conflict (poll_id, normalized_album_title, normalized_artist_name) do update
    set album_title = excluded.album_title,
        artist_name = excluded.artist_name,
        nomination_count = excluded.nomination_count;
end;
$$;

create or replace function public.advance_to_primary(target_poll_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can advance phases.' using errcode = 'P0001';
  end if;

  perform public.assert_poll_phase(target_poll_id, 'nominations');
  perform public.rebuild_poll_candidates(target_poll_id);

  if not exists (select 1 from public.poll_candidates where poll_id = target_poll_id) then
    raise exception 'NO_NOMINATIONS: Add nominations before moving to primary.' using errcode = 'P0001';
  end if;

  update public.polls
  set phase = 'primary',
      status = 'Primary voting is open',
      description = 'Choose one to five albums from the full nomination pool.'
  where id = target_poll_id;
end;
$$;

create or replace function public.submit_primary_ballot(
  target_poll_id text,
  candidate_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_vote public.votes%rowtype;
  candidate_id_value text;
  rank_index integer := 1;
begin
  if not public.is_approved_member() then
    raise exception 'APPROVED_MEMBER_REQUIRED: Only approved members can vote.' using errcode = 'P0001';
  end if;

  perform public.assert_poll_phase(target_poll_id, 'primary');

  if coalesce(array_length(candidate_ids, 1), 0) < 1 or array_length(candidate_ids, 1) > 5 then
    raise exception 'PRIMARY_SELECTION_COUNT: Choose at least one and up to five albums.' using errcode = 'P0001';
  end if;

  if (select count(distinct x) from unnest(candidate_ids) as x) <> array_length(candidate_ids, 1) then
    raise exception 'DUPLICATE_SELECTION: Each candidate can only appear once.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from unnest(candidate_ids) as x
    where not exists (
      select 1 from public.poll_candidates pc
      where pc.poll_id = target_poll_id
        and pc.id = x
    )
  ) then
    raise exception 'INVALID_CANDIDATE: Primary choices must come from this poll.' using errcode = 'P0001';
  end if;

  begin
    insert into public.votes (poll_id, phase, user_id)
    values (target_poll_id, 'primary', auth.uid())
    returning * into saved_vote;
  exception
    when unique_violation then
      raise exception 'ALREADY_VOTED: Your account already submitted this phase.' using errcode = 'P0001';
  end;

  foreach candidate_id_value in array candidate_ids loop
    insert into public.vote_choices (vote_id, candidate_id, rank)
    values (saved_vote.id, candidate_id_value, rank_index);
    rank_index := rank_index + 1;
  end loop;

  return public.format_vote_json(saved_vote.id);
end;
$$;

create or replace function public.save_finalists(
  target_poll_id text,
  candidate_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_id_value text;
  rank_index integer := 1;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can choose finalists.' using errcode = 'P0001';
  end if;

  perform public.assert_poll_phase(target_poll_id, 'primary');

  if coalesce(array_length(candidate_ids, 1), 0) <> 5 then
    raise exception 'FIVE_FINALISTS_REQUIRED: Select exactly five finalists.' using errcode = 'P0001';
  end if;

  if (select count(distinct x) from unnest(candidate_ids) as x) <> 5 then
    raise exception 'DUPLICATE_FINALIST: Each finalist can only appear once.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from unnest(candidate_ids) as x
    where not exists (
      select 1 from public.poll_candidates pc
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

create or replace function public.advance_to_final(
  target_poll_id text,
  candidate_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if candidate_ids is not null then
    perform public.save_finalists(target_poll_id, candidate_ids);
  end if;

  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can advance phases.' using errcode = 'P0001';
  end if;

  perform public.assert_poll_phase(target_poll_id, 'primary');

  if (select count(*) from public.poll_candidates where poll_id = target_poll_id and is_finalist) <> 5 then
    raise exception 'FIVE_FINALISTS_REQUIRED: Save exactly five finalists before final voting.' using errcode = 'P0001';
  end if;

  update public.polls
  set phase = 'final',
      status = 'Final IRV voting is open',
      description = 'Rank all five finalists from favorite to least favorite.'
  where id = target_poll_id;
end;
$$;

create or replace function public.submit_final_ballot(
  target_poll_id text,
  ranked_candidate_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_vote public.votes%rowtype;
  candidate_id_value text;
  rank_index integer := 1;
begin
  if not public.is_approved_member() then
    raise exception 'APPROVED_MEMBER_REQUIRED: Only approved members can vote.' using errcode = 'P0001';
  end if;

  perform public.assert_poll_phase(target_poll_id, 'final');

  if coalesce(array_length(ranked_candidate_ids, 1), 0) <> 5 then
    raise exception 'FINAL_RANKING_REQUIRED: Rank all five finalists.' using errcode = 'P0001';
  end if;

  if (select count(distinct x) from unnest(ranked_candidate_ids) as x) <> 5 then
    raise exception 'DUPLICATE_RANKING: Each finalist can only appear once.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from unnest(ranked_candidate_ids) as x
    where not exists (
      select 1 from public.poll_candidates pc
      where pc.poll_id = target_poll_id
        and pc.id = x
        and pc.is_finalist
    )
  ) then
    raise exception 'INVALID_FINALIST: Final rankings must use the five finalists.' using errcode = 'P0001';
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

create or replace function public.calculate_irv_result(target_poll_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_candidates text[];
  round_number integer := 1;
  rounds jsonb := '[]'::jsonb;
  round_tallies jsonb;
  active_ballots integer;
  max_votes integer;
  min_votes integer;
  winner_candidate_id text;
  eliminated_candidate_id text;
  tied_candidate_ids text[];
begin
  select array_agg(id order by finalist_order)
  into active_candidates
  from public.poll_candidates
  where poll_id = target_poll_id
    and is_finalist;

  if coalesce(array_length(active_candidates, 1), 0) <> 5 then
    return jsonb_build_object('rounds', rounds, 'winnerId', null, 'tie', null);
  end if;

  loop
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
      'round', round_number,
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
      return jsonb_build_object(
        'rounds', rounds,
        'winnerId', null,
        'tie', jsonb_build_object('round', round_number, 'candidateIds', tied_candidate_ids)
      );
    end if;

    eliminated_candidate_id := tied_candidate_ids[1];
    rounds := jsonb_set(
      rounds,
      array[(jsonb_array_length(rounds) - 1)::text],
      (rounds -> (jsonb_array_length(rounds) - 1)) || jsonb_build_object('eliminatedCandidateId', eliminated_candidate_id)
    );
    active_candidates := array_remove(active_candidates, eliminated_candidate_id);
    round_number := round_number + 1;
  end loop;
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

  irv := public.calculate_irv_result(target_poll_id);

  return jsonb_build_object(
    'nominations', nominations,
    'primaryResults', primary_results,
    'finalists', finalists,
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

grant execute on function public.get_current_poll() to anon, authenticated;
grant execute on function public.submit_nomination(text, text, text) to authenticated;
grant execute on function public.submit_primary_ballot(text, text[]) to authenticated;
grant execute on function public.submit_final_ballot(text, text[]) to authenticated;
grant execute on function public.get_admin_poll_results(text) to authenticated;
grant execute on function public.create_poll(text, text, text, text, text, text) to authenticated;
grant execute on function public.advance_to_primary(text) to authenticated;
grant execute on function public.save_finalists(text, text[]) to authenticated;
grant execute on function public.advance_to_final(text, text[]) to authenticated;

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
  '2026-week-16',
  'nominations',
  'Nominations are open',
  'What should the club listen to next?',
  'Submit one album and artist pairing for the next club session.',
  'Week 16',
  '{"title":"Heaven or Las Vegas","artist":"Cocteau Twins","note":"Current club listen","coverClass":"cover-week"}'::jsonb,
  true
)
on conflict (id) do nothing;


create table if not exists public.record_shelf_covers (
  album_id text primary key,
  album_title text not null,
  artist_override text,
  cover_url text,
  storage_path text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.record_shelf_covers
  add column if not exists artist_override text;

alter table public.record_shelf_covers
  alter column cover_url drop not null,
  alter column storage_path drop not null;

alter table public.record_shelf_covers enable row level security;

drop policy if exists "Anyone can read record shelf covers" on public.record_shelf_covers;
create policy "Anyone can read record shelf covers"
on public.record_shelf_covers
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can manage record shelf covers" on public.record_shelf_covers;
create policy "Admins can manage record shelf covers"
on public.record_shelf_covers
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.touch_record_shelf_cover_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_record_shelf_covers_updated_at on public.record_shelf_covers;
create trigger set_record_shelf_covers_updated_at
before update on public.record_shelf_covers
for each row
execute function public.touch_record_shelf_cover_updated_at();

insert into storage.buckets (id, name, public)
values ('record-shelf-covers', 'record-shelf-covers', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can read record shelf cover files" on storage.objects;
create policy "Anyone can read record shelf cover files"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'record-shelf-covers');

drop policy if exists "Admins can upload record shelf cover files" on storage.objects;
create policy "Admins can upload record shelf cover files"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'record-shelf-covers' and public.is_admin());

drop policy if exists "Admins can update record shelf cover files" on storage.objects;
create policy "Admins can update record shelf cover files"
on storage.objects
for update
to authenticated
using (bucket_id = 'record-shelf-covers' and public.is_admin())
with check (bucket_id = 'record-shelf-covers' and public.is_admin());

drop policy if exists "Admins can delete record shelf cover files" on storage.objects;
create policy "Admins can delete record shelf cover files"
on storage.objects
for delete
to authenticated
using (bucket_id = 'record-shelf-covers' and public.is_admin());
