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

grant update (team_one_score, team_two_score) on public.sessions
  to anon, authenticated;
grant update (team) on public.session_players
  to anon, authenticated;
grant update (team) on public.session_guests
  to anon, authenticated;
