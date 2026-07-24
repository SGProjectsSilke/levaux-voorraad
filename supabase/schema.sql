-- ===========================================================
-- Voorraadapp Levaux Bouw — databank in Supabase
-- -----------------------------------------------------------
-- Plak dit één keer in de SQL Editor van je Supabase-project
-- en klik op Run. Daarna vul je in config.js de Project URL
-- en de anon public key in.
--
-- Opzet:
--   teams     één team = één gedeelde voorraad
--   leden     wie hoort bij welk team (en onder welke naam)
--   voorraad  de volledige voorraad als JSON, één rij per team
--
-- De beveiliging zit in de regels onderaan (row level
-- security): je ziet enkel wat van jouw team is.
-- ===========================================================

create extension if not exists "pgcrypto";

-- ---------- tabellen ---------------------------------------

create table if not exists public.teams (
  id        uuid primary key default gen_random_uuid(),
  naam      text not null default 'Levaux Bouw',
  gemaakt   timestamptz not null default now()
);

create table if not exists public.leden (
  team       uuid not null references public.teams(id) on delete cascade,
  gebruiker  uuid not null references auth.users(id) on delete cascade,
  naam       text,
  gemaakt    timestamptz not null default now(),
  primary key (team, gebruiker)
);

create table if not exists public.voorraad (
  team       uuid primary key references public.teams(id) on delete cascade,
  data       jsonb not null,
  gewijzigd  timestamptz not null default now()
);

-- ---------- hulpfunctie ------------------------------------
-- Zit de aangemelde gebruiker in dit team?

create or replace function public.is_lid(t uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.leden
    where team = t and gebruiker = auth.uid()
  );
$$;

-- ---------- beveiliging ------------------------------------

alter table public.teams    enable row level security;
alter table public.leden    enable row level security;
alter table public.voorraad enable row level security;

-- teams: je ziet enkel je eigen team; iedereen die aangemeld
-- is mag er één aanmaken (dat gebeurt bij de eerste aanmelding)
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select to authenticated
  using (public.is_lid(id));

drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams
  for insert to authenticated
  with check (true);

-- leden: je ziet de leden van je eigen team, en je kan enkel
-- jezelf toevoegen (met de teamcode als "uitnodiging")
drop policy if exists leden_select on public.leden;
create policy leden_select on public.leden
  for select to authenticated
  using (public.is_lid(team));

drop policy if exists leden_insert on public.leden;
create policy leden_insert on public.leden
  for insert to authenticated
  with check (gebruiker = auth.uid());

drop policy if exists leden_delete on public.leden;
create policy leden_delete on public.leden
  for delete to authenticated
  using (gebruiker = auth.uid());

-- voorraad: lezen en schrijven enkel voor leden van het team
drop policy if exists voorraad_select on public.voorraad;
create policy voorraad_select on public.voorraad
  for select to authenticated
  using (public.is_lid(team));

drop policy if exists voorraad_insert on public.voorraad;
create policy voorraad_insert on public.voorraad
  for insert to authenticated
  with check (public.is_lid(team));

drop policy if exists voorraad_update on public.voorraad;
create policy voorraad_update on public.voorraad
  for update to authenticated
  using (public.is_lid(team))
  with check (public.is_lid(team));

-- ===========================================================
-- Daarna in Supabase:
--   1. Authentication → Providers → Email aanzetten
--   2. Authentication → Users → Add user: het adres van Cédric
--      (en later dat van elke medewerker)
--   3. Wil je geen bevestigingsmail, zet dan bij Add user
--      "Auto Confirm User" aan
-- ===========================================================
