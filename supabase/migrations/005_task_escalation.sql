-- Escalation fields (Section 8: Overdue tasks escalate to Supervisor, to HOS)
alter table public.tasks
  add column if not exists escalated_at timestamptz,
  add column if not exists escalated_to uuid references public.profiles(id) on delete set null;
