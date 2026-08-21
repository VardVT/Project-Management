-- First login: force password change after default Pass01
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'When true, user must set a new password before using the app (e.g. after Pass01 first login).';
