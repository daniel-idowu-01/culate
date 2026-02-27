-- Migration 006: Ensure admin emails are captured in profiles
-- The handle_new_user trigger already stores email on signup,
-- but run this once to backfill any profiles missing their email.

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is null
  and u.email is not null;

-- Add an index to speed up the admin email lookup used by send-escalation-email
create index if not exists idx_profiles_role_email
  on public.profiles (role, email)
  where email is not null;