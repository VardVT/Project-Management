-- Fix silent task delete failures:
-- 1) Role helpers now match UI normalizeRole (includes 'senior'/'manager'/'admin')
-- 2) DELETE policy aligned with UPDATE (manager/senior/assignee)
-- Previous exact match on position = 'senior' failed for values like 'Senior Engineer'.

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.position, '')) like '%admin%'
        or lower(coalesce(p.position, '')) like '%manager%'
      )
  );
$$;

create or replace function public.is_senior_or_above()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_manager_or_admin()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.position, '')) like '%senior%'
    );
$$;

drop policy if exists "tasks_delete_member" on public.tasks;
create policy "tasks_delete_member"
  on public.tasks for delete
  to authenticated
  using (
    public.is_manager_or_admin()
    or public.is_senior_or_above()
    or assignee_id = auth.uid()
  );

notify pgrst, 'reload schema';
