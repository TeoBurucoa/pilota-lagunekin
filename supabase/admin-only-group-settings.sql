-- À exécuter une seule fois après add-manual-sessions.sql.
-- Seul l'administrateur peut modifier les réglages d'un groupe.

drop policy if exists "Token can update its group" on public.groups;
create policy "Admin can update its group"
  on public.groups for update to anon, authenticated
  using (id = request_group_id() and request_is_admin())
  with check (
    id = request_group_id()
    and request_is_admin()
    and access_token::text = (
      coalesce(current_setting('request.headers', true), '{}')::jsonb
        ->> 'x-group-token'
    )
  );
