create table if not exists public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  poll_id text not null,
  phase text not null check (phase in ('nominations', 'primary', 'final')),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_id text,
  album_title text,
  artist_name text,
  created_at timestamptz not null default now(),
  constraint votes_one_per_user_per_poll unique (poll_id, user_id),
  constraint votes_valid_payload check (
    (phase = 'nominations' and album_title is not null and artist_name is not null and candidate_id is null)
    or
    (phase in ('primary', 'final') and candidate_id is not null and album_title is null and artist_name is null)
  )
);

create index if not exists memberships_status_idx on public.memberships(status);
create index if not exists votes_poll_id_idx on public.votes(poll_id);
create index if not exists votes_user_id_idx on public.votes(user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists memberships_touch_updated_at on public.memberships;
create trigger memberships_touch_updated_at
before update on public.memberships
for each row execute function public.touch_updated_at();

create or replace function public.create_membership_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.memberships (user_id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (user_id) do update
    set email = excluded.email,
        display_name = coalesce(public.memberships.display_name, excluded.display_name);

  return new;
end;
$$;

drop trigger if exists create_membership_after_signup on auth.users;
create trigger create_membership_after_signup
after insert on auth.users
for each row execute function public.create_membership_for_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and status = 'approved'
      and role = 'admin'
  );
$$;

create or replace function public.is_approved_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and status = 'approved'
  );
$$;

alter table public.memberships enable row level security;
alter table public.votes enable row level security;

drop policy if exists "members can read own membership" on public.memberships;
create policy "members can read own membership"
on public.memberships
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "admins can update memberships" on public.memberships;
create policy "admins can update memberships"
on public.memberships
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "members can read own votes" on public.votes;
create policy "members can read own votes"
on public.votes
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "approved members can vote once" on public.votes;
create policy "approved members can vote once"
on public.votes
for insert
with check (
  auth.uid() = user_id
  and public.is_approved_member()
);

drop policy if exists "admins can delete votes" on public.votes;
create policy "admins can delete votes"
on public.votes
for delete
using (public.is_admin());
