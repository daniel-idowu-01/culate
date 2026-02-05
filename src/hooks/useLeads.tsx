import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient';
import type { Lead } from '../types';
import { useAuth } from '../context/AuthContext';

type UseLeadsOptions = {
  scope: 'all' | 'mine';
  taskId?: string | null;
};

export const useLeads = ({ scope, taskId }: UseLeadsOptions) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['leads', scope, session?.user.id, taskId ?? undefined],
    queryFn: async () => {
      if (!session) return [] as Lead[];
      let q = supabase.from('leads').select('*').order('created_at', { ascending: false });
      if (scope === 'mine') {
        q = q.eq('recorded_by', session.user.id);
      }
      if (taskId) {
        q = q.eq('task_id', taskId);
      }
      const { data, error } = await q;
      if (error) {
        throw new Error(error.message);
      }
      return (data ?? []) as Lead[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: {
      name: string;
      contact_phone: string | null;
      contact_email: string | null;
      conversation_summary: string;
      task_id?: string | null;
    }) => {
      if (!session) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('leads')
        .insert({
          name: input.name,
          contact_phone: input.contact_phone || null,
          contact_email: input.contact_email || null,
          conversation_summary: input.conversation_summary,
          task_id: input.task_id ?? null,
          recorded_by: session.user.id,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Lead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  return {
    leads: query.data ?? [],
    createLead: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    ...query,
  };
};
