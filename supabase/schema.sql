-- Enum types
create type user_role as enum ('admin', 'direct_sales_associate');
create type task_status as enum ('pending', 'in_progress', 'completed', 'overdue');
create type task_priority as enum ('low', 'medium', 'high');

-- Profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role not null default 'direct_sales_associate',
  created_at timestamptz not null default now()
);

-- Tasks table
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status task_status not null default 'pending',
  priority task_priority not null default 'medium',
  created_by uuid not null references public.profiles(id) on delete restrict,
  assigned_to uuid not null references public.profiles(id) on delete restrict,
  due_at timestamptz,
  started_at timestamptz,
  time_spent_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
alter table public.devices enable row level security;

-- Profiles policies
create policy "Profiles: users can view own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "Profiles: users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id);

-- Helper function to check if current user is admin
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql stable;

-- Tasks policies
create policy "Tasks: admin full access"
  on public.tasks
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Tasks: associates can view assigned tasks"
  on public.tasks
  for select
  using (assigned_to = auth.uid());

create policy "Tasks: associates can update limited fields on assigned tasks"
  on public.tasks
  for update
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

-- Devices policies
create policy "Devices: user can manage own tokens"
  on public.devices
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

