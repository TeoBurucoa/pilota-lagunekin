-- À exécuter une seule fois après add-payments.sql.
-- Ajoute la composition des équipes et le résultat des parties passées.

alter table public.sessions
  add column if not exists team_one_score integer;
alter table public.sessions
  add column if not exists team_two_score integer;
alter table public.sessions
  drop constraint if exists sessions_team_one_score_check;
alter table public.sessions
  add constraint sessions_team_one_score_check
  check (team_one_score >= 0);
alter table public.sessions
  drop constraint if exists sessions_team_two_score_check;
alter table public.sessions
  add constraint sessions_team_two_score_check
  check (team_two_score >= 0);

alter table public.session_players
  add column if not exists team smallint;
alter table public.session_players
  drop constraint if exists session_players_team_check;
alter table public.session_players
  add constraint session_players_team_check
  check (team in (1, 2));

alter table public.session_guests
  add column if not exists team smallint;
alter table public.session_guests
  drop constraint if exists session_guests_team_check;
alter table public.session_guests
  add constraint session_guests_team_check
  check (team in (1, 2));

grant update (price_cents, paid_by, team_one_score, team_two_score)
  on public.sessions to anon, authenticated;
grant update (locked, share_paid, team)
  on public.session_players to anon, authenticated;
grant update (share_paid, team)
  on public.session_guests to anon, authenticated;

create or replace function public.delete_past_session(p_session_id uuid)
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
  if not request_is_admin() then
    raise exception 'Seul un administrateur peut supprimer une partie passée.';
  end if;

  if not exists (
    select 1
    from public.sessions
    where id = p_session_id
      and group_id = v_group_id
      and (
        played_on < current_date
        or (
          played_on = current_date
          and coalesce(starts_at, '23:59:59'::time) <= localtime
        )
      )
  ) then
    raise exception 'Seule une partie déjà passée peut être supprimée.';
  end if;

  delete from public.sessions where id = p_session_id;
end;
$$;

revoke all on function public.delete_past_session(uuid) from public;
grant execute on function public.delete_past_session(uuid)
  to anon, authenticated;
