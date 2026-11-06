-- À exécuter une seule fois après add-football-and-on-demand.sql.
-- Ajoute des événements hors sport et le suivi des présences.

create table if not exists public.group_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 60),
  starts_on date not null,
  starts_at time not null,
  created_at timestamptz not null default now()
);

create table if not exists public.event_attendance (
  event_id uuid not null references public.group_events(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'present' check (status in ('present', 'absent')),
  created_at timestamptz not null default now(),
  primary key (event_id, player_id)
);

alter table public.event_attendance
  add column if not exists status text not null default 'present';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_attendance_status_check'
  ) then
    alter table public.event_attendance
      add constraint event_attendance_status_check
      check (status in ('present', 'absent'));
  end if;
end $$;

alter table public.group_events enable row level security;
alter table public.event_attendance enable row level security;

drop policy if exists "Group can read its events" on public.group_events;
create policy "Group can read its events"
  on public.group_events for select to anon, authenticated
  using (group_id = request_group_id());

drop policy if exists "Admin can add group events" on public.group_events;
create policy "Admin can add group events"
  on public.group_events for insert to anon, authenticated
  with check (group_id = request_group_id() and request_is_admin());

drop policy if exists "Admin can update group events" on public.group_events;
create policy "Admin can update group events"
  on public.group_events for update to anon, authenticated
  using (group_id = request_group_id() and request_is_admin())
  with check (group_id = request_group_id() and request_is_admin());

drop policy if exists "Admin can remove group events" on public.group_events;
create policy "Admin can remove group events"
  on public.group_events for delete to anon, authenticated
  using (group_id = request_group_id() and request_is_admin());

drop policy if exists "Group can read event attendance" on public.event_attendance;
create policy "Group can read event attendance"
  on public.event_attendance for select to anon, authenticated
  using (
    exists (
      select 1
      from public.group_events
      where group_events.id = event_attendance.event_id
        and group_events.group_id = request_group_id()
    )
  );

drop policy if exists "Group can add event attendance" on public.event_attendance;
create policy "Group can add event attendance"
  on public.event_attendance for insert to anon, authenticated
  with check (
    exists (
      select 1
      from public.group_events
      where group_events.id = event_attendance.event_id
        and group_events.group_id = request_group_id()
    )
    and exists (
      select 1
      from public.players
      where players.id = event_attendance.player_id
        and players.group_id = request_group_id()
        and players.active
    )
  );

drop policy if exists "Group can update event attendance" on public.event_attendance;
create policy "Group can update event attendance"
  on public.event_attendance for update to anon, authenticated
  using (
    exists (
      select 1
      from public.group_events
      where group_events.id = event_attendance.event_id
        and group_events.group_id = request_group_id()
    )
    and exists (
      select 1
      from public.players
      where players.id = event_attendance.player_id
        and players.group_id = request_group_id()
    )
  )
  with check (
    status in ('present', 'absent')
    and exists (
      select 1
      from public.group_events
      where group_events.id = event_attendance.event_id
        and group_events.group_id = request_group_id()
    )
    and exists (
      select 1
      from public.players
      where players.id = event_attendance.player_id
        and players.group_id = request_group_id()
        and players.active
    )
  );

drop policy if exists "Group can remove event attendance" on public.event_attendance;
create policy "Group can remove event attendance"
  on public.event_attendance for delete to anon, authenticated
  using (
    exists (
      select 1
      from public.group_events
      where group_events.id = event_attendance.event_id
        and group_events.group_id = request_group_id()
    )
    and exists (
      select 1
      from public.players
      where players.id = event_attendance.player_id
        and players.group_id = request_group_id()
    )
  );

grant select, insert, update, delete on public.group_events
  to anon, authenticated;
grant select, insert, update, delete on public.event_attendance
  to anon, authenticated;
