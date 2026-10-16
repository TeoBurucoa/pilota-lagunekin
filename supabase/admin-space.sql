-- À exécuter une seule fois après multi-groups.sql.

create table if not exists public.app_admins (
  token uuid primary key default gen_random_uuid(),
  label text not null default 'Administrateur principal',
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

insert into public.app_admins (label)
select 'Administrateur principal'
where not exists (select 1 from public.app_admins);

create or replace function public.request_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from app_admins
    where token::text = (
      coalesce(current_setting('request.headers', true), '{}')::jsonb
        ->> 'x-admin-token'
    )
  );
$$;

revoke all on function public.request_is_admin() from public;
grant execute on function public.request_is_admin() to anon, authenticated;

drop policy if exists "Token can read its group" on public.groups;
create policy "Token or admin can read groups"
  on public.groups for select to anon, authenticated
  using (id = request_group_id() or request_is_admin());

-- Le résultat de cette requête est le lien secret vers l'administration.
select
  label,
  '/?admin=' || token as admin_path
from public.app_admins
order by created_at;
