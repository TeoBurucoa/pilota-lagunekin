-- À exécuter une seule fois sur une base déjà migrée vers les groupes.
-- Ajoute le verrouillage sans modifier les joueurs ni les parties existantes.

alter table public.session_players
  add column if not exists locked boolean not null default false;

drop policy if exists "Group can lock session players"
  on public.session_players;
create policy "Group can lock session players"
  on public.session_players for update to anon, authenticated
  using (
    exists (
      select 1 from sessions
      where id = session_id and group_id = request_group_id()
    )
  )
  with check (
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
  v_open_slots integer;
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
    )
    and (
      locked = false
      or player_id not in (
        select id from players
        where active and group_id = v_group_id
      )
    );
  end if;

  for v_week in 0..(p_weeks - 1) loop
    v_date := v_first_date + (v_week * 7);

    insert into sessions (group_id, played_on)
    values (v_group_id, v_date)
    on conflict (group_id, played_on) do update
      set played_on = excluded.played_on
    returning id into v_session_id;

    select 4 - count(*) into v_open_slots
    from session_players
    where session_id = v_session_id;

    if v_open_slots > 0 then
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
        where p.active
          and p.group_id = v_group_id
          and not exists (
            select 1 from session_players existing
            where existing.session_id = v_session_id
              and existing.player_id = p.id
          )
        group by p.id, p.created_at
        order by
          game_count asc,
          last_game asc nulls first,
          p.created_at asc,
          p.id asc
        limit v_open_slots
      ) ranked;
    end if;
  end loop;
end;
$$;

grant execute on function public.generate_pelote_sessions(integer, boolean)
  to anon, authenticated;
