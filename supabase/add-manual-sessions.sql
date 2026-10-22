-- À exécuter une seule fois après add-sport.sql.
-- Ajoute les créneaux manuels et réserve le recalcul à l'administrateur.

alter table public.sessions
  add column if not exists manual boolean not null default false;

alter table public.sessions
  add column if not exists starts_at time;

create or replace function public.create_manual_session(
  p_played_on date,
  p_starts_at time
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_session_id uuid;
begin
  v_group_id := request_group_id();
  if v_group_id is null then
    raise exception 'Lien de groupe invalide.';
  end if;

  if p_played_on is null or p_starts_at is null then
    raise exception 'Indiquez le jour et l''horaire.';
  end if;

  if p_played_on < current_date then
    raise exception 'Le créneau doit être aujourd''hui ou plus tard.';
  end if;

  if exists (
    select 1 from sessions
    where group_id = v_group_id and played_on = p_played_on
  ) then
    raise exception 'Un créneau existe déjà ce jour-là.';
  end if;

  insert into sessions (group_id, played_on, manual, starts_at)
  values (v_group_id, p_played_on, true, p_starts_at)
  returning id into v_session_id;

  return v_session_id;
end;
$$;

revoke all on function public.create_manual_session(date, time) from public;
grant execute on function public.create_manual_session(date, time)
  to anon, authenticated;

create or replace function public.delete_manual_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  v_group_id := request_group_id();
  if v_group_id is null then
    raise exception 'Lien de groupe invalide.';
  end if;

  if not exists (
    select 1 from sessions
    where id = p_session_id
      and group_id = v_group_id
      and manual
  ) then
    raise exception 'Ce créneau ne peut pas être retiré.';
  end if;

  delete from sessions where id = p_session_id;
end;
$$;

revoke all on function public.delete_manual_session(uuid) from public;
grant execute on function public.delete_manual_session(uuid)
  to anon, authenticated;

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
  v_frequency_weeks integer;
  v_interval_days integer;
  v_anchor_date date;
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

  if not request_is_admin() then
    raise exception 'Seul un administrateur peut recalculer le planning.';
  end if;

  if p_weeks < 1 or p_weeks > 52 then
    raise exception 'Le nombre de créneaux doit être compris entre 1 et 52.';
  end if;

  if (
    select count(*) from players
    where active and group_id = v_group_id
  ) < 4 then
    raise exception 'Il faut au moins quatre joueurs actifs.';
  end if;

  select meeting_day, meeting_time, frequency_weeks, created_at::date
    into v_meeting_day, v_meeting_time, v_frequency_weeks, v_anchor_date
  from groups where id = v_group_id;
  v_interval_days := 7 * v_frequency_weeks;
  v_anchor_date :=
    v_anchor_date
    + ((v_meeting_day - extract(dow from v_anchor_date)::integer + 7) % 7);
  v_first_date := v_anchor_date + (
    (
      greatest(0, current_date - v_anchor_date)
      + v_interval_days - 1
    ) / v_interval_days
  ) * v_interval_days;
  if v_first_date = current_date and localtime >= v_meeting_time then
    v_first_date := v_first_date + v_interval_days;
  end if;

  if p_rebuild then
    delete from sessions old_session
    where old_session.group_id = v_group_id
      and old_session.played_on >= current_date
      and old_session.manual = false
      and (
        extract(dow from old_session.played_on)::integer <> v_meeting_day
        or mod(old_session.played_on - v_anchor_date, v_interval_days) <> 0
      )
      and not exists (
        select 1 from session_players kept
        where kept.session_id = old_session.id and kept.locked
      );

    delete from session_players
    where session_id in (
      select id from sessions
      where group_id = v_group_id
        and played_on >= v_first_date
        and manual = false
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
    v_date := v_first_date + (v_week * v_interval_days);

    insert into sessions (group_id, played_on)
    values (v_group_id, v_date)
    on conflict (group_id, played_on) do update
      set played_on = excluded.played_on
    returning id into v_session_id;

    if exists (
      select 1 from sessions where id = v_session_id and manual
    ) then
      continue;
    end if;

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
