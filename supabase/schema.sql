create extension if not exists "pgcrypto";

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists players_active_name_unique
  on public.players (lower(name))
  where active = true;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  played_on date not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.session_players (
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  locked boolean not null default false,
  primary key (session_id, player_id)
);

create table if not exists public.session_availability (
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, player_id)
);

create or replace function public.limit_session_to_four_players()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    select count(*) from session_players
    where session_id = new.session_id
  ) >= 4 then
    raise exception 'Cette partie compte déjà quatre joueurs.';
  end if;
  return new;
end;
$$;

create trigger enforce_four_players_per_session
  before insert on public.session_players
  for each row execute function public.limit_session_to_four_players();

alter table public.players enable row level security;
alter table public.sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.session_availability enable row level security;

create policy "Public can read players"
  on public.players for select
  to anon, authenticated
  using (true);

create policy "Public can add players"
  on public.players for insert
  to anon, authenticated
  with check (true);

create policy "Public can update players"
  on public.players for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "Public can read sessions"
  on public.sessions for select
  to anon, authenticated
  using (true);

create policy "Public can read session players"
  on public.session_players for select
  to anon, authenticated
  using (true);

create policy "Public can add session players"
  on public.session_players for insert
  to anon, authenticated
  with check (true);

create policy "Public can remove session players"
  on public.session_players for delete
  to anon, authenticated
  using (true);

create policy "Public can read availability"
  on public.session_availability for select
  to anon, authenticated
  using (true);

create policy "Public can add availability"
  on public.session_availability for insert
  to anon, authenticated
  with check (true);

create policy "Public can remove availability"
  on public.session_availability for delete
  to anon, authenticated
  using (true);

create or replace function public.generate_pelote_sessions(
  p_weeks integer default 12,
  p_rebuild boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_thursday date;
  v_date date;
  v_session_id uuid;
  v_week integer;
begin
  if p_weeks < 1 or p_weeks > 52 then
    raise exception 'Le nombre de semaines doit être compris entre 1 et 52.';
  end if;

  if (select count(*) from players where active) < 4 then
    raise exception 'Il faut au moins quatre joueurs actifs.';
  end if;

  v_first_thursday :=
    current_date + ((4 - extract(dow from current_date)::integer + 7) % 7);

  if p_rebuild then
    delete from session_players
    where session_id in (
      select id from sessions where played_on >= v_first_thursday
    );
  end if;

  for v_week in 0..(p_weeks - 1) loop
    v_date := v_first_thursday + (v_week * 7);
    v_session_id := null;

    insert into sessions (played_on)
    values (v_date)
    on conflict (played_on) do update
      set played_on = excluded.played_on
    returning id into v_session_id;

    if not exists (
      select 1 from session_players where session_id = v_session_id
    ) then
      insert into session_players (session_id, player_id)
      select v_session_id, ranked.id
      from (
        select
          p.id,
          count(sp.session_id) as game_count,
          max(s.played_on) as last_game,
          p.created_at
        from players p
        left join session_players sp on sp.player_id = p.id
        left join sessions s on s.id = sp.session_id
        where p.active = true
        group by p.id, p.created_at
        order by
          game_count asc,
          last_game asc nulls first,
          p.created_at asc,
          p.id asc
        limit 4
      ) ranked;
    end if;
  end loop;
end;
$$;

grant execute on function public.generate_pelote_sessions(integer, boolean)
  to anon, authenticated;
