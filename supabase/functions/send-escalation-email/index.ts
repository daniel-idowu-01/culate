import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

interface EscalationEmailPayload {
  taskId: string;
  taskTitle: string;
  dueAt: string;
}

const ESC_LOG = '[EscalationEmailFn]';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  console.log(`${ESC_LOG} request received`, { method: req.method });
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { taskId, taskTitle, dueAt } = (await req.json()) as EscalationEmailPayload;
    console.log(`${ESC_LOG} payload parsed`, {
      taskId,
      hasTaskTitle: Boolean(taskTitle),
      dueAt,
    });

    if (!taskId || !taskTitle) {
      console.warn(`${ESC_LOG} validation failed: taskId and taskTitle are required`);
      return new Response(JSON.stringify({ error: 'taskId and taskTitle are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const gmailUser = Deno.env.get('GMAIL_USER');
    const gmailAppPassword = Deno.env.get('GMAIL_APP_PASSWORD');
    const appName = Deno.env.get('APP_NAME') ?? 'Sales Task Tracker';

    if (!gmailUser || !gmailAppPassword) {
      console.error(`${ESC_LOG} missing GMAIL_USER or GMAIL_APP_PASSWORD`);
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: adminProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('role', ['admin', 'supervisor', 'department_head'])
      .not('email', 'is', null);

    if (profilesError) {
      console.error(`${ESC_LOG} error fetching recipients`, profilesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch recipients' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!adminProfiles || adminProfiles.length === 0) {
      console.warn(`${ESC_LOG} no recipients found`);
      return new Response(JSON.stringify({ message: 'No admin emails to notify' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    console.log(`${ESC_LOG} recipients loaded`, { count: adminProfiles.length });

    const dueDate = dueAt ? new Date(dueAt) : null;
    const formattedDueAt =
      dueDate && !Number.isNaN(dueDate.getTime())
        ? dueDate.toLocaleString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short',
          })
        : `Invalid due date (${String(dueAt)})`;

    const client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: {
          username: gmailUser,
          password: gmailAppPassword,
        },
      },
    });
    console.log(`${ESC_LOG} SMTP client created`);

    const results: { email: string; success: boolean; error?: string }[] = [];

    for (const admin of adminProfiles) {
      const recipientName = admin.full_name || admin.email?.split('@')[0] || 'Admin';
      const htmlBody = `
        <html>
          <body>
            <h2>A task has exceeded its SLA</h2>
            <p>Hi ${recipientName}, a staff task has passed its deadline and has been escalated.</p>
            <p><strong>${taskTitle}</strong></p>
            <p>Due: ${formattedDueAt}</p>
            <p>Task ID: ${taskId}</p>
            <p>Please review this task in ${appName}.</p>
          </body>
        </html>
      `;

      const textBody = [
        '[OVERDUE TASK]',
        `Task: ${taskTitle}`,
        `Due: ${formattedDueAt}`,
        `ID: ${taskId}`,
        '',
        `Please review in ${appName}.`,
      ].join('\n');

      try {
        await client.send({
          from: `${appName} <${gmailUser}>`,
          to: admin.email!,
          subject: `[Action Required] Overdue Task: "${taskTitle}"`,
          content: textBody,
          html: htmlBody,
        });
        console.log(`${ESC_LOG} email sent`, { to: admin.email });
        results.push({ email: admin.email!, success: true });
      } catch (sendErr) {
        console.error(`${ESC_LOG} email send failed`, { to: admin.email, error: String(sendErr) });
        results.push({ email: admin.email!, success: false, error: String(sendErr) });
      }
    }

    await client.close();
    console.log(`${ESC_LOG} SMTP closed`);

    return new Response(JSON.stringify({ sent: results }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error(`${ESC_LOG} unhandled error`, err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
