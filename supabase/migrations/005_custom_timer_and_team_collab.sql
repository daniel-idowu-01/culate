-- Migration: Add custom timer duration and team collaboration support
-- This migration adds:
-- 1. Custom duration field for tasks (custom_duration_seconds)
-- 2. Task assignees table for multi-user task assignments (team collaboration)
-- 3. Real-time replication for tasks table

-- Add custom duration field to tasks
alter table public.tasks 
add column if not exists custom_duration_seconds integer;

comment on column public.tasks.custom_duration_seconds is 
  'Custom timer duration in seconds. If set, overrides due_at calculation for timer display.';

-- Create task_assignees table for team collaboration (many-to-many relationship)
create table if not exists public.task_assignees (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  unique (task_id, user_id)
);

comment on table public.task_assignees is 
  'Many-to-many relationship for team collaboration on tasks. Allows multiple users to be assigned to a single task.';

create index if not exists idx_task_assignees_task_id on public.task_assignees(task_id);
create index if not exists idx_task_assignees_user_id on public.task_assignees(user_id);

-- Enable RLS for task_assignees
alter table public.task_assignees enable row level security;

-- RLS Policies for task_assignees
drop policy if exists "Task assignees: managers full access" on public.task_assignees;
create policy "Task assignees: managers full access"
  on public.task_assignees
  for all
  using (public.is_manager())
  with check (public.is_manager());

drop policy if exists "Task assignees: users can view assigned tasks" on public.task_assignees;
create policy "Task assignees: users can view assigned tasks"
  on public.task_assignees
  for select
  using (
    user_id = auth.uid() 
    or exists (
      select 1 from public.tasks
      where tasks.id = task_assignees.task_id
        and (tasks.assigned_to = auth.uid() or tasks.created_by = auth.uid())
    )
  );

drop policy if exists "Task assignees: managers can assign" on public.task_assignees;
create policy "Task assignees: managers can assign"
  on public.task_assignees
  for insert
  with check (public.is_manager());

drop policy if exists "Task assignees: managers can remove" on public.task_assignees;
create policy "Task assignees: managers can remove"
  on public.task_assignees
  for delete
  using (public.is_manager());

-- Function to automatically escalate tasks when timer reaches 00:00
create or replace function public.auto_escalate_overdue_tasks()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  task_record record;
  supervisor_id uuid;
begin
  -- Find tasks that are overdue (due_at < now) and not closed, not already escalated
  for task_record in
    select id, title, due_at, status, department, escalated_at, escalated_to
    from public.tasks
    where status != 'closed'
      and escalated_at is null
      and due_at < now()
  loop
    -- Find a supervisor to escalate to
    select id into supervisor_id
    from public.profiles
    where role in ('supervisor', 'department_head', 'admin')
    limit 1;
    
    -- If supervisor found, escalate the task
    if supervisor_id is not null then
      update public.tasks
      set 
        escalated_at = now(),
        escalated_to = supervisor_id
      where id = task_record.id;
      
      -- Note: Push notification will be sent by the application layer
      -- when it detects the escalated_at timestamp change
    end if;
  end loop;
end;
$$;

comment on function public.auto_escalate_overdue_tasks() is 
  'Automatically escalates overdue tasks to supervisors. Should be called periodically (e.g., via cron job or app-side timer check).';

-- Trigger to check for escalation when task is updated
create or replace function public.check_task_escalation()
returns trigger
language plpgsql
as $$
begin
  -- If task becomes overdue and not already escalated, escalate it
  if new.status != 'closed' 
     and new.escalated_at is null 
     and new.due_at < now() then
    perform public.auto_escalate_overdue_tasks();
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_check_task_escalation on public.tasks;
create trigger trigger_check_task_escalation
after update on public.tasks
for each row
when (
  (old.due_at is distinct from new.due_at or old.status is distinct from new.status)
  and new.status != 'closed'
  and new.escalated_at is null
  and new.due_at < now()
)
execute function public.check_task_escalation();

-- Enable real-time replication for tasks table (if not already enabled)
-- Note: This needs to be enabled in Supabase Dashboard > Database > Replication
-- But we'll add a comment here for reference
comment on table public.tasks is 
  'Tasks table. Enable real-time replication in Supabase Dashboard for instant updates across clients.';
