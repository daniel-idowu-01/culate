import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useTasks } from '../hooks/useTasks';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient';
import type { Profile } from '../types';
import { Ionicons } from '@expo/vector-icons';

function isOverdue(dueAt: string, status: string) {
  if (!dueAt || status === 'closed') return false;
  return new Date(dueAt).getTime() < Date.now();
}

export const ReportsScreen = () => {
  const { tasks, refetch: refetchTasks, isLoading: tasksLoading } = useTasks({
    scope: 'all',
  });
  const { session } = useAuth();

  const { data: profiles = [], refetch: refetchProfiles } = useQuery({
    queryKey: ['profiles-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, department');
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const isLoading = tasksLoading;
  const onRefresh = () => {
    refetchTasks();
    refetchProfiles();
  };

  const closedCount = tasks.filter((t) => t.status === 'closed').length;
  const totalCount = tasks.length;
  const completionRate =
    totalCount > 0 ? Math.round((closedCount / totalCount) * 100) : 0;

  const overdueTasks = tasks.filter((t) => isOverdue(t.due_at, t.status));
  const overdueCount = overdueTasks.length;

  // Supervisor performance: tasks closed by each supervisor
  const closedBySupervisor = tasks
    .filter((t) => t.status === 'closed' && t.closed_approved_by)
    .reduce<Record<string, number>>((acc, t) => {
      const id = t.closed_approved_by!;
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});

  const supervisors = profiles.filter((p) =>
    ['supervisor', 'department_head', 'admin'].includes(p.role)
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={onRefresh}
          tintColor="#3B82F6"
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reports</Text>
        <Text style={styles.headerSubtitle}>Section 10: Reporting & Monitoring</Text>
      </View>

      {isLoading && tasks.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading reports...</Text>
        </View>
      ) : (
        <>
          {/* Task Completion Rate */}
          <View style={styles.reportCard}>
            <View style={styles.reportHeader}>
              <Ionicons name="checkmark-circle-outline" size={24} color="#3B82F6" />
              <Text style={styles.reportTitle}>Task Completion Rate</Text>
            </View>
            <Text style={styles.reportValue}>{completionRate}%</Text>
            <Text style={styles.reportDetail}>
              {closedCount} of {totalCount} tasks closed (Global)
            </Text>
          </View>

          {/* Overdue Tasks */}
          <View style={[styles.reportCard, overdueCount > 0 && styles.reportCardWarning]}>
            <View style={styles.reportHeader}>
              <Ionicons name="alert-circle-outline" size={24} color="#EF4444" />
              <Text style={styles.reportTitle}>Overdue Tasks</Text>
            </View>
            <Text style={[styles.reportValue, overdueCount > 0 && styles.reportValueWarning]}>
              {overdueCount}
            </Text>
            <Text style={styles.reportDetail}>
              Tasks that exceeded SLA (Global)
            </Text>
          </View>

          {/* Supervisor Performance */}
          <View style={styles.reportCard}>
            <View style={styles.reportHeader}>
              <Ionicons name="people-outline" size={24} color="#10B981" />
              <Text style={styles.reportTitle}>Supervisor Performance</Text>
            </View>
            <Text style={styles.reportDetail}>
              Tasks closed (approved) by each supervisor
            </Text>
            {supervisors.length === 0 ? (
              <Text style={styles.emptyText}>No supervisors in system</Text>
            ) : (
              supervisors.map((s) => (
                <View key={s.id} style={styles.supervisorRow}>
                  <Text style={styles.supervisorName} numberOfLines={1}>
                    {s.full_name || s.email?.split('@')[0] || s.id.slice(0, 8)}
                  </Text>
                  <Text style={styles.supervisorRole}>{s.role}</Text>
                  <Text style={styles.supervisorCount}>
                    {(closedBySupervisor[s.id] ?? 0)} closed
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  reportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  reportCardWarning: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  reportTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  reportValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  reportValueWarning: {
    color: '#EF4444',
  },
  reportDetail: {
    fontSize: 14,
    color: '#6B7280',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 12,
    fontStyle: 'italic',
  },
  supervisorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    marginTop: 8,
    gap: 8,
  },
  supervisorName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  supervisorRole: {
    fontSize: 12,
    color: '#9CA3AF',
    textTransform: 'capitalize',
  },
  supervisorCount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3B82F6',
  },
});
