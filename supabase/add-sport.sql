-- À exécuter une seule fois après add-group-features.sql.
-- Les groupes existants restent en pelote.

alter table public.groups
  add column if not exists sport text not null default 'pelote'
  check (sport in ('pelote', 'padel'));
