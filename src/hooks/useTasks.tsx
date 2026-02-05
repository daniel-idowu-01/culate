import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient';
import type { Task } from '../types';
import { useAuth } from '../context/AuthContext';

type UseTasksOptions = {
  scope: 'all' | 'mine';
};

export const useTasks = ({ scope }: UseTasksOptions) => {
  const { session } = useAuth();

  const query = useQuery({
    queryKey: ['tasks', scope, session?.user.id],
    queryFn: async () => {
      if (!session) return [] as Task[];
      let q = supabase.from('tasks').select('*').order('due_at', { ascending: true });
      if (scope === 'mine') {
        q = q.eq('assigned_to', session.user.id);
      }
      const { data, error } = await q;
      if (error) {
        throw new Error(error.message);
      }
      return (data ?? []) as Task[];
    },
  });

  return {
    tasks: query.data ?? [],
    ...query,
  };
};
