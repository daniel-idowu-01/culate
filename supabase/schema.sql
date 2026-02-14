-- Enum types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('admin', 'department_head', 'supervisor', 'staff');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('open', 'pending', 'closed');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
    CREATE TYPE task_priority AS ENUM ('p1', 'p2', 'p3');
  END IF;
END$$;

-- Departments table
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role user_role not null default 'staff',
  staff_id text,
  department text not null default 'Sales',
  created_at timestamptz not null default now()
);

-- Tasks table
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status task_status not null default 'open',
  priority task_priority not null default 'p2',
  created_by uuid not null references public.profiles(id) on delete restrict,
  assigned_to uuid not null references public.profiles(id) on delete restrict,
  department text not null default 'Sales',
  due_at timestamptz not null,
  started_at timestamptz,
  time_spent_seconds integer not null default 0,
  closed_approved_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Task comments
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  body text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Task attachments (metadata only; store file_url in Supabase Storage)
create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  mime_type text,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Task contacts
create table if not exists public.task_contacts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  notes text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint task_contacts_has_contact check (phone is not null or email is not null)
);

-- Potential customers (leads) table - linked to tasks
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete set null,
  name text not null,
  contact_phone text,
  contact_email text,
  conversation_summary text not null,
  recorded_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint leads_has_contact check (contact_phone is not null or contact_email is not null)
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

-- Basic trigger to update updated_at
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

-- RLS
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.leads enable row level security;
alter table public.devices enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_contacts enable row level security;
alter table public.departments enable row level security;

-- Helper function to check if current user is manager (admin/supervisor/department head)
-- Marked as SECURITY DEFINER so it runs as table owner and avoids recursive RLS evaluation.
create or replace function public.is_manager()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'supervisor', 'department_head')
  );
end;
$$;

-- Profiles policies
drop policy if exists "Profiles: users can view own profile" on public.profiles;
create policy "Profiles: users can view own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "Profiles: managers can view all" on public.profiles;
create policy "Profiles: managers can view all"
  on public.profiles
  for select
  using (public.is_manager());

drop policy if exists "Profiles: users can update own profile" on public.profiles;
create policy "Profiles: users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id);

-- Tasks policies
drop policy if exists "Tasks: managers full access" on public.tasks;
create policy "Tasks: managers full access"
  on public.tasks
  for all
  using (public.is_manager())
  with check (public.is_manager());

drop policy if exists "Tasks: staff can view assigned or created" on public.tasks;
create policy "Tasks: staff can view assigned or created"
  on public.tasks
  for select
  using (assigned_to = auth.uid() or created_by = auth.uid());

drop policy if exists "Tasks: users can insert own tasks" on public.tasks;
create policy "Tasks: users can insert own tasks"
  on public.tasks
  for insert
  with check (
    created_by = auth.uid()
    and (assigned_to = auth.uid() or public.is_manager())
  );

-- Comments policies
drop policy if exists "Comments: managers full access" on public.task_comments;
create policy "Comments: managers full access"
  on public.task_comments
  for all
  using (public.is_manager())
  with check (public.is_manager());

drop policy if exists "Comments: assigned users can read" on public.task_comments;
create policy "Comments: assigned users can read"
  on public.task_comments
  for select
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = task_comments.task_id
        and (tasks.assigned_to = auth.uid() or tasks.created_by = auth.uid())
    )
  );

drop policy if exists "Comments: assigned users can insert" on public.task_comments;
create policy "Comments: assigned users can insert"
  on public.task_comments
  for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.tasks
      where tasks.id = task_comments.task_id
        and (tasks.assigned_to = auth.uid() or tasks.created_by = auth.uid())
    )
  );

-- Attachments policies
drop policy if exists "Attachments: managers full access" on public.task_attachments;
create policy "Attachments: managers full access"
  on public.task_attachments
  for all
  using (public.is_manager())
  with check (public.is_manager());

drop policy if exists "Attachments: assigned users can read" on public.task_attachments;
create policy "Attachments: assigned users can read"
  on public.task_attachments
  for select
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = task_attachments.task_id
        and (tasks.assigned_to = auth.uid() or tasks.created_by = auth.uid())
    )
  );

-- Contacts policies
drop policy if exists "Contacts: managers full access" on public.task_contacts;
create policy "Contacts: managers full access"
  on public.task_contacts
  for all
  using (public.is_manager())
  with check (public.is_manager());

drop policy if exists "Contacts: assigned users can read" on public.task_contacts;
create policy "Contacts: assigned users can read"
  on public.task_contacts
  for select
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = task_contacts.task_id
        and (tasks.assigned_to = auth.uid() or tasks.created_by = auth.uid())
    )
  );

drop policy if exists "Contacts: assigned users can insert" on public.task_contacts;
create policy "Contacts: assigned users can insert"
  on public.task_contacts
  for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.tasks
      where tasks.id = task_contacts.task_id
        and (tasks.assigned_to = auth.uid() or tasks.created_by = auth.uid())
    )
  );

drop policy if exists "Attachments: assigned users can insert" on public.task_attachments;
create policy "Attachments: assigned users can insert"
  on public.task_attachments
  for insert
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.tasks
      where tasks.id = task_attachments.task_id
        and (tasks.assigned_to = auth.uid() or tasks.created_by = auth.uid())
    )
  );

-- Leads policies: users manage own leads; managers can view all
drop policy if exists "Leads: users full access to own" on public.leads;
create policy "Leads: users full access to own"
  on public.leads
  for all
  using (recorded_by = auth.uid())
  with check (recorded_by = auth.uid());

drop policy if exists "Leads: managers can view all" on public.leads;
create policy "Leads: managers can view all"
  on public.leads
  for select
  using (public.is_manager());

-- Devices policies
drop policy if exists "Devices: user can manage own tokens" on public.devices;
create policy "Devices: user can manage own tokens"
  on public.devices
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Departments policies
drop policy if exists "Departments: managers can view" on public.departments;
create policy "Departments: managers can view"
  on public.departments
  for select
  using (public.is_manager());

-- Storage policies for task attachments bucket
drop policy if exists "Storage: task attachments insert" on storage.objects;
create policy "Storage: task attachments insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'task-attachments'
    and auth.uid() is not null
  );

drop policy if exists "Storage: task attachments read" on storage.objects;
create policy "Storage: task attachments read"
  on storage.objects
  for select
  using (
    bucket_id = 'task-attachments'
    and auth.uid() is not null
  );

-- Function to create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, role, department)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    'staff',
    'Sales'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
