-- À exécuter après schema.sql, sur une base neuve ou existante.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  access_token uuid not null unique default gen_random_uuid(),
  slug text not null unique,
  name text not null check (char_length(trim(name)) between 1 and 60),
  meeting_day smallint not null default 4 check (meeting_day between 0 and 6),
  meeting_time time not null default '18:00',
  hero_message text not null default 'Osteguna, Pilota eguna!'
    check (char_length(trim(hero_message)) between 1 and 100),
  created_at timestamptz not null default now()
);

alter table public.players add column if not exists group_id uuid
  references public.groups(id) on delete cascade;
alter table public.sessions add column if not exists group_id uuid
  references public.groups(id) on delete cascade;

-- Conserve les éventuelles données de la première version dans un groupe.
do $$
declare
  legacy_group_id uuid;
begin
  if (
    exists (select 1 from players)
    or exists (select 1 from sessions)
  ) and not exists (select 1 from groups) then
    insert into groups (slug, name, meeting_day, meeting_time, hero_message)
    values (
      'pilota-lagunekin-' || substr(gen_random_uuid()::text, 1, 6),
      'Pilota Lagunekin',
      4,
      '18:00',
      'Osteguna, Pilota eguna!'
    )
    returning id into legacy_group_id;

    update players set group_id = legacy_group_id where group_id is null;
    update sessions set group_id = legacy_group_id where group_id is null;
  end if;
end;
$$;

alter table public.players alter column group_id set not null;
alter table public.sessions alter column group_id set not null;

drop index if exists public.players_active_name_unique;
create unique index players_group_active_name_unique
  on public.players (group_id, lower(name))
  where active = true;

alter table public.sessions drop constraint if exists sessions_played_on_key;
alter table public.sessions
  add constraint sessions_group_date_unique unique (group_id, played_on);

alter table public.groups enable row level security;

create or replace function public.request_group_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from groups
  where access_token::text = (
    coalesce(current_setting('request.headers', true), '{}')::jsonb
      ->> 'x-group-token'
  )
  limit 1;
$$;

revoke all on function public.request_group_id() from public;
grant execute on function public.request_group_id() to anon, authenticated;

drop policy if exists "Groups can be created" on public.groups;
drop policy if exists "Token can read its group" on public.groups;
drop policy if exists "Token can update its group" on public.groups;
create policy "Groups can be created"
  on public.groups for insert to anon, authenticated
  with check (
    access_token::text = (
      coalesce(current_setting('request.headers', true), '{}')::jsonb
        ->> 'x-group-token'
    )
  );
create policy "Token can read its group"
  on public.groups for select to anon, authenticated
  using (id = request_group_id());
create policy "Token can update its group"
  on public.groups for update to anon, authenticated
  using (id = request_group_id())
  with check (
    id = request_group_id()
    and access_token::text = (
      coalesce(current_setting('request.headers', true), '{}')::jsonb
        ->> 'x-group-token'
    )
  );

drop policy if exists "Public can read players" on public.players;
drop policy if exists "Public can add players" on public.players;
drop policy if exists "Public can update players" on public.players;
create policy "Group can read players"
  on public.players for select to anon, authenticated
  using (group_id = request_group_id());
create policy "Group can add players"
  on public.players for insert to anon, authenticated
  with check (group_id = request_group_id());
create policy "Group can update players"
  on public.players for update to anon, authenticated
  using (group_id = request_group_id())
  with check (group_id = request_group_id());

drop policy if exists "Public can read sessions" on public.sessions;
create policy "Group can read sessions"
  on public.sessions for select to anon, authenticated
  using (group_id = request_group_id());

drop policy if exists "Public can read session players"
  on public.session_players;
drop policy if exists "Public can add session players"
  on public.session_players;
drop policy if exists "Public can remove session players"
  on public.session_players;
create policy "Group can read session players"
  on public.session_players for select to anon, authenticated
  using (
    exists (
      select 1 from sessions
      where id = session_id and group_id = request_group_id()
    )
  );
create policy "Group can add session players"
  on public.session_players for insert to anon, authenticated
  with check (
    exists (
      select 1 from sessions
      where id = session_id and group_id = request_group_id()
    )
    and exists (
      select 1 from players
      where id = player_id and group_id = request_group_id()
    )
  );
create policy "Group can remove session players"
  on public.session_players for delete to anon, authenticated
  using (
    exists (
      select 1 from sessions
      where id = session_id and group_id = request_group_id()
    )
  );

drop policy if exists "Public can read availability"
  on public.session_availability;
drop policy if exists "Public can add availability"
  on public.session_availability;
drop policy if exists "Public can remove availability"
  on public.session_availability;
create policy "Group can read availability"
  on public.session_availability for select to anon, authenticated
  using (
    exists (
      select 1 from sessions
      where id = session_id and group_id = request_group_id()
    )
  );
create policy "Group can add availability"
  on public.session_availability for insert to anon, authenticated
  with check (
    exists (
      select 1 from sessions
      where id = session_id and group_id = request_group_id()
    )
    and exists (
      select 1 from players
      where id = player_id and group_id = request_group_id()
    )
  );
create policy "Group can remove availability"
  on public.session_availability for delete to anon, authenticated
  using (
    exists (
      select 1 from sessions
      where id = session_id and group_id = request_group_id()
    )
  );

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
  v_group_id uuid;
  v_meeting_day integer;
  v_meeting_time time;
  v_first_date date;
  v_date date;
  v_session_id uuid;
  v_week integer;
begin
  v_group_id := request_group_id();
  if v_group_id is null then
    raise exception 'Lien de groupe invalide.';
  end if;

  if p_weeks < 1 or p_weeks > 52 then
    raise exception 'Le nombre de semaines doit être compris entre 1 et 52.';
  end if;

  if (
    select count(*) from players
    where active and group_id = v_group_id
  ) < 4 then
    raise exception 'Il faut au moins quatre joueurs actifs.';
  end if;

  select meeting_day, meeting_time into v_meeting_day, v_meeting_time
  from groups where id = v_group_id;
  v_first_date :=
    current_date
    + ((v_meeting_day - extract(dow from current_date)::integer + 7) % 7);
  if v_first_date = current_date and localtime >= v_meeting_time then
    v_first_date := v_first_date + 7;
  end if;

  if p_rebuild then
    delete from sessions
    where group_id = v_group_id
      and played_on >= current_date
      and extract(dow from played_on)::integer <> v_meeting_day;

    delete from session_players
    where session_id in (
      select id from sessions
      where group_id = v_group_id and played_on >= v_first_date
    );
  end if;

  for v_week in 0..(p_weeks - 1) loop
    v_date := v_first_date + (v_week * 7);

    insert into sessions (group_id, played_on)
    values (v_group_id, v_date)
    on conflict (group_id, played_on) do update
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
        left join sessions s
          on s.id = sp.session_id and s.group_id = v_group_id
        where p.active and p.group_id = v_group_id
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

-- Si des données anciennes ont été migrées, cette ligne donne le lien privé.
select
  name,
  '/?group=' || id || '&key=' || access_token as private_path
from public.groups
order by created_at;
