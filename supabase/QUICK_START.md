# Quick Start: Supabase Setup

## 🚀 Fast Setup (5 minutes)

### 1. Create Supabase Project
- Go to [app.supabase.com](https://app.supabase.com)
- Click **"New Project"**
- Wait for provisioning

### 2. Get Credentials
- Go to **Settings** → **API**
- Copy **Project URL** and **anon key**

### 3. Set Environment Variables
Create `.env` file:
```env
EXPO_PUBLIC_SUPABASE_URL=your-project-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run Database Schema
- Go to **SQL Editor** in Supabase dashboard
- Copy entire `supabase/schema.sql` file
- Paste and click **"Run"**

### 5. Create Admin User
- Go to **Authentication** → **Users** → **Add user**
- Create user with email/password
- Go to **Table Editor** → `profiles`
- Find your user and set `role = 'admin'`

### 6. Test
- Start app: `npm start`
- Login with admin credentials
- You're ready! 🎉

## 📋 Checklist

- [ ] Supabase project created
- [ ] Environment variables set in `.env`
- [ ] `schema.sql` executed successfully
- [ ] Admin user created and role set
- [ ] App connects and login works

## ⚠️ Common Issues

**"Supabase URL or anon key is not set"**
→ Check your `.env` file exists and has correct variable names

**"relation does not exist"**
→ Make sure you ran `schema.sql` completely

**"permission denied"**
→ Check that RLS policies were created (see SQL Editor history)

**Profile not created on signup**
→ The trigger in `schema.sql` handles this automatically

## 📚 Full Documentation

See `SUPABASE_SETUP.md` for detailed setup instructions and troubleshooting.
