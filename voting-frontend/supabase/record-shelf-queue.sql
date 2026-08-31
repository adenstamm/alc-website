-- Durable five-slot record shelf with automatic FIFO updates and manual admin
-- ordering. Run after security-hardening.sql and before
-- event-voting-hardening.sql.

begin;

create table if not exists public.record_shelf_items (
  position smallint primary key check (position between 1 and 5),
  album_id text not null unique,
  album_title text not null,
  artist_name text not null,
  archived_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Serialize this installation/backfill with either live writer. Both the
-- manual-order RPC and archive trigger take this exact transaction-scoped
-- lock before reading or rebuilding the five positions.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('albumasu:record-shelf-queue', 0)
);

alter table public.record_shelf_items enable row level security;

drop policy if exists "Anyone can read record shelf items" on public.record_shelf_items;
create policy "Anyone can read record shelf items"
on public.record_shelf_items
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can manage record shelf items" on public.record_shelf_items;

revoke all privileges on table public.record_shelf_items from public, anon, authenticated;
grant select on table public.record_shelf_items to anon, authenticated;

-- Shelf writes are RPC/trigger-only. In particular, an authenticated admin
-- cannot bypass validation or race a full-shelf rebuild through PostgREST.
revoke insert, update, delete on table public.record_shelf_items
from public, anon, authenticated;

create or replace function public.save_record_shelf_order(shelf_items jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item_count integer;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED: Only admins can curate the record shelf.' using errcode = 'P0001';
  end if;

  if shelf_items is null or jsonb_typeof(shelf_items) <> 'array' then
    raise exception 'INVALID_SHELF: Shelf items must be an array.' using errcode = 'P0001';
  end if;

  item_count := jsonb_array_length(shelf_items);
  if item_count < 1 or item_count > 5 then
    raise exception 'INVALID_SHELF: The shelf must contain between one and five albums.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(shelf_items) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or nullif(btrim(item.value ->> 'album_id'), '') is null
      or nullif(btrim(item.value ->> 'album_title'), '') is null
  ) then
    raise exception 'INVALID_SHELF: Every shelf item needs an album id and title.' using errcode = 'P0001';
  end if;

  if (
    select count(distinct nullif(btrim(item.value ->> 'album_id'), ''))
    from jsonb_array_elements(shelf_items) as item(value)
  ) <> item_count then
    raise exception 'INVALID_SHELF: Each album can appear only once.' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('albumasu:record-shelf-queue', 0)
  );

  delete from public.record_shelf_items;

  insert into public.record_shelf_items (
    position,
    album_id,
    album_title,
    artist_name,
    archived_at,
    updated_by,
    updated_at
  )
  select
    item.ordinality::smallint,
    nullif(btrim(item.value ->> 'album_id'), ''),
    nullif(btrim(item.value ->> 'album_title'), ''),
    coalesce(nullif(btrim(item.value ->> 'artist_name'), ''), 'ALC archive'),
    now(),
    auth.uid(),
    now()
  from jsonb_array_elements(shelf_items) with ordinality as item(value, ordinality);
end;
$$;

create or replace function public.enqueue_archived_album_on_shelf()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing_items jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('albumasu:record-shelf-queue', 0)
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'album_id', album_id,
        'album_title', album_title,
        'artist_name', artist_name,
        'archived_at', archived_at,
        'updated_by', updated_by
      )
      order by position
    ),
    '[]'::jsonb
  )
  into existing_items
  from public.record_shelf_items
  where album_id <> new.poll_id;

  delete from public.record_shelf_items;

  insert into public.record_shelf_items (
    position,
    album_id,
    album_title,
    artist_name,
    archived_at,
    updated_at
  )
  values (
    1,
    new.poll_id,
    new.album_title,
    new.artist_name,
    new.archived_at,
    now()
  );

  insert into public.record_shelf_items (
    position,
    album_id,
    album_title,
    artist_name,
    archived_at,
    updated_by,
    updated_at
  )
  select
    (item.ordinality + 1)::smallint,
    item.value ->> 'album_id',
    item.value ->> 'album_title',
    item.value ->> 'artist_name',
    coalesce((item.value ->> 'archived_at')::timestamptz, now()),
    nullif(item.value ->> 'updated_by', '')::uuid,
    now()
  from jsonb_array_elements(existing_items) with ordinality as item(value, ordinality)
  where item.ordinality <= 4;

  return new;
end;
$$;

drop trigger if exists enqueue_album_archive_entry_on_shelf on public.album_archive_entries;
create trigger enqueue_album_archive_entry_on_shelf
after insert on public.album_archive_entries
for each row
execute function public.enqueue_archived_album_on_shelf();

insert into public.record_shelf_items (
  position,
  album_id,
  album_title,
  artist_name,
  archived_at
)
select
  row_number() over (order by archived_at desc)::smallint,
  poll_id,
  album_title,
  artist_name,
  archived_at
from (
  select poll_id, album_title, artist_name, archived_at
  from public.album_archive_entries
  order by archived_at desc
  limit 5
) recent
on conflict do nothing;

revoke execute on function public.save_record_shelf_order(jsonb)
from public, anon, authenticated;
revoke execute on function public.enqueue_archived_album_on_shelf()
from public, anon, authenticated;
grant execute on function public.save_record_shelf_order(jsonb) to authenticated;

commit;
