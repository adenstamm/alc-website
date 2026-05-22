-- Backend nomination validation for Album Listening Club.
-- Run this in the Supabase SQL editor after the base schema.

create or replace function public.clean_music_text(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(trim(coalesce(value, '')), '[[:space:]]+', ' ', 'g'), '');
$$;

create or replace function public.normalize_music_name(value text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        lower(coalesce(public.clean_music_text(value), '')),
        '[[:punct:]¡¿‘’“”«»]+',
        ' ',
        'g'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
$$;

create table if not exists public.banned_albums (
  name text primary key,
  normalized_name text generated always as (public.normalize_music_name(name)) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.banned_artists (
  name text primary key,
  normalized_name text generated always as (public.normalize_music_name(name)) stored,
  created_at timestamptz not null default now()
);

create unique index if not exists banned_albums_normalized_name_idx
on public.banned_albums(normalized_name);

create unique index if not exists banned_artists_normalized_name_idx
on public.banned_artists(normalized_name);

insert into public.banned_albums (name)
values
  ('The Glow Pt. 2'),
  ('Remain in Light'),
  ('Paul''s Boutique'),
  ('Life Metal'),
  ('Music Has the Right to Children'),
  ('Hounds of Love'),
  ('Songs for the deaf'),
  ('Illinois'),
  ('Dirty Computer'),
  ('The Fragile'),
  ('Southeastern'),
  ('Veni Vidi Vicious'),
  ('Tyrannosaurus Hives'),
  ('Spirit They''re Gone, Spirit They''ve Vanished'),
  ('Replica'),
  ('Dog Problems'),
  ('I''ll Try Living Like This'),
  ('Ágætis byrjun'),
  ('Mingus Ah Um'),
  ('To Bring You My Love'),
  ('Yhä hämärää'),
  ('Ride the Lightning'),
  ('Wildlife'),
  ('Blowout Comb'),
  ('Ghost City'),
  ('Penthouse and Pavement'),
  ('Yoshimi Battles the Pink Robots'),
  ('Deathconsciousness'),
  ('Ascension'),
  ('Dead Cities, Red Seas & Lost Ghosts'),
  ('Volume One'),
  ('Interstellar'),
  ('Stankonia'),
  ('Ultraviolence'),
  ('Richard D. James Album'),
  ('eureka'),
  ('Red Burns'),
  ('Atrocity Exhibition'),
  ('You Will Never Know Why'),
  ('新しい日の誕生'),
  ('Murder Ballads'),
  ('A Deeper Understanding'),
  ('Casualties of Cool'),
  ('Lupe Fiasco''s Food and Liquor'),
  ('Songs from the Big Chair'),
  ('Vulnicura'),
  ('(What''s the Story) Morning Glory?'),
  ('Laughing Stock'),
  ('The Powers That B'),
  ('For You'),
  ('Untrue'),
  ('A Laughing Death in Meatspace'),
  ('Scenery'),
  ('MM...FOOD'),
  ('Teen Dream'),
  ('22, A Million'),
  ('Frances the Mute'),
  ('Tales of the Inexpressible'),
  ('Modal Soul'),
  ('Purple Rain'),
  ('WLFGRL'),
  ('Hiss Spun'),
  ('Funkentelechy Vs. The Placebo Syndrome'),
  ('FxG3000'),
  ('Minor Threat'),
  ('Supa Dupa Fly'),
  ('fishmonger'),
  ('Meadow Platinum, Vol. 3'),
  ('The Rise and Fall of Ziggy Stardust and the Spiders from Mars'),
  ('Charmed'),
  ('My Teenage Dream Ended'),
  ('Deltron 3030'),
  ('Warrior'),
  ('Lei Line Eon'),
  ('The Holy Bible'),
  ('Magnolia Electric Co.'),
  ('Rites of Spring'),
  ('Traumnovelle'),
  ('Viva la Vida or Death and All His Friends'),
  ('Discovery'),
  ('Infest the Rats'' Nest'),
  ('Songs In The Key Of Life'),
  ('Sunbather'),
  ('Donuts'),
  ('Time ''n'' Place'),
  ('Oil of Every Pearl''s Un-Insides'),
  ('Disintegration'),
  ('Dead Man''s Party'),
  ('Silent Hill 2 Soundtrack'),
  ('Rhapsody in Blue and an American in Paris'),
  ('The Miseducation of Lauryn Hill'),
  ('DOOPEE TIME'),
  ('A Charlie Brown Christmas'),
  ('Big Band Bossa Nova'),
  ('Miss Saigon: The Definitive Live Recording'),
  ('Cherry Bomb'),
  ('Blackout'),
  ('Dummy'),
  ('Aja'),
  ('Jet Set Radio Future SEGA Original Tracks'),
  ('Ultraviolence'),
  ('Vroom Vroom'),
  ('EP'),
  ('Midnight Marauders'),
  ('Violator'),
  ('Vespertine'),
  ('あらためましてはじめましてミドリです'),
  ('Max & Match'),
  ('When the Pawn..'),
  ('Blue'),
  ('Green'),
  ('Music for 18 Musicians'),
  ('Slayyyter'),
  ('Electric Ladyland'),
  ('Rodeo'),
  ('Knife Man'),
  ('ATLiens'),
  ('Tragic Kingdom'),
  ('Giratinightcore: Emerald'),
  ('Around the Fur'),
  ('Drunk'),
  ('Love Deluxe'),
  ('Amor Prohibido'),
  ('good kid, m.A.A.d city'),
  ('Heaven or Las Vegas'),
  ('Jane Doe'),
  ('Visions of Bodies Being Burned'),
  ('Magdalene'),
  ('Twilight'),
  ('Preacher''s Daughter'),
  ('Utakata no Hibi'),
  ('Ella Wishes You a Swinging Christmas'),
  ('Neon Genesis Evangelion'),
  ('Madvillainy'),
  ('The Fame Monster'),
  ('drukQs'),
  ('The Downward Spiral'),
  ('The Velvet Rope'),
  ('Perfect Velvet'),
  ('Let''s Get It On'),
  ('The Money Store'),
  ('Demon Days'),
  ('Desire, I Want To Turn Into You'),
  ('Live Through This'),
  ('Soundtracks For the Blind'),
  ('Slow Riot for New Zero Kanada'),
  ('Midnight Guest'),
  ('SINNER GET READY'),
  ('Pop 2'),
  ('Frailty'),
  ('Formula of Love: O+T=<3'),
  ('~Complete Best~'),
  ('Long Season'),
  ('Come Away With Me'),
  ('Jagged Little Pill'),
  ('Stories From The City, Stories From The Sea'),
  ('Songs For You'),
  ('Pink Friday'),
  ('Born To Die'),
  ('Minecraft'),
  ('Nevermind'),
  ('Twin Fantasy'),
  ('Horseshit on Route 66'),
  ('Windswept Adan'),
  ('By The Time I Get To Phoenix'),
  ('To Pimp A Buttetfly'),
  ('Jubilee'),
  ('Homosexual'),
  ('White Pony'),
  ('Pornography'),
  ('Grace'),
  ('Soul Lady'),
  ('At Folsom Prison'),
  ('1991'),
  ('NewJeans 2nd EP ''Get Up'''),
  ('Igor'),
  ('Blonde'),
  ('how I''m feeling now'),
  ('Loveless'),
  ('D>E>A>T>H>M>E>T>A>L'),
  ('Hounds Of Love'),
  ('Pink Tape - The 2nd Album'),
  ('Cupid Deluxe'),
  ('LIVE.LOVE.ASAP'),
  ('The Queen Is Dead'),
  ('Slut Pop'),
  ('KiCk i'),
  ('Is This It'),
  ('Ooh Rap I Ya'),
  ('Repeater + 3 Songs'),
  ('Mezzanine'),
  ('You''re Dead!'),
  ('The RIse And Fall Of A Midwest Princess'),
  ('Camp'),
  ('OK Computer'),
  ('Submarine'),
  ('Ctrl'),
  ('The Low End Theory'),
  ('SOPHIE'),
  ('SATURATION II'),
  ('the record'),
  ('98.12.28 Otokotachino Wakare (Live)'),
  ('Jar of Flies'),
  ('Justice'),
  ('Four-Calendar Café'),
  ('Masterpiece'),
  ('Imaginal Disk'),
  ('Titanic Rising'),
  ('Alligator Bites Never Heal'),
  ('Brand New Eyes'),
  ('Back To Black'),
  ('This Is Happening'),
  ('ランプ幻想'),
  ('CHERRY BOMB'),
  ('Arkhaiomelisidonophunikheratos'),
  ('1999'),
  ('Elliott Smith'),
  ('Bloom'),
  ('Everything Goes Numb'),
  ('Ceres & Calypso in the Deep Time'),
  ('Charm'),
  ('Earl Sweatshirt'),
  ('SISTER'),
  ('I Love You Jennifer B'),
  ('Fancy That'),
  ('Seychelles'),
  ('Crystal Castles'),
  ('Le Tigre'),
  ('MOTOMAMI'),
  ('Michigan'),
  ('Forever Howlong'),
  ('Melodrama'),
  ('Stardust'),
  ('I Love My Computer'),
  ('Voodoo'),
  ('Take Me Apart'),
  ('Re'),
  ('Big Fish Theory'),
  ('U'),
  ('Moving Picture'),
  ('Symphony In Green'),
  ('Baltimore'),
  ('Flying Beagle')
on conflict do nothing;

insert into public.banned_artists (name)
values
  ('Deftones'),
  ('Kendrick Lamar'),
  ('Lana Del Rey'),
  ('Björk'),
  ('The Cure'),
  ('Death Grips'),
  ('Aphex Twin'),
  ('MF Doom'),
  ('Outkast'),
  ('Tyler The Creator'),
  ('Charli XCX'),
  ('A Tribe Called Quest'),
  ('Childish Gambino'),
  ('SOPHIE'),
  ('Cocteau Twins'),
  ('Sufjan Stevens'),
  ('Danny Brown')
on conflict do nothing;

alter table public.banned_albums enable row level security;
alter table public.banned_artists enable row level security;

drop policy if exists "anyone can read banned albums" on public.banned_albums;
create policy "anyone can read banned albums"
on public.banned_albums
for select
using (true);

drop policy if exists "anyone can read banned artists" on public.banned_artists;
create policy "anyone can read banned artists"
on public.banned_artists
for select
using (true);

drop policy if exists "admins can manage banned albums" on public.banned_albums;
create policy "admins can manage banned albums"
on public.banned_albums
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage banned artists" on public.banned_artists;
create policy "admins can manage banned artists"
on public.banned_artists
for all
using (public.is_admin())
with check (public.is_admin());

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'votes'
      and constraint_name = 'votes_one_per_user_per_poll'
  ) then
    alter table public.votes drop constraint votes_one_per_user_per_poll;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'votes'
      and constraint_name = 'votes_one_per_user_per_poll_phase'
  ) then
    alter table public.votes
      add constraint votes_one_per_user_per_poll_phase unique (poll_id, phase, user_id);
  end if;
end;
$$;

create or replace function public.validate_nomination_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_album text;
  clean_artist text;
begin
  if new.phase <> 'nominations' then
    return new;
  end if;

  clean_album := public.clean_music_text(new.album_title);
  clean_artist := public.clean_music_text(new.artist_name);

  if clean_album is null or clean_artist is null then
    raise exception 'NOMINATION_REQUIRED: Add both an album title and artist before submitting.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.banned_artists
    where normalized_name = public.normalize_music_name(clean_artist)
  ) then
    raise exception 'BANNED_ARTIST: % is on the banned artist list.', clean_artist
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.banned_albums
    where normalized_name = public.normalize_music_name(clean_album)
  ) then
    raise exception 'BANNED_ALBUM: % has already been used by the club.', clean_album
      using errcode = 'P0001';
  end if;

  new.album_title := clean_album;
  new.artist_name := clean_artist;

  return new;
end;
$$;

drop trigger if exists votes_validate_nomination on public.votes;
create trigger votes_validate_nomination
before insert or update of album_title, artist_name, phase
on public.votes
for each row execute function public.validate_nomination_vote();
