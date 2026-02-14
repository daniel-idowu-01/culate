import { supabase } from './supabaseClient';
import { sendEscalationNotification } from './pushNotifications';

function isOverdue(dueAt: string, status: string): boolean {
  if (!dueAt || status === 'closed') return false;
  return new Date(dueAt).getTime() < Date.now();
}

/**
 * Escalate an overdue task to a supervisor or department head.
 * Called when task exceeds SLA (countdown time exhaustion).
 */
export async function escalateOverdueTask(task: {
  id: string;
  title: string;
  due_at: string;
  status: string;
  department: string | null;
  escalated_at: string | null;
  escalated_to: string | null;
}): Promise<boolean> {
  if (!isOverdue(task.due_at, task.status) || task.escalated_at) {
    return false;
  }

  const { data: supervisors } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['supervisor', 'department_head', 'admin'])
    .limit(1);

  const escalateToId = supervisors?.[0]?.id;
  if (!escalateToId) {
    console.warn('No supervisor found to escalate task', task.id);
    return false;
  }

  const { error } = await supabase
    .from('tasks')
    .update({
      escalated_at: new Date().toISOString(),
      escalated_to: escalateToId,
    })
    .eq('id', task.id);

  if (error) {
    console.error('Failed to escalate task:', error);
    return false;
  }

  await sendEscalationNotification(task.id, task.title, escalateToId);

  return true;
}
