import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushPayload {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const { userId, title, body, data } = (await req.json()) as PushPayload;
    if (!userId || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'userId, title, and body are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: devices } = await supabase
      .from('devices')
      .select('expo_push_token')
      .eq('user_id', userId);

    const tokens = (devices ?? [])
      .map((d: { expo_push_token: string }) => d.expo_push_token)
      .filter(Boolean);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No push tokens for user' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const messages = tokens.map((token: string) => ({
      to: token,
      title,
      body,
      data: data ?? {},
      sound: 'default',
      priority: 'high',
    }));

    const expoRes = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await expoRes.json();
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    console.error('send-push error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
