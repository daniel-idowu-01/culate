export type UserRole = 'admin' | 'department_head' | 'supervisor' | 'staff';

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  staff_id: string | null;
  department: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskStatus = 'open' | 'pending' | 'closed';

export type TaskPriority = 'p1' | 'p2' | 'p3';

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  created_by: string;
  assigned_to: string;
  department: string | null;
  due_at: string;
  started_at: string | null;
  time_spent_seconds: number;
  closed_approved_by: string | null;
  closed_at: string | null;
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

export type Department = {
  id: string;
  name: string;
  created_at: string;
};

export type TaskComment = {
  id: string;
  task_id: string;
  body: string;
  created_by: string;
  created_at: string;
};

export type TaskAttachment = {
  id: string;
  task_id: string;
  file_name: string;
  file_url: string;
  mime_type: string | null;
  uploaded_by: string;
  created_at: string;
};

export type TaskContact = {
  id: string;
  task_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
};
