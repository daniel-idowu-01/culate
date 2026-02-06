import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { supabase } from '../api/supabaseClient';
import type { Task, TaskStatus, TaskPriority, Lead } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../hooks/useLeads';

type TaskDetailRoute = RouteProp<RootStackParamList, 'TaskDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const formatRemaining = (dueAt: string | null) => {
  if (!dueAt) return { text: 'No deadline', isOverdue: false, isUrgent: false };
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const diffMs = due - now;
  const diffSec = Math.floor(diffMs / 1000);
  const isOverdue = diffSec < 0;
  const isUrgent = diffSec > 0 && diffSec < 3600;
  
  const sign = diffSec >= 0 ? '' : '-';
  const absSec = Math.abs(diffSec);
  const hours = Math.floor(absSec / 3600);
  const minutes = Math.floor((absSec % 3600) / 60);
  const seconds = absSec % 60;
  
  return {
    text: `${sign}${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
    isOverdue,
    isUrgent,
    hours,
    minutes,
    seconds,
  };
};

const formatTimeSpent = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}h ${minutes}m ${secs}s`;
};

const LeadOutcomeCard = ({ lead }: { lead: Lead }) => {
  const contact = [lead.contact_phone, lead.contact_email].filter(Boolean).join(' • ');
  return (
    <View style={styles.leadCard}>
      <Text style={styles.leadCardName}>{lead.name}</Text>
      {contact ? <Text style={styles.leadCardContact}>{contact}</Text> : null}
      <Text style={styles.leadCardSummary}>{lead.conversation_summary}</Text>
      <Text style={styles.leadCardDate}>
        {new Date(lead.created_at).toLocaleDateString()}
      </Text>
    </View>
  );
};

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'p1', label: 'Low', color: '#10B981' },
  { value: 'p2', label: 'Medium', color: '#F59E0B' },
  { value: 'p3', label: 'High', color: '#EF4444' },
];

