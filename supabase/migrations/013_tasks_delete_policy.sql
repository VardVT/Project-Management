-- Align tasks DELETE with insert/update roles used by drawing marks.
-- Previously delete required is_project_member(), so linked tasks often survived
-- after a drawing comment was removed (error was also ignored in the client).

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
