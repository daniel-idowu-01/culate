import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient';
import type { SubTask, Comment, Department } from '../types';

// ===== Sub-tasks Hook =====
export const useSubTasks = (taskId: string) => {
  const queryClient = useQueryClient();

  const { data: subtasks = [], ...query } = useQuery({
    queryKey: ['subtasks', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subtasks')
        .select('*')
        .eq('parent_task_id', taskId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return (data || []) as SubTask[];
    },
  });

  const createSubTask = useMutation({
    mutationFn: async (input: { title: string; description?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('subtasks')
        .insert({
          parent_task_id: taskId,
          title: input.title,
          description: input.description || null,
          created_by: user.id,
          assigned_to: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as SubTask;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] });
    },
  });

  return {
    subtasks,
    createSubTask: createSubTask.mutateAsync,
    isCreating: createSubTask.isPending,
    ...query,
  };
};

// ===== Comments Hook =====
export const useComments = (taskId: string) => {
  const queryClient = useQueryClient();

  const { data: comments = [], ...query } = useQuery({
    queryKey: ['comments', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comments')
        .select('*, profiles:user_id(full_name, staff_id)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as (Comment & { profiles: { full_name: string; staff_id: string } })[];
    },
  });

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('comments')
        .insert({
          task_id: taskId,
          user_id: user.id,
          content,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as Comment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', taskId] });
    },
  });

  return {
    comments,
    addComment: addComment.mutateAsync,
    isAdding: addComment.isPending,
    ...query,
  };
};

// ===== Departments Hook =====
export const useDepartments = () => {
  const { data: departments = [], ...query } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return (data || []) as Department[];
    },
  });

  return {
    departments,
    ...query,
  };
};

// ===== User Profiles Hook (for assignment) =====
export const useProfiles = (departmentId?: string) => {
  const { data: profiles = [], ...query } = useQuery({
    queryKey: ['profiles', departmentId],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('*, department:department_id(name)')
        .order('full_name', { ascending: true });
      
      if (departmentId) {
        q = q.eq('department_id', departmentId);
      }
      
      const { data, error } = await q;
      
      if (error) throw error;
      return data || [];
    },
  });

  return {
    profiles,
    ...query,
  };
};

// ===== Notifications Hook =====
export const useNotifications = () => {
  const queryClient = useQueryClient();

  const { data: notifications = [], ...query } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('sent_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data || [];
    },
  });

  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({
          read: true,
          read_at: new Date().toISOString(),
        })
        .eq('id', notificationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('notifications')
        .update({
          read: true,
          read_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('read', false);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    markAsRead: markAsRead.mutateAsync,
    markAllAsRead: markAllAsRead.mutateAsync,
    ...query,
  };
};

// ===== Task with full details Hook =====
export const useTaskWithDetails = (taskId: string) => {
  const { data: task, ...query } = useQuery({
    queryKey: ['task-details', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          created_by_profile:created_by(full_name, staff_id, role),
          assigned_to_profile:assigned_to_user_id(full_name, staff_id, role),
          department:assigned_to_department_id(name),
          approved_by_profile:approved_by(full_name, staff_id)
        `)
        .eq('id', taskId)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  return {
    task,
    ...query,
  };
};