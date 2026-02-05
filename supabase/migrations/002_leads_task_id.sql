-- Migration: Add task_id to leads table to link potential customers to tasks
-- Run this if you already have the leads table and need to add task linking

alter table public.leads
add column if not exists task_id uuid references public.tasks(id) on delete set null;
