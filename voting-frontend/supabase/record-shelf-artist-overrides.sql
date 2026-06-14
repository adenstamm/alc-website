-- Allow admins to override shelf artist names without uploading a custom cover.
-- Safe to run even if record_shelf_covers has not been created yet.

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
using (bucket_id = 'record-shelf-covers');

drop policy if exists "Admins can upload record shelf cover files" on storage.objects;
create policy "Admins can upload record shelf cover files"
on storage.objects
for insert
with check (bucket_id = 'record-shelf-covers' and public.is_admin());

drop policy if exists "Admins can update record shelf cover files" on storage.objects;
create policy "Admins can update record shelf cover files"
on storage.objects
for update
using (bucket_id = 'record-shelf-covers' and public.is_admin())
with check (bucket_id = 'record-shelf-covers' and public.is_admin());

drop policy if exists "Admins can delete record shelf cover files" on storage.objects;
create policy "Admins can delete record shelf cover files"
on storage.objects
for delete
using (bucket_id = 'record-shelf-covers' and public.is_admin());
