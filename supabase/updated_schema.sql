-- Updated Schema for Sales Task Tracker System
-- Based on System Design Requirements Document

-- Enum types
create type user_role as enum ('staff', 'supervisor', 'department_head', 'admin');
create type task_status as enum ('open', 'pending', 'closed');
create type task_priority as enum ('p1', 'p2', 'p3');
create type notification_channel as enum ('popup', 'email', 'both');

-- Departments table
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

-- Profiles table (enhanced)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  staff_id text unique not null, -- Staff ID requirement
  full_name text not null,
  email text not null,
  role user_role not null default 'staff',
  department_id uuid references public.departments(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tasks table (updated to match requirements)
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status task_status not null default 'open',
  priority task_priority not null default 'p2',
  
  -- Assignment (can be assigned to user OR department)
  assigned_to_user_id uuid references public.profiles(id) on delete restrict,
  assigned_to_department_id uuid references public.departments(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  
  -- SLA/Timer requirements
  due_at timestamptz,
  sla_minutes integer, -- SLA in minutes for countdown
  started_at timestamptz,
  time_spent_seconds integer not null default 0,
  
  -- Supervisor approval requirement
  requires_supervisor_approval boolean not null default true,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  
  -- Escalation tracking
  escalated boolean not null default false,
  escalated_at timestamptz,
  escalated_to uuid references public.profiles(id) on delete set null,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Constraint: task must have either user or department assignment
  constraint task_must_have_owner check (
    assigned_to_user_id is not null or assigned_to_department_id is not null
  )
);

-- Sub-tasks table (requirement: sub-tasks supported)
create table if not exists public.subtasks (
  id uuid primary key default gen_random_uuid(),
  parent_task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  description text,
  status task_status not null default 'open',
  assigned_to uuid references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Comments table (requirement: comment on task)
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Attachments table (requirement: upload attachments)
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  file_size bigint not null,
  file_type text not null,
  storage_path text not null, -- Path in Supabase Storage
  created_at timestamptz not null default now()
);

-- Task reassignment history (for audit trail)
create table if not exists public.task_reassignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  from_user_id uuid references public.profiles(id) on delete set null,
  from_department_id uuid references public.departments(id) on delete set null,
  to_user_id uuid references public.profiles(id) on delete set null,
  to_department_id uuid references public.departments(id) on delete set null,
  reassigned_by uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);

-- Notifications table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  message text not null,
  channel notification_channel not null default 'both',
  read boolean not null default false,
  sent_at timestamptz not null default now(),
  read_at timestamptz
);

-- Devices table for Expo push tokens
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

