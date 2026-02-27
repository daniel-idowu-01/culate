# Supabase Fresh Setup Guide

This guide is for setting up a brand-new Supabase project for this app.

## 1. Create a Supabase project

1. Go to `https://app.supabase.com` and create a new project.
2. Save these values from `Settings -> API`:
   - Project URL
   - `anon` public key
   - `service_role` key
   - project ref

## 2. Configure local environment

Create/update `.env` in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
EXPO_PUBLIC_PROJECT_ID=<expo-eas-project-uuid>
GMAIL_USER=<gmail-address>
GMAIL_APP_PASSWORD=<gmail-app-password>
```

Reference template: `.env.example`

## 3. Apply base database schema

In Supabase SQL Editor, run:

- `supabase/schema.sql`

This creates core tables, enums, RLS policies, triggers, and signup profile trigger.

## 4. Apply required migrations after schema

Run these SQL files in order:

1. `supabase/migrations/005_custom_timer_and_team_collab.sql`
2. `supabase/migrations/006_admin_email_notifications.sql`

Notes:
- For a fresh DB, do not run old incremental migrations blindly from `001` onward.
- `schema.sql` already includes many objects that older migrations were originally adding.

## 5. Create storage bucket

Create a storage bucket:

- Bucket name: `task-attachments`
- Access: Public

The app uploads attachments there and stores returned public URLs.

## 6. Deploy edge functions

Deploy:

- `supabase/functions/send-escalation-email`
- `supabase/functions/check-overdue-tasks`

## 7. Set edge function secrets

In Supabase Edge Function secrets, set:

- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`
- `APP_NAME` (optional)

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required by these functions and should be available in the function runtime.

## 8. Configure scheduler (cron)

Schedule the `check-overdue-tasks` function to run periodically (recommended every 1 minute).

## 9. Enable Realtime

Enable realtime for:

- `public.tasks`
- `public.task_assignees`

This is required for live task updates in the app UI.

## 10. Bootstrap first admin

1. Create a user in Supabase Auth (Email/Password).
2. Promote to admin:

```sql
update public.profiles
set role = 'admin'
where id = '<auth-user-uuid>';
```

Roles used by app:
- `admin`
- `department_head`
- `supervisor`
- `staff`

## 11. Verification checklist

- Tables exist:
  - `profiles`
  - `tasks`
  - `task_assignees`
  - `task_comments`
  - `task_attachments`
  - `task_contacts`
  - `task_subtasks`
  - `leads`
  - `devices`
  - `departments`
- Trigger exists: `on_auth_user_created`
- Function exists: `is_manager()`
- Storage bucket exists: `task-attachments`
- Edge functions deployed:
  - `send-escalation-email`
  - `check-overdue-tasks`

## 12. Optional function currently referenced by app

The app also invokes edge function `send-push` for push notifications. If not deployed, the app logs warnings but core task flows still work.
