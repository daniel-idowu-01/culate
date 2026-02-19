import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import type { Task } from '../types';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

type UseTasksOptions = {
  scope: 'all' | 'mine';
};

export const useTasks = ({ scope }: UseTasksOptions) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['tasks', scope, session?.user.id],
    queryFn: async () => {
      if (!session) return [] as Task[];
      let q = supabase.from('tasks').select('*').order('due_at', { ascending: true });
      if (scope === 'mine') {
        // First get tasks assigned directly
        const { data: directTasks, error: directError } = await supabase
          .from('tasks')
          .select('*')
          .eq('assigned_to', session.user.id);
        
        // Then get tasks assigned via task_assignees
        const { data: assigneeTasks, error: assigneeError } = await supabase
          .from('task_assignees')
          .select('task_id')
          .eq('user_id', session.user.id);
        
        if (assigneeError || directError) {
          throw new Error(assigneeError?.message || directError?.message || 'Failed to fetch tasks');
        }
        
        const assigneeTaskIds = (assigneeTasks ?? []).map(ta => ta.task_id);
        const allTaskIds = [
          ...(directTasks ?? []).map(t => t.id),
          ...assigneeTaskIds
        ];
        
        if (allTaskIds.length === 0) {
          return [] as Task[];
        }
        
        // Fetch all tasks
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .in('id', allTaskIds)
          .order('due_at', { ascending: true });
        
        if (error) {
          throw new Error(error.message);
        }
        return (data ?? []) as Task[];
      }
      const { data, error } = await q;
      if (error) {
        throw new Error(error.message);
      }
      return (data ?? []) as Task[];
    },
  });

  // Set up real-time subscription for instant updates
  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel(`tasks-changes-${scope}-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
        },
        (payload) => {
          // Invalidate and refetch tasks when changes occur
          queryClient.invalidateQueries({ queryKey: ['tasks', scope, session.user.id] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_assignees',
        },
        (payload) => {
          // Also invalidate when team assignments change
          queryClient.invalidateQueries({ queryKey: ['tasks', scope, session.user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, scope, queryClient]);

  return {
    tasks: query.data ?? [],
    ...query,
  };
};
