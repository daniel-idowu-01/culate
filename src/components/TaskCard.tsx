import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { Task } from '../types';

type Props = {
  task: Task;
  onPress: () => void;
  showAssignee?: boolean;
};

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

export const TaskCard: React.FC<Props> = ({ task, onPress, showAssignee }) => {
  const [label, setLabel] = useState(formatRemaining(task.due_at));

  useEffect(() => {
    const id = setInterval(() => {
      setLabel(formatRemaining(task.due_at));
    }, 1000);
    return () => clearInterval(id);
  }, [task.due_at]);

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{task.title}</Text>
        <Text style={[styles.badge, styles[task.status]]}>{task.status}</Text>
      </View>
      <Text style={styles.timer}>Time left: {label}</Text>
      {showAssignee && (
        <Text style={styles.meta}>Assignee: {task.assigned_to}</Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    textTransform: 'capitalize',
    color: '#fff',
  },
  pending: {
    backgroundColor: '#999',
  },
  in_progress: {
    backgroundColor: '#007AFF',
  },
  completed: {
    backgroundColor: '#34C759',
  },
  overdue: {
    backgroundColor: '#FF3B30',
  },
  timer: {
    marginTop: 4,
    fontSize: 13,
    color: '#555',
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    color: '#777',
  },
});

