import { supabase } from './supabaseClient';
import { sendEscalationNotification } from './pushNotifications';

const ESC_LOG = '[Escalation]';

function isOverdueDueAt(dueAt: string | null | undefined, status: string): boolean {
  if (!dueAt || status === 'closed') return false;
  const t = new Date(dueAt).getTime();
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}

function isOverdueCustomTimer(
  customDurationSeconds: number | null | undefined,
  startedAt: string | null | undefined,
  status: string,
): boolean {
  if (!customDurationSeconds || !startedAt || status === 'closed') return false;
  const startMs = new Date(startedAt).getTime();
  if (Number.isNaN(startMs)) return false;
  const elapsedSec = Math.floor((Date.now() - startMs) / 1000);
  return elapsedSec > customDurationSeconds;
}

function getDeadlineForEmail(task: {
  due_at?: string | null;
  custom_duration_seconds?: number | null;
  started_at?: string | null;
}): string {
  if (task.custom_duration_seconds && task.started_at) {
    const startMs = new Date(task.started_at).getTime();
    if (!Number.isNaN(startMs)) {
      return new Date(startMs + task.custom_duration_seconds * 1000).toISOString();
    }
  }
  return task.due_at ?? '';
}

async function sendEscalationEmail(taskId: string, taskTitle: string, dueAt: string) {
  try {
    console.log(`${ESC_LOG} invoking send-escalation-email`, { taskId, taskTitle, dueAt });
    const { error } = await supabase.functions.invoke('send-escalation-email', {
      body: { taskId, taskTitle, dueAt },
    });
    if (error) {
      console.warn(`${ESC_LOG} send-escalation-email edge function error:`, error);
      return;
    }
    console.log(`${ESC_LOG} send-escalation-email invoke success`, { taskId });
  } catch (err) {
    console.warn(`${ESC_LOG} could not invoke send-escalation-email:`, err);
  }
}

/**
 * Escalate an overdue task to a supervisor or department head.
 * Called when task exceeds SLA (countdown time exhaustion).
 */
export async function escalateOverdueTask(task: {
  id: string;
  title: string;
  due_at: string | null;
  custom_duration_seconds?: number | null;
  started_at?: string | null;
  status: string;
  department: string | null;
  escalated_at?: string | null;
  escalated_to?: string | null;
}): Promise<boolean> {
  const overdue =
    isOverdueCustomTimer(task.custom_duration_seconds, task.started_at, task.status) ||
    isOverdueDueAt(task.due_at, task.status);
  console.log(`${ESC_LOG} escalateOverdueTask called`, {
    taskId: task.id,
    title: task.title,
    status: task.status,
    dueAt: task.due_at,
    customDurationSeconds: task.custom_duration_seconds ?? null,
    startedAt: task.started_at ?? null,
    overdue,
    escalatedAt: task.escalated_at ?? null,
  });

  if (!overdue || task.escalated_at) {
    console.log(`${ESC_LOG} skipped`, {
      taskId: task.id,
      reason: !overdue ? 'not_overdue_or_closed' : 'already_escalated',
    });
    return false;
  }

  const { data: supervisors, error: supervisorsError } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['supervisor', 'department_head', 'admin'])
    .limit(1);

  if (supervisorsError) {
    console.error(`${ESC_LOG} failed fetching supervisors`, supervisorsError);
    return false;
  }

  const escalateToId = supervisors?.[0]?.id ?? null;
  if (escalateToId) {
    console.log(`${ESC_LOG} supervisor selected`, { taskId: task.id, escalateToId });
  } else {
    console.warn(`${ESC_LOG} no supervisor found, will still escalate and email admins`, {
      taskId: task.id,
    });
  }

  const { data: updatedTask, error } = await supabase
    .from('tasks')
    .update({
      escalated_at: new Date().toISOString(),
      escalated_to: escalateToId,
    })
    .is('escalated_at', null)
    .eq('id', task.id)
    .select('id, escalated_at, escalated_to')
    .maybeSingle();

  if (error) {
    console.error(`${ESC_LOG} failed updating escalation fields`, error);
    return false;
  }
  if (!updatedTask) {
    console.log(`${ESC_LOG} no task updated (likely already escalated by another client)`, {
      taskId: task.id,
    });
    return false;
  }
  console.log(`${ESC_LOG} escalation fields updated`, updatedTask);

  if (escalateToId) {
    console.log(`${ESC_LOG} sending escalation push`, { taskId: task.id, escalateToId });
    await sendEscalationNotification(task.id, task.title, escalateToId);
    console.log(`${ESC_LOG} escalation push sent`, { taskId: task.id, escalateToId });
  } else {
    console.log(`${ESC_LOG} skipping escalation push, no supervisor id found`, {
      taskId: task.id,
    });
  }

  console.log(`${ESC_LOG} invoking escalation email edge function`, {
    taskId: task.id,
    title: task.title,
    dueAt: getDeadlineForEmail(task),
  });
  await sendEscalationEmail(task.id, task.title, getDeadlineForEmail(task));
  console.log(`${ESC_LOG} escalation flow complete`, { taskId: task.id });

  return true;
}
