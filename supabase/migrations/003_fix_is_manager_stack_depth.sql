-- Fix: "stack depth limit exceeded" when staff create comments/contacts.
-- Cause: is_manager() was evaluated under RLS, causing recursive policy checks.
-- Fix: Run as table owner (SECURITY DEFINER) with fixed search_path.

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
