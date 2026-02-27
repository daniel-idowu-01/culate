import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const LOG = '[CheckOverdueTasks]';

type Task = {
  id: string;
  title: string;
  status: string;
  department: string | null;
  due_at: string | null;
  custom_duration_seconds: number | null;
  started_at: string | null;
  escalated_at: string | null;
  escalated_to: string | null;
};

function isOverdueDueAt(dueAt: string | null, status: string): boolean {
  if (!dueAt || status === 'closed') return false;
  const t = new Date(dueAt).getTime();
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}

function isOverdueCustom(
  customDurationSeconds: number | null,
  startedAt: string | null,
  status: string,
): boolean {
  if (!customDurationSeconds || !startedAt || status === 'closed') return false;
  const startMs = new Date(startedAt).getTime();
  if (Number.isNaN(startMs)) return false;
  const elapsedSec = Math.floor((Date.now() - startMs) / 1000);
  return elapsedSec > customDurationSeconds;
}

function getDeadlineForEmail(task: Task): string {
  if (task.custom_duration_seconds && task.started_at) {
    const startMs = new Date(task.started_at).getTime();
    if (!Number.isNaN(startMs)) {
      return new Date(startMs + task.custom_duration_seconds * 1000).toISOString();
    }
  }
  return task.due_at ?? '';
}

async function sendEmailsForTask(
  supabase: ReturnType<typeof createClient>,
  task: Task,
) {
  const gmailUser = Deno.env.get('GMAIL_USER');
  const gmailAppPassword = Deno.env.get('GMAIL_APP_PASSWORD');
  const appName = Deno.env.get('APP_NAME') ?? 'Sales Task Tracker';

  if (!gmailUser || !gmailAppPassword) {
    console.error(`${LOG} missing GMAIL_USER or GMAIL_APP_PASSWORD`);
    return;
  }

  const { data: admins, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('role', ['admin', 'supervisor', 'department_head'])
    .not('email', 'is', null);

  if (profilesError) {
    console.error(`${LOG} error fetching recipients`, profilesError);
    return;
  }
  if (!admins || admins.length === 0) {
    console.warn(`${LOG} no admin profiles with email`);
    return;
  }

  const deadlineIso = getDeadlineForEmail(task);
  const dueDate = deadlineIso ? new Date(deadlineIso) : null;
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
      : `Invalid due date (${String(deadlineIso)})`;

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
  console.log(`${LOG} SMTP client created`);

  for (const admin of admins) {
    const recipientName = admin.full_name || admin.email?.split('@')[0] || 'Admin';
    const htmlBody = `
      <html>
        <body>
          <h2>A task has exceeded its SLA</h2>
          <p>Hi ${recipientName}, a staff task has passed its deadline and has been escalated.</p>
          <p><strong>${task.title}</strong></p>
          <p>Due: ${formattedDueAt}</p>
          <p>Task ID: ${task.id}</p>
          <p>Please review this task in ${appName}.</p>
        </body>
      </html>
    `;
    const textBody = [
      '[OVERDUE TASK]',
      `Task: ${task.title}`,
      `Due: ${formattedDueAt}`,
      `ID: ${task.id}`,
      '',
      `Please review in ${appName}.`,
    ].join('\n');

    try {
      await client.send({
        from: `${appName} <${gmailUser}>`,
        to: admin.email!,
        subject: `[Action Required] Overdue Task: "${task.title}"`,
        content: textBody,
        html: htmlBody,
      });
      console.log(`${LOG} email sent`, { to: admin.email });
    } catch (err) {
      console.error(`${LOG} email send failed`, { to: admin.email, error: String(err) });
    }
  }

  await client.close();
  console.log(`${LOG} SMTP closed`);
}

serve(async (_req: Request) => {
  const LOG_PREFIX = '[CheckOverdueTasks]';
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    console.error(`${LOG_PREFIX} missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
    return new Response(
      JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  console.log(`${LOG} run start`);

  const supabase = createClient(url, key);

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select(
      'id, title, status, department, due_at, custom_duration_seconds, started_at, escalated_at, escalated_to',
    )
    .neq('status', 'closed')
    .is('escalated_at', null)
    .limit(1000);

  if (error) {
    console.error(`${LOG} error loading tasks`, error);
    return new Response(JSON.stringify({ error: 'failed to load tasks' }), {
      status: 500,
    });
  }

  const overdueTasks: Task[] = (tasks ?? []).filter((t) =>
    isOverdueCustom(t.custom_duration_seconds, t.started_at, t.status) ||
    isOverdueDueAt(t.due_at, t.status),
  ) as Task[];

  console.log(`${LOG} overdue tasks found`, { count: overdueTasks.length });

  if (overdueTasks.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  const { data: supervisors, error: supError } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['supervisor', 'department_head', 'admin'])
    .limit(1);

  if (supError) {
    console.error(`${LOG} error fetching supervisors`, supError);
  }

  const escalateToId = supervisors?.[0]?.id ?? null;

  let processed = 0;
  for (const task of overdueTasks) {
    const { data: updated, error: updError } = await supabase
      .from('tasks')
      .update({
        escalated_at: new Date().toISOString(),
        escalated_to: escalateToId,
      })
      .is('escalated_at', null)
      .eq('id', task.id)
      .select('id, escalated_at, escalated_to')
      .maybeSingle();

    if (updError) {
      console.error(`${LOG} failed updating task`, { taskId: task.id, error: updError });
      continue;
    }
    if (!updated) {
      console.log(`${LOG} task already escalated by another process`, { taskId: task.id });
      continue;
    }

    console.log(`${LOG} escalated`, updated);
    await sendEmailsForTask(supabase, task);
    processed += 1;
  }

  return new Response(JSON.stringify({ processed }), { status: 200 });
});

