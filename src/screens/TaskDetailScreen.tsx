import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Button, TextInput, Alert, ScrollView } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { supabase } from '../api/supabaseClient';
import type { Task, TaskStatus } from '../types';
import { useAuth } from '../context/AuthContext';

type TaskDetailRoute = RouteProp<RootStackParamList, 'TaskDetail'>;

const formatRemaining = (dueAt: string | null) => {
  if (!dueAt) return 'No due time';
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const diffMs = due - now;
  const diffSec = Math.floor(diffMs / 1000);
  const sign = diffSec >= 0 ? '' : '-';
  const absSec = Math.abs(diffSec);
  const hours = Math.floor(absSec / 3600);
  const minutes = Math.floor((absSec % 3600) / 60);
  const seconds = absSec % 60;
  return `${sign}${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const TaskDetailScreen = () => {
  const route = useRoute<TaskDetailRoute>();
  const { role, session } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('pending');
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [timerLabel, setTimerLabel] = useState('');

  const canEditAll = role === 'admin';
  const canEditStatusOnly = role === 'direct_sales_associate';

  useEffect(() => {
    const fetchTask = async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', route.params.taskId)
        .single();

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        const t = data as Task;
        setTask(t);
        setTitle(t.title);
        setDescription(t.description ?? '');
        setStatus(t.status);
        setDueAt(t.due_at);
        setTimerLabel(formatRemaining(t.due_at));
      }
      setLoading(false);
    };

    fetchTask();
  }, [route.params.taskId]);

  useEffect(() => {
    const id = setInterval(() => {
      setTimerLabel(formatRemaining(dueAt));
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
    Alert.alert('Saved', 'Task updated');
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

  const handlePauseOrComplete = async (mode: 'pause' | 'complete') => {
    if (!task) return;
    const now = new Date();
    let total = task.time_spent_seconds;
    if (task.started_at) {
      const startedAtDate = new Date(task.started_at);
      const diffSec = Math.floor((now.getTime() - startedAtDate.getTime()) / 1000);
      total += diffSec;
    }
    const newStatus: TaskStatus = mode === 'complete' ? 'completed' : 'in_progress';
    const { error, data } = await supabase
      .from('tasks')
      .update({
        started_at: mode === 'pause' ? null : task.started_at,
        time_spent_seconds: total,
        status: newStatus,
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
  };

  if (loading || !task) {
    return (
      <View style={styles.center}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        editable={canEditAll}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        editable={canEditAll}
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Text style={styles.label}>Status: {status}</Text>

      <Text style={styles.label}>Due at (ISO string)</Text>
      <TextInput
        style={styles.input}
        editable={canEditAll}
        value={dueAt ?? ''}
        onChangeText={(txt) => setDueAt(txt || null)}
        placeholder="e.g. 2026-02-05T18:00:00.000Z"
      />

      <Text style={styles.timer}>Time left: {timerLabel}</Text>

      <View style={styles.buttonRow}>
        {(canEditAll || canEditStatusOnly) && (
          <>
            <Button title="Start" onPress={handleStart} />
            <Button title="Pause" onPress={() => handlePauseOrComplete('pause')} />
            <Button title="Complete" onPress={() => handlePauseOrComplete('complete')} />
          </>
        )}
      </View>

      <View style={styles.saveRow}>
        <Button title={saving ? 'Saving...' : 'Save'} onPress={handleSave} disabled={saving} />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    padding: 16,
  },
  label: {
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  timer: {
    marginTop: 8,
    fontSize: 14,
    color: '#555',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  saveRow: {
    marginTop: 24,
  },
});

