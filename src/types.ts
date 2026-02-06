export type UserRole = 'staff' | 'supervisor' | 'department_head' | 'admin';

export type TaskStatus = 'open' | 'pending' | 'closed' | 'overdue';

export type TaskPriority = 'p1' | 'p2' | 'p3';

export type NotificationChannel = 'popup' | 'email' | 'both';

export type Profile = {
  id: string;
  staff_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  department_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Department = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  
  // Assignment - can be to user OR department
  assigned_to_user_id: string | null;
  assigned_to_department_id: string | null;
  created_by: string;
  
  // SLA/Timer
  due_at: string | null;
  sla_minutes: number | null; // SLA in minutes
  started_at: string | null;
  time_spent_seconds: number;
  
  // Supervisor approval
  requires_supervisor_approval: boolean;
  approved_by: string | null;
  approved_at: string | null;
  
  // Escalation
  escalated: boolean;
  escalated_at: string | null;
  escalated_to: string | null;
  
  created_at: string;
  updated_at: string;
};

export type SubTask = {
  id: string;
  parent_task_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigned_to: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Comment = {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type Attachment = {
  id: string;
  task_id: string;
  uploaded_by: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  created_at: string;
};

export type TaskReassignment = {
  id: string;
  task_id: string;
  from_user_id: string | null;
  from_department_id: string | null;
  to_user_id: string | null;
  to_department_id: string | null;
  reassigned_by: string;
  reason: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  task_id: string | null;
  title: string;
  message: string;
  channel: NotificationChannel;
  read: boolean;
  sent_at: string;
  read_at: string | null;
};

export type SupervisorMetric = {
  id: string;
  supervisor_id: string;
  period_start: string;
  period_end: string;
  tasks_supervised: number;
  tasks_approved: number;
  tasks_rejected: number;
  avg_approval_time_minutes: number | null;
  created_at: string;
};

// View types for reporting
export type TaskCompletionRate = {
  department_name: string;
  completed_tasks: number;
  total_tasks: number;
  completion_rate: number;
};

export type OverdueTask = Task & {
  assigned_to_name: string | null;
  department_name: string | null;
};

export type SupervisorPerformance = {
  supervisor_name: string;
  tasks_approved: number;
  tasks_escalated: number;
  avg_approval_time_minutes: number | null;
};

// Extended types with relations
export type TaskWithDetails = Task & {
  created_by_profile?: Profile;
  assigned_to_profile?: Profile;
  department?: Department;
  comments?: Comment[];
  attachments?: Attachment[];
  subtasks?: SubTask[];
  reassignment_history?: TaskReassignment[];
};

export type ProfileWithDepartment = Profile & {
  department?: Department;
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