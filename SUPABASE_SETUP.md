# Supabase Database Setup Guide

This guide will walk you through setting up your Supabase database for this task management application.

## Prerequisites

- A Supabase account (sign up at [supabase.com](https://supabase.com))
- Basic knowledge of SQL and database concepts

## Step 1: Create a Supabase Project

1. Go to [app.supabase.com](https://app.supabase.com)
2. Click **"New Project"**
3. Fill in:
   - **Name**: Your project name (e.g., "Task Management App")
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose the closest region to your users
4. Click **"Create new project"** and wait for provisioning (~2 minutes)

## Step 2: Get Your Project Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

## Step 3: Configure Environment Variables

1. Create or update your `.env` file in the project root:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

2. **Important**: Make sure `.env` is in your `.gitignore` file (it should be already)

## Step 4: Set Up Database Schema

### Option A: Using Supabase SQL Editor (Recommended)

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **"New query"**
3. Copy and paste the entire contents of `supabase/schema.sql`
4. Click **"Run"** (or press `Ctrl+Enter`)
5. Verify success - you should see "Success. No rows returned"

### Option B: Using Supabase CLI

If you have Supabase CLI installed:

```bash
# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

## Step 5: Verify Database Setup

### Check Tables

1. Go to **Table Editor** in Supabase dashboard
2. You should see three tables:
   - `profiles`
   - `tasks`
   - `devices`

### Check Row Level Security (RLS)

1. Go to **Authentication** → **Policies**
2. Verify policies exist for:
   - `profiles` (2 policies)
   - `tasks` (3 policies)
   - `devices` (1 policy)

### Check Functions

1. Go to **Database** → **Functions**
2. Verify these functions exist:
   - `is_admin()` - checks if user is admin
   - `set_updated_at()` - trigger function for updating timestamps

## Step 6: Set Up Authentication

### Enable Email Authentication

1. Go to **Authentication** → **Providers**
2. Ensure **Email** is enabled
3. Configure email templates if needed (optional)

### Create Your First Admin User

**Method 1: Via Supabase Dashboard**
1. Go to **Authentication** → **Users**
2. Click **"Add user"** → **"Create new user"**
3. Enter email and password
4. After creation, go to **Table Editor** → `profiles`
5. Find the user's row and update `role` to `'admin'`

**Method 2: Via SQL**
```sql
-- First, create the user via Auth (use Supabase dashboard or API)
-- Then update their role:
UPDATE public.profiles 
SET role = 'admin' 
WHERE id = 'user-uuid-here';
```

### Create Profile Trigger (Important!)

When a user signs up, you need to automatically create a profile. Run this SQL:

```sql
-- Function to create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'direct_sales_associate'
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to call function on new user
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

## Step 7: Test Your Setup

### Test Database Connection

1. Start your app: `npm start` or `expo start`
2. Try logging in with your admin credentials
3. Check Supabase dashboard → **Table Editor** → `profiles` to see if your profile was created

### Test Permissions

1. **As Admin**: Should be able to see all tasks
2. **As Associate**: Should only see tasks assigned to them
3. Create a test task and verify RLS policies work correctly

## Database Schema Overview

### Tables

#### `profiles`
- Stores user profile information
- Linked to `auth.users` via `id`
- Contains `role` (admin or direct_sales_associate)

#### `tasks`
- Main task table
- Fields: title, description, status, priority, due dates
- Tracks time spent (`time_spent_seconds`, `started_at`)
- References `profiles` for `created_by` and `assigned_to`

#### `devices`
- Stores Expo push notification tokens
- Links devices to users for push notifications

### Row Level Security (RLS) Policies

**Profiles:**
- Users can view and update their own profile

**Tasks:**
- Admins: Full access (create, read, update, delete)
- Associates: Can view and update only tasks assigned to them
- Users: Can create tasks for themselves

**Devices:**
- Users can manage their own device tokens

## Troubleshooting

### "relation does not exist" error
- Make sure you ran `schema.sql` completely
- Check that you're connected to the correct database

### "permission denied" errors
- Verify RLS policies are enabled
- Check that policies match your user's role
- Ensure you're authenticated (check `auth.uid()`)

### Profile not created on signup
- Make sure the `handle_new_user()` trigger is created
- Check Supabase logs for errors

### Can't see tasks
- Verify RLS policies
- Check user role in `profiles` table
- Ensure tasks have correct `assigned_to` value

## Additional Configuration

### Enable Real-time (Optional)

If you want real-time updates:

1. Go to **Database** → **Replication**
2. Enable replication for `tasks` table
3. Update your queries to use `.subscribe()` if needed

### Set Up Storage (If Needed)

If you plan to add file uploads:

1. Go to **Storage**
2. Create buckets with appropriate policies
3. Update RLS policies for storage access

## Next Steps

- ✅ Database schema is set up
- ✅ RLS policies are configured
- ✅ Authentication is enabled
- ✅ Test your app with real data

## Support

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Discord](https://discord.supabase.com)
- Check your Supabase project logs for detailed error messages