-- Supervisor performance tracking (for reporting)
create table if not exists public.supervisor_metrics (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references public.profiles(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  tasks_supervised integer not null default 0,
  tasks_approved integer not null default 0,
  tasks_rejected integer not null default 0,
  avg_approval_time_minutes integer,
  created_at timestamptz not null default now(),
  unique (supervisor_id, period_start, period_end)
);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update timestamp trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
  before update on public.tasks
  for each row
  execute procedure public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute procedure public.set_updated_at();

drop trigger if exists set_subtasks_updated_at on public.subtasks;
create trigger set_subtasks_updated_at
  before update on public.subtasks
  for each row
  execute procedure public.set_updated_at();

drop trigger if exists set_comments_updated_at on public.comments;
create trigger set_comments_updated_at
  before update on public.comments
  for each row
  execute procedure public.set_updated_at();

-- Auto-escalate overdue tasks
create or replace function public.check_task_escalation()
returns trigger as $$
declare
  supervisor_id uuid;
  department_head_id uuid;
begin
  -- Only escalate if task is overdue and not already escalated
  if new.due_at < now() and new.status != 'closed' and not new.escalated then
    -- Find supervisor or department head
    select id into supervisor_id
    from public.profiles
    where department_id = (
      select department_id from public.profiles where id = new.assigned_to_user_id
    )
    and role in ('supervisor', 'department_head')
    limit 1;
    
    if supervisor_id is not null then
      new.escalated = true;
      new.escalated_at = now();
      new.escalated_to = supervisor_id;
      
      -- Create notification
      insert into public.notifications (user_id, task_id, title, message, channel)
      values (
        supervisor_id,
        new.id,
        'Task Escalated',
        'Task "' || new.title || '" has exceeded SLA and requires attention',
        'both'
      );
    end if;
  end if;
  
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_task_escalation on public.tasks;
create trigger trigger_task_escalation
  before update on public.tasks
  for each row
  execute procedure public.check_task_escalation();

-- Notification trigger for task assignment
create or replace function public.notify_task_assignment()
returns trigger as $$
begin
  if new.assigned_to_user_id is not null then
    insert into public.notifications (user_id, task_id, title, message, channel)
    values (
      new.assigned_to_user_id,
      new.id,
      'Task Assigned',
      'You have been assigned task: ' || new.title,
      'both'
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_notify_assignment on public.tasks;
create trigger trigger_notify_assignment
  after insert on public.tasks
  for each row
  execute procedure public.notify_task_assignment();

-- Notification trigger for status changes
create or replace function public.notify_status_change()
returns trigger as $$
begin
  if old.status != new.status then
    -- Notify task creator
    insert into public.notifications (user_id, task_id, title, message, channel)
    values (
      new.created_by,
      new.id,
      'Task Status Changed',
      'Task "' || new.title || '" status changed from ' || old.status || ' to ' || new.status,
      'both'
    );
    
    -- Notify assigned user if different from creator
    if new.assigned_to_user_id is not null and new.assigned_to_user_id != new.created_by then
      insert into public.notifications (user_id, task_id, title, message, channel)
      values (
        new.assigned_to_user_id,
        new.id,
        'Task Status Changed',
        'Task "' || new.title || '" status changed to ' || new.status,
        'both'
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_notify_status on public.tasks;
create trigger trigger_notify_status
  after update on public.tasks
  for each row
  execute procedure public.notify_status_change();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.comments enable row level security;
alter table public.attachments enable row level security;
alter table public.task_reassignments enable row level security;
alter table public.notifications enable row level security;
alter table public.devices enable row level security;
alter table public.supervisor_metrics enable row level security;

-- Helper functions
create or replace function public.get_user_role()
returns user_role as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable;

create or replace function public.is_supervisor()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('supervisor', 'department_head', 'admin')
  );
$$ language sql stable;

create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql stable;

create or replace function public.user_department()
returns uuid as $$
  select department_id from public.profiles where id = auth.uid();
$$ language sql stable;

-- Departments policies
create policy "All users can view departments"
  on public.departments for select
  using (true);

create policy "Only admins can manage departments"
  on public.departments for all
  using (public.is_admin())
  with check (public.is_admin());

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Supervisors can view all profiles in their department"
  on public.profiles for select
  using (
    public.is_supervisor() and department_id = public.user_department()
  );

create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Tasks policies
create policy "Staff can view assigned tasks"
  on public.tasks for select
  using (
    assigned_to_user_id = auth.uid()
    or created_by = auth.uid()
  );

create policy "Supervisors can view department tasks"
  on public.tasks for select
  using (
    public.is_supervisor() and (
      assigned_to_department_id = public.user_department()
      or exists (
        select 1 from public.profiles
        where id = tasks.assigned_to_user_id
        and department_id = public.user_department()
      )
    )
  );

create policy "Department heads can view all department tasks"
  on public.tasks for select
  using (
    public.get_user_role() in ('department_head', 'admin')
  );

create policy "Staff can create tasks"
  on public.tasks for insert
  with check (auth.uid() = created_by);

create policy "Staff can update own assigned tasks"
  on public.tasks for update
  using (assigned_to_user_id = auth.uid())
  with check (assigned_to_user_id = auth.uid());

create policy "Supervisors can update department tasks"
  on public.tasks for update
  using (public.is_supervisor())
  with check (public.is_supervisor());

-- Cannot close task without supervisor approval
create or replace function public.can_close_task(task_id uuid)
returns boolean as $$
declare
  task_record record;
  user_role_val user_role;
begin
  select * into task_record from public.tasks where id = task_id;
  select role into user_role_val from public.profiles where id = auth.uid();
  
  -- Supervisor or above can close
  if user_role_val in ('supervisor', 'department_head', 'admin') then
    return true;
  end if;
  
  -- Staff cannot close without approval
  return false;
end;
$$ language plpgsql;

-- Subtasks policies
create policy "Users can view subtasks of visible tasks"
  on public.subtasks for select
  using (
    exists (
      select 1 from public.tasks
      where id = subtasks.parent_task_id
      and (assigned_to_user_id = auth.uid() or created_by = auth.uid())
    )
    or public.is_supervisor()
  );

create policy "Users can create subtasks"
  on public.subtasks for insert
  with check (auth.uid() = created_by);

create policy "Users can update own subtasks"
  on public.subtasks for update
  using (assigned_to = auth.uid() or created_by = auth.uid());

-- Comments policies
create policy "Users can view comments on visible tasks"
  on public.comments for select
  using (
    exists (
      select 1 from public.tasks
      where id = comments.task_id
      and (assigned_to_user_id = auth.uid() or created_by = auth.uid())
    )
    or public.is_supervisor()
  );

create policy "Users can create comments"
  on public.comments for insert
  with check (auth.uid() = user_id);

create policy "Users can update own comments"
  on public.comments for update
  using (user_id = auth.uid());

-- Attachments policies
create policy "Users can view attachments on visible tasks"
  on public.attachments for select
  using (
    exists (
      select 1 from public.tasks
      where id = attachments.task_id
      and (assigned_to_user_id = auth.uid() or created_by = auth.uid())
    )
    or public.is_supervisor()
  );

create policy "Users can upload attachments"
  on public.attachments for insert
  with check (auth.uid() = uploaded_by);

-- Task reassignments policies
create policy "Users can view reassignment history of visible tasks"
  on public.task_reassignments for select
  using (
    exists (
      select 1 from public.tasks
      where id = task_reassignments.task_id
      and (assigned_to_user_id = auth.uid() or created_by = auth.uid())
    )
    or public.is_supervisor()
  );

create policy "Supervisors can reassign tasks"
  on public.task_reassignments for insert
  with check (public.is_supervisor());

-- Notifications policies
create policy "Users can view own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "Users can update own notifications"
  on public.notifications for update
  using (user_id = auth.uid());

-- Devices policies
create policy "Users can manage own devices"
  on public.devices for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Supervisor metrics policies
create policy "Supervisors can view own metrics"
  on public.supervisor_metrics for select
  using (supervisor_id = auth.uid() or public.is_admin());

-- ============================================
-- SEED DATA
-- ============================================

-- Insert Sales department
insert into public.departments (name, description)
values ('Sales', 'Sales Department')
on conflict (name) do nothing;

-- ============================================
-- VIEWS FOR REPORTING
-- ============================================

-- Task completion rate view
create or replace view public.task_completion_rates as
select
  d.name as department_name,
  count(*) filter (where t.status = 'closed') as completed_tasks,
  count(*) as total_tasks,
  round(
    100.0 * count(*) filter (where t.status = 'closed') / nullif(count(*), 0),
    2
  ) as completion_rate
from public.tasks t
left join public.departments d on t.assigned_to_department_id = d.id
group by d.name;

-- Overdue tasks view
create or replace view public.overdue_tasks as
select
  t.*,
  p.full_name as assigned_to_name,
  d.name as department_name
from public.tasks t
left join public.profiles p on t.assigned_to_user_id = p.id
left join public.departments d on t.assigned_to_department_id = d.id
where t.due_at < now()
  and t.status != 'closed';

-- Supervisor performance view
create or replace view public.supervisor_performance as
select
  p.full_name as supervisor_name,
  count(distinct t.id) filter (where t.approved_by = p.id) as tasks_approved,
  count(distinct t.id) filter (where t.escalated_to = p.id) as tasks_escalated,
  avg(extract(epoch from (t.approved_at - t.created_at)) / 60) filter (
    where t.approved_by = p.id and t.approved_at is not null
  ) as avg_approval_time_minutes
from public.profiles p
left join public.tasks t on t.approved_by = p.id or t.escalated_to = p.id
where p.role in ('supervisor', 'department_head')
group by p.id, p.full_name;