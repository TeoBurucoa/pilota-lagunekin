-- À exécuter une seule fois après add-session-guests.sql.
-- Remplace le lien secret /?admin=... par un identifiant et un mot de passe.
-- L'ancien lien ne donne plus accès à l'administration.

create extension if not exists pgcrypto;

alter table public.app_admins
  add column if not exists login text,
  add column if not exists password_hash text;

create unique index if not exists app_admins_login_unique
  on public.app_admins (lower(login))
  where login is not null;

-- Invalide les liens d'administration déjà connus.
update public.app_admins
set token = gen_random_uuid()
where password_hash is null;

create or replace function public.admin_login(
  p_login text,
  p_password text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token uuid;
begin
  if coalesce(trim(p_login), '') = '' or coalesce(p_password, '') = '' then
    return null;
  end if;

  select token into v_token
  from app_admins
  where lower(login) = lower(trim(p_login))
    and password_hash is not null
    and password_hash = crypt(p_password, password_hash);

  return v_token;
end;
$$;

revoke all on function public.admin_login(text, text) from public;
grant execute on function public.admin_login(text, text) to anon, authenticated;

-- Définissez ensuite vos identifiants, en remplaçant les deux valeurs.
-- Le mot de passe n'est pas enregistré en clair.
--
-- update public.app_admins
-- set
--   login = 'votre-identifiant',
--   password_hash = crypt('votre-mot-de-passe', gen_salt('bf'));
