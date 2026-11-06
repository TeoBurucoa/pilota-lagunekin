-- À exécuter une seule fois après add-group-events.sql.
-- Ajoute les paiements mensuels et par créneau.

alter table public.groups
  add column if not exists payment_mode text not null default 'none';
alter table public.groups
  add column if not exists session_price_cents integer not null default 0;
alter table public.groups
  drop constraint if exists groups_payment_mode_check;
alter table public.groups
  add constraint groups_payment_mode_check
  check (payment_mode in ('none', 'monthly', 'per_session'));
alter table public.groups
  drop constraint if exists groups_session_price_cents_check;
alter table public.groups
  add constraint groups_session_price_cents_check
  check (session_price_cents >= 0);

alter table public.sessions
  add column if not exists price_cents integer;
alter table public.sessions
  add column if not exists paid_by uuid references public.players(id)
    on delete set null;
alter table public.sessions
  drop constraint if exists sessions_price_cents_check;
alter table public.sessions
  add constraint sessions_price_cents_check
  check (price_cents >= 0);

alter table public.session_players
  add column if not exists share_paid boolean not null default false;
alter table public.session_guests
  add column if not exists share_paid boolean not null default false;

create table if not exists public.month_costs (
  group_id uuid not null references public.groups(id) on delete cascade,
  month date not null,
  amount_cents integer not null check (amount_cents >= 0),
  session_count integer,
  paid_by uuid references public.players(id) on delete set null,
  primary key (group_id, month),
  check (month = date_trunc('month', month)::date)
);

alter table public.month_costs
  add column if not exists session_count integer;
alter table public.month_costs
  add column if not exists paid_by uuid references public.players(id)
    on delete set null;
alter table public.month_costs
  drop constraint if exists month_costs_session_count_check;
alter table public.month_costs
  add constraint month_costs_session_count_check
  check (session_count >= 0);

create table if not exists public.monthly_payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  month date not null,
  amount_cents integer not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  check (month = date_trunc('month', month)::date)
);

create index if not exists monthly_payments_group_month_idx
  on public.monthly_payments (group_id, month);

alter table public.month_costs enable row level security;
alter table public.monthly_payments enable row level security;

drop policy if exists "Group can update session payments" on public.sessions;
create policy "Group can update session payments"
  on public.sessions for update to anon, authenticated
  using (group_id = request_group_id())
  with check (
    group_id = request_group_id()
    and (
      paid_by is null
      or exists (
        select 1
        from public.players
        where players.id = sessions.paid_by
          and players.group_id = request_group_id()
      )
    )
  );

drop policy if exists "Group can update session guests" on public.session_guests;
create policy "Group can update session guests"
  on public.session_guests for update to anon, authenticated
  using (
    exists (
      select 1
      from public.sessions
      where sessions.id = session_guests.session_id
        and sessions.group_id = request_group_id()
    )
  )
  with check (
    exists (
      select 1
      from public.sessions
      where sessions.id = session_guests.session_id
        and sessions.group_id = request_group_id()
    )
  );

drop policy if exists "Group can read month costs" on public.month_costs;
create policy "Group can read month costs"
  on public.month_costs for select to anon, authenticated
  using (group_id = request_group_id());

drop policy if exists "Admin can add month costs" on public.month_costs;
create policy "Admin can add month costs"
  on public.month_costs for insert to anon, authenticated
  with check (
    group_id = request_group_id()
    and request_is_admin()
    and (
      paid_by is null
      or exists (
        select 1
        from public.players
        where players.id = month_costs.paid_by
          and players.group_id = request_group_id()
      )
    )
  );

drop policy if exists "Admin can update month costs" on public.month_costs;
create policy "Admin can update month costs"
  on public.month_costs for update to anon, authenticated
  using (group_id = request_group_id() and request_is_admin())
  with check (
    group_id = request_group_id()
    and request_is_admin()
    and (
      paid_by is null
      or exists (
        select 1
        from public.players
        where players.id = month_costs.paid_by
          and players.group_id = request_group_id()
      )
    )
  );

drop policy if exists "Admin can remove month costs" on public.month_costs;
create policy "Admin can remove month costs"
  on public.month_costs for delete to anon, authenticated
  using (group_id = request_group_id() and request_is_admin());

drop policy if exists "Group can read monthly payments" on public.monthly_payments;
create policy "Group can read monthly payments"
  on public.monthly_payments for select to anon, authenticated
  using (group_id = request_group_id());

drop policy if exists "Group can add monthly payments" on public.monthly_payments;
create policy "Group can add monthly payments"
  on public.monthly_payments for insert to anon, authenticated
  with check (
    group_id = request_group_id()
    and exists (
      select 1
      from public.players
      where players.id = monthly_payments.player_id
        and players.group_id = request_group_id()
        and players.active
    )
  );

drop policy if exists "Admin can remove monthly payments" on public.monthly_payments;
create policy "Admin can remove monthly payments"
  on public.monthly_payments for delete to anon, authenticated
  using (group_id = request_group_id() and request_is_admin());

grant update (price_cents, paid_by) on public.sessions
  to anon, authenticated;
grant update (locked, share_paid) on public.session_players
  to anon, authenticated;
grant update (share_paid) on public.session_guests
  to anon, authenticated;

grant select, insert, update, delete on public.month_costs
  to anon, authenticated;
grant select, insert, delete on public.monthly_payments
  to anon, authenticated;
