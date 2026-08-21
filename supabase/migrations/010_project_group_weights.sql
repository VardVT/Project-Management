-- Per-vessel technical group weights for weighted overall progress
alter table public.projects
  add column if not exists group_weights jsonb;

comment on column public.projects.group_weights is
  'Optional override of technical group weights, e.g. {"3D drawing":65,"Iso generating":15,"2D drawing":10,"MTO":10}. Null = app defaults.';

update public.projects
set group_weights = '{"3D drawing":65,"2D drawing":10,"Iso generating":15,"MTO":10}'::jsonb
where group_weights is null;
