-- Sub-tasks table (Section 3: Sub-tasks supported: Yes)
create table if not exists public.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.task_subtasks enable row level security;

-- Sub-tasks: same visibility as parent task
drop policy if exists "Subtasks: managers full access" on public.task_subtasks;
create policy "Subtasks: managers full access"
  on public.task_subtasks
  for all
  using (public.is_manager())
  with check (public.is_manager());

drop policy if exists "Subtasks: assigned users can read" on public.task_subtasks;
create policy "Subtasks: assigned users can read"
  on public.task_subtasks
  for select
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = task_subtasks.task_id
        and (tasks.assigned_to = auth.uid() or tasks.created_by = auth.uid())
    )
  );

drop policy if exists "Subtasks: assigned users can insert" on public.task_subtasks;
create policy "Subtasks: assigned users can insert"
  on public.task_subtasks
  for insert
  with check (
    exists (
      select 1 from public.tasks
      where tasks.id = task_subtasks.task_id
        and (tasks.assigned_to = auth.uid() or tasks.created_by = auth.uid())
    )
  );

drop policy if exists "Subtasks: assigned users can update" on public.task_subtasks;
create policy "Subtasks: assigned users can update"
  on public.task_subtasks
  for update
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = task_subtasks.task_id
        and (tasks.assigned_to = auth.uid() or tasks.created_by = auth.uid())
    )
  );

drop policy if exists "Subtasks: assigned users can delete" on public.task_subtasks;
create policy "Subtasks: assigned users can delete"
  on public.task_subtasks
  for delete
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = task_subtasks.task_id
        and (tasks.assigned_to = auth.uid() or tasks.created_by = auth.uid())
    )
  );

-- Trigger for updated_at
drop trigger if exists set_task_subtasks_updated_at on public.task_subtasks;
create trigger set_task_subtasks_updated_at
before update on public.task_subtasks
for each row
execute procedure public.set_updated_at();