export const TaskDetailScreen = () => {
  const route = useRoute<TaskDetailRoute>();
  const navigation = useNavigation<Nav>();
  const { role, session } = useAuth();
  
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('pending');
  const [priority, setPriority] = useState<TaskPriority>('p2');
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [timeInfo, setTimeInfo] = useState(formatRemaining(null));

  const canEditAll = role === 'admin';
  const canEditStatusOnly = role === 'staff';
  const isRunning = task?.started_at !== null;

  const { leads: taskLeads } = useLeads({
    scope: role === 'admin' ? 'all' : 'mine',
    taskId: task?.id ?? undefined,
  });

  useEffect(() => {
    const fetchTask = async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', route.params.taskId)
        .single();

      if (error) {
        Alert.alert('Error', error.message);
        navigation.goBack();
      } else {
        const t = data as Task;
        setTask(t);
        setTitle(t.title);
        setDescription(t.description ?? '');
        setStatus(t.status);
        setPriority(t.priority);
        setDueAt(t.due_at);
        setTimeInfo(formatRemaining(t.due_at));
      }
      setLoading(false);
    };

    fetchTask();
  }, [route.params.taskId]);

  useEffect(() => {
    const id = setInterval(() => {
      setTimeInfo(formatRemaining(dueAt));
    }, 1000);
    return () => clearInterval(id);
  }, [dueAt]);

  const handleSave = async () => {
    if (!task) return;
    setSaving(true);

    const updates: Partial<Task> = {};
    if (canEditAll) {
      updates.title = title;
      updates.description = description;
      updates.priority = priority;
      updates.due_at = dueAt;
    }
    if (canEditAll || canEditStatusOnly) {
      updates.status = status;
    }

    const { error, data } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', task.id)
      .select()
      .single();

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    const updated = data as Task;
    setTask(updated);
    Alert.alert('Success', 'Task updated successfully');
  };

  const handleStart = async () => {
    if (!task || !session) return;
    const now = new Date().toISOString();
    const { error, data } = await supabase
      .from('tasks')
      .update({ started_at: now, status: 'in_progress' })
      .eq('id', task.id)
      .select()
      .single();
    
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    
    const updated = data as Task;
    setTask(updated);
    setStatus(updated.status);
  };

  const handlePause = async () => {
    if (!task) return;
    const now = new Date();
    let total = task.time_spent_seconds;
    
    if (task.started_at) {
      const startedAtDate = new Date(task.started_at);
      const diffSec = Math.floor((now.getTime() - startedAtDate.getTime()) / 1000);
      total += diffSec;
    }
    
    const { error, data } = await supabase
      .from('tasks')
      .update({
        started_at: null,
        time_spent_seconds: total,
      })
      .eq('id', task.id)
      .select()
      .single();
    
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    
    const updated = data as Task;
    setTask(updated);
  };

  const handleComplete = async () => {
    if (!task) return;
    const now = new Date();
    let total = task.time_spent_seconds;
    
    if (task.started_at) {
      const startedAtDate = new Date(task.started_at);
      const diffSec = Math.floor((now.getTime() - startedAtDate.getTime()) / 1000);
      total += diffSec;
    }
    
    const { error, data } = await supabase
      .from('tasks')
      .update({
        started_at: null,
        time_spent_seconds: total,
        status: 'completed',
      })
      .eq('id', task.id)
      .select()
      .single();
    
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    
    const updated = data as Task;
    setTask(updated);
    setStatus(updated.status);
    
    Alert.alert('Completed! 🎉', 'Great job finishing this task!');
  };

  if (loading || !task) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading task...</Text>
      </View>
    );
  }

  const priorityConfig = PRIORITY_OPTIONS.find(p => p.value === priority);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Timer Card */}
      <View style={[
        styles.timerCard,
        timeInfo.isOverdue && styles.timerCardOverdue,
        timeInfo.isUrgent && styles.timerCardUrgent,
      ]}>
        <Text style={styles.timerLabel}>
          {timeInfo.isOverdue ? 'Overdue by' : 'Time Remaining'}
        </Text>
        <View style={styles.timerDisplay}>
          <View style={styles.timerSegment}>
            <Text style={[
              styles.timerNumber,
              timeInfo.isOverdue && styles.timerNumberOverdue,
            ]}>
              {(timeInfo.hours ?? 0).toString().padStart(2, '0')}
            </Text>
            <Text style={styles.timerUnit}>hours</Text>
          </View>
          <Text style={styles.timerColon}>:</Text>
          <View style={styles.timerSegment}>
            <Text style={[
              styles.timerNumber,
              timeInfo.isOverdue && styles.timerNumberOverdue,
            ]}>
              {(timeInfo.minutes ?? 0).toString().padStart(2, '0')}
            </Text>
            <Text style={styles.timerUnit}>mins</Text>
          </View>
          <Text style={styles.timerColon}>:</Text>
          <View style={styles.timerSegment}>
            <Text style={[
              styles.timerNumber,
              timeInfo.isOverdue && styles.timerNumberOverdue,
            ]}>
              {(timeInfo.seconds ?? 0).toString().padStart(2, '0')}
            </Text>
            <Text style={styles.timerUnit}>secs</Text>
          </View>
        </View>
        
        {task.time_spent_seconds > 0 && (
          <Text style={styles.timeSpent}>
            Time spent: {formatTimeSpent(task.time_spent_seconds)}
          </Text>
        )}
      </View>

      {/* Task Controls */}
      {(canEditAll || canEditStatusOnly) && (
        <View style={styles.controlsCard}>
          <TouchableOpacity
            style={[
              styles.controlButton,
              styles.startButton,
              isRunning && styles.controlButtonDisabled,
            ]}
            onPress={handleStart}
            disabled={isRunning || status === 'closed'}
          >
            <Text style={styles.controlButtonIcon}>▶</Text>
            <Text style={styles.controlButtonText}>Start</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.controlButton,
              styles.pauseButton,
              !isRunning && styles.controlButtonDisabled,
            ]}
            onPress={handlePause}
            disabled={!isRunning}
          >
            <Text style={styles.controlButtonIcon}>⏸</Text>
            <Text style={styles.controlButtonText}>Pause</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.controlButton,
              styles.completeButton,
              status === 'closed' && styles.controlButtonDisabled,
            ]}
            onPress={handleComplete}
            disabled={status === 'closed'}
          >
            <Text style={styles.controlButtonIcon}>✓</Text>
            <Text style={styles.controlButtonText}>Complete</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Task Details */}
      <View style={styles.detailsCard}>
        <View style={styles.statusRow}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              {status.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
          <View style={[styles.priorityBadge, { backgroundColor: priorityConfig?.color }]}>
            <Text style={styles.priorityBadgeText}>
              {priority.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Title */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={[styles.input, !canEditAll && styles.inputDisabled]}
            editable={canEditAll}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Description */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea, !canEditAll && styles.inputDisabled]}
            editable={canEditAll}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Priority (Admin only) */}
        {canEditAll && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Priority</Text>
            <View style={styles.priorityContainer}>
              {PRIORITY_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.priorityButton,
                    priority === option.value && styles.priorityButtonActive,
                    { borderColor: option.color },
                    priority === option.value && { backgroundColor: option.color },
                  ]}
                  onPress={() => setPriority(option.value)}
                >
                  <Text
                    style={[
                      styles.priorityButtonText,
                      priority === option.value && styles.priorityButtonTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Due Date (Admin only) */}
        {canEditAll && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Due Date (ISO format)</Text>
            <TextInput
              style={styles.input}
              value={dueAt ?? ''}
              onChangeText={(txt) => setDueAt(txt || null)}
              placeholder="2026-02-05T18:00:00.000Z"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        )}

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Task Outcome - Potential customers linked to this task */}
      {(canEditAll || canEditStatusOnly) && (
        <View style={styles.outcomeCard}>
          <View style={styles.outcomeHeader}>
            <Text style={styles.outcomeTitle}>Task Outcome</Text>
            <Text style={styles.outcomeSubtitle}>Potential customers from this task</Text>
            <TouchableOpacity
              style={styles.addLeadButton}
              onPress={() => navigation.navigate('AddLead', { taskId: task?.id })}
            >
              <Text style={styles.addLeadButtonText}>+ Add potential customer</Text>
            </TouchableOpacity>
          </View>
          {taskLeads.length === 0 ? (
            <View style={styles.outcomeEmpty}>
              <Text style={styles.outcomeEmptyIcon}>👤</Text>
              <Text style={styles.outcomeEmptyText}>No potential customers recorded yet</Text>
              <Text style={styles.outcomeEmptyHint}>Tap the button above to add contacts from this task</Text>
            </View>
          ) : (
            taskLeads.map((lead) => (
              <LeadOutcomeCard key={lead.id} lead={lead} />
            ))
          )}
        </View>
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  timerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  timerCardUrgent: {
    backgroundColor: '#FEF3C7',
  },
  timerCardOverdue: {
    backgroundColor: '#FEE2E2',
  },
  timerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  timerDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timerSegment: {
    alignItems: 'center',
  },
  timerNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  timerNumberOverdue: {
    color: '#DC2626',
  },
  timerUnit: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },
  timerColon: {
    fontSize: 40,
    fontWeight: '300',
    color: '#6B7280',
    marginTop: -8,
  },
  timeSpent: {
    marginTop: 16,
    fontSize: 14,
    color: '#6B7280',
  },
  controlsCard: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  startButton: {
    backgroundColor: '#3B82F6',
  },
  pauseButton: {
    backgroundColor: '#F59E0B',
  },
  completeButton: {
    backgroundColor: '#10B981',
  },
  controlButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  controlButtonIcon: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  controlButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E40AF',
    letterSpacing: 0.5,
  },
  priorityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  priorityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    fontSize: 15,
    color: '#111827',
  },
  inputDisabled: {
    backgroundColor: '#F9FAFB',
    color: '#6B7280',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  priorityContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  priorityButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  priorityButtonActive: {
    borderWidth: 2,
  },
  priorityButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  priorityButtonTextActive: {
    color: '#FFFFFF',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  outcomeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  outcomeHeader: {
    marginBottom: 16,
  },
  outcomeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  outcomeSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  addLeadButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  addLeadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  outcomeEmpty: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  outcomeEmptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  outcomeEmptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  outcomeEmptyHint: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  leadCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  leadCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  leadCardContact: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  leadCardSummary: {
    fontSize: 14,
    color: '#374151',
    marginTop: 8,
    lineHeight: 20,
  },
  leadCardDate: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
  },
});