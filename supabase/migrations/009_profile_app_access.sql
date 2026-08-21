-- App access: disable login without deleting the account
alter table public.profiles
  add column if not exists app_access boolean not null default true;

comment on column public.profiles.app_access is
  'When false, user cannot use the app (login blocked / session kicked). Account is kept.';
