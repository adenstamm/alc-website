-- Admin-editable home album and event content.
-- Run after schema.sql and three-phase-voting.sql.

create table if not exists public.site_events (
  id text primary key,
  title text not null,
  date date not null,
  display_date text not null,
  time text not null,
  location text not null,
  status text not null default 'upcoming' check (status in ('upcoming', 'recent')),
  tag text not null default 'Club night',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists site_events_touch_updated_at on public.site_events;
create trigger site_events_touch_updated_at
before update on public.site_events
for each row execute function public.touch_updated_at();

alter table public.site_events enable row level security;

drop policy if exists "anyone can read site events" on public.site_events;
create policy "anyone can read site events"
on public.site_events
for select
using (true);

drop policy if exists "admins can manage site events" on public.site_events;
create policy "admins can manage site events"
on public.site_events
for all
using (public.is_admin())
with check (public.is_admin());

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

grant select on table public.site_events to anon, authenticated;
grant insert, update, delete on table public.site_events to authenticated;
grant execute on function public.update_current_album(text, text, text, text) to authenticated;

insert into public.site_events (
  id,
  title,
  date,
  display_date,
  time,
  location,
  status,
  tag,
  description
)
values
  (
    'record-store-run',
    'Record store run',
    '2026-06-06',
    'June 6, 2026',
    '2:00 PM',
    'Zia Records Tempe',
    'upcoming',
    'Hangout',
    'A low-pressure crate-digging trip for anyone who wants to browse, recommend finds, and grab coffee after.'
  ),
  (
    'summer-listening-night',
    'Summer listening night',
    '2026-06-18',
    'June 18, 2026',
    '7:15 PM',
    'Hayden Library C8',
    'upcoming',
    'Club night',
    'A relaxed group listen with snacks, favorite summer tracks, and a quick vote on the next theme.'
  ),
  (
    'spring-wrap-party',
    'Spring wrap party',
    '2026-05-01',
    'May 1, 2026',
    '7:00 PM',
    'Hayden Library C8',
    'recent',
    'Recent',
    'Members brought favorite tracks from the semester and traded recommendations before finals week.'
  )
on conflict (id) do nothing;
