-- Actual close time for workload / S-curve (set when task reaches Completed)
alter table public.tasks
  add column if not exists completed_at timestamptz;

comment on column public.tasks.completed_at is
  'Timestamp when the task was marked Completed (actual close). Cleared if reopened.';
