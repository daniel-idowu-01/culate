export type UserRole = 'admin' | 'direct_sales_associate';

export type Profile = {
  id: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
};

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

export type TaskPriority = 'low' | 'medium' | 'high';

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  created_by: string;
  assigned_to: string;
  due_at: string | null;
  started_at: string | null;
  time_spent_seconds: number;
  created_at: string;
  updated_at: string;
};

export type Lead = {
  id: string;
  task_id: string | null;
  name: string;
  contact_phone: string | null;
  contact_email: string | null;
  conversation_summary: string;
  recorded_by: string;
  created_at: string;
};

