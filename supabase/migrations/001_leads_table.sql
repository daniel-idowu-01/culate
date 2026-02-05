-- Migration: Add leads (potential customers) table for direct_sales_associate
-- Run this if you already have an existing database and need to add the leads feature

-- Potential customers (leads) table - linked to tasks for outcome tracking
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

alter table public.leads enable row level security;

-- Leads policies: associates manage own leads; admin can view all
create policy "Leads: associates full access to own"
  on public.leads
  for all
  using (recorded_by = auth.uid())
  with check (recorded_by = auth.uid());

create policy "Leads: admin can view all"
  on public.leads
  for select
  using (public.is_admin());
