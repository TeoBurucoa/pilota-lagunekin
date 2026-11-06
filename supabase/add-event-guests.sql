-- À exécuter une seule fois après add-history.sql.
-- Ajoute à un événement des personnes qui ne rejoignent pas la rotation.

create table if not exists public.event_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.group_events(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  status text check (status in ('present', 'absent')),
  created_at timestamptz not null default now()
);

create unique index if not exists event_guests_name_unique
  on public.event_guests (event_id, lower(trim(name)));

alter table public.event_guests enable row level security;

drop policy if exists "Group can read event guests" on public.event_guests;
create policy "Group can read event guests"
  on public.event_guests for select to anon, authenticated
  using (
    exists (
      select 1
      from public.group_events
      where group_events.id = event_guests.event_id
        and group_events.group_id = request_group_id()
    )
  );

drop policy if exists "Admin can add event guests" on public.event_guests;
create policy "Admin can add event guests"
  on public.event_guests for insert to anon, authenticated
  with check (
    request_is_admin()
    and exists (
      select 1
      from public.group_events
      where group_events.id = event_guests.event_id
        and group_events.group_id = request_group_id()
    )
  );

drop policy if exists "Group can update event guests" on public.event_guests;
create policy "Group can update event guests"
  on public.event_guests for update to anon, authenticated
  using (
    exists (
      select 1
      from public.group_events
      where group_events.id = event_guests.event_id
        and group_events.group_id = request_group_id()
    )
  )
  with check (
    exists (
      select 1
      from public.group_events
      where group_events.id = event_guests.event_id
        and group_events.group_id = request_group_id()
    )
  );

drop policy if exists "Admin can remove event guests" on public.event_guests;
create policy "Admin can remove event guests"
  on public.event_guests for delete to anon, authenticated
  using (
    request_is_admin()
    and exists (
      select 1
      from public.group_events
      where group_events.id = event_guests.event_id
        and group_events.group_id = request_group_id()
    )
  );

grant select, insert, update, delete on public.event_guests
  to anon, authenticated;
