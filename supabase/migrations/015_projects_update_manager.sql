-- Managers/admins can update any project (e.g. group_weights on Summary)
-- Previously only project members / owner could UPDATE, while SELECT was open to all.

drop policy if exists "projects_update_member" on public.projects;
create policy "projects_update_member"
  on public.projects for update
  to authenticated
  using (
    public.is_manager_or_admin()
    or public.is_project_member(id)
    or owner_id = auth.uid()
  )
  with check (
    public.is_manager_or_admin()
    or public.is_project_member(id)
    or owner_id = auth.uid()
  );

notify pgrst, 'reload schema';
