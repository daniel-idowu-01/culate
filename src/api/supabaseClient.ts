import { createClient } from '@supabase/supabase-js';

// You will set these via environment variables or app config
// See README for details.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // In development this helps catch misconfiguration early.
  console.warn(
    'Supabase URL or anon key is not set. Make sure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are configured.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

