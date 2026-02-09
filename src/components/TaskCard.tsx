import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import type { Task } from '../types';

type Props = {
  task: Task;
  onPress: () => void;
  showAssignee?: boolean;
};

const formatRemaining = (dueAt: string | null) => {
  if (!dueAt) return { text: 'No deadline', isOverdue: false, isUrgent: false };
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const diffMs = due - now;
  const diffSec = Math.floor(diffMs / 1000);
  const isOverdue = diffSec < 0;
  const isUrgent = diffSec > 0 && diffSec < 3600; // Less than 1 hour

  if (isOverdue) {
    return { text: '00:00:00', isOverdue: true, isUrgent: false };
  }
  
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
  };
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'p1':
      return '#EF4444';
    case 'p2':
      return '#F59E0B';
    case 'p3':
      return '#10B981';
    default:
      return '#6B7280';
  }
};

const getStatusConfig = (status: string, isOverdue: boolean) => {
  if (isOverdue && status !== 'closed') {
    return { color: '#EF4444', bg: '#FEE2E2', icon: '!', label: 'overdue' };
  }

  switch (status) {
    case 'closed':
      return { color: '#10B981', bg: '#D1FAE5', icon: 'x', label: 'closed' };
    case 'open':
      return { color: '#3B82F6', bg: '#DBEAFE', icon: '>', label: 'open' };
    default:
      return { color: '#6B7280', bg: '#F3F4F6', icon: 'o', label: 'pending' };
  }
};

export const TaskCard: React.FC<Props> = ({ task, onPress, showAssignee }) => {
  const [timeInfo, setTimeInfo] = useState(formatRemaining(task.due_at));
  const scaleAnim = useState(new Animated.Value(1))[0];

  useEffect(() => {
    const id = setInterval(() => {
      setTimeInfo(formatRemaining(task.due_at));
    }, 1000);
    return () => clearInterval(id);
  }, [task.due_at]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  const statusConfig = getStatusConfig(task.status, timeInfo.isOverdue);
  const priorityColor = getPriorityColor(task.priority);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
        <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />

        <View style={styles.cardContent}>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={2}>
              {task.title}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
              <Text style={styles.statusIcon}>{statusConfig.icon}</Text>
              <Text style={[styles.statusText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>
          </View>

          {task.description && (
            <Text style={styles.description} numberOfLines={2}>
              {task.description}
            </Text>
          )}

          <View style={styles.metaRow}>
            <View
              style={[
                styles.timerContainer,
                timeInfo.isOverdue && styles.timerOverdue,
                timeInfo.isUrgent && styles.timerUrgent,
              ]}
            >
              <Text style={styles.timerIcon}>
                {timeInfo.isOverdue ? '!' : timeInfo.isUrgent ? '~' : '.'}
              </Text>
              <Text
                style={[
                  styles.timerText,
                  timeInfo.isOverdue && styles.timerTextOverdue,
                  timeInfo.isUrgent && styles.timerTextUrgent,
                ]}
              >
                {timeInfo.text}
              </Text>
            </View>

            <View style={styles.priorityContainer}>
              <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
              <Text style={styles.priorityText}>
                {task.priority ? task.priority.toUpperCase() : 'N/A'}
              </Text>
            </View>
          </View>

          {showAssignee && (
            <View style={styles.assigneeRow}>
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {task.assigned_to.substring(0, 2).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.assigneeText}>
                Assigned to: {task.assigned_to.substring(0, 8)}...
              </Text>
            </View>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: 'hidden',
  },
  priorityBar: {
    height: 4,
    width: '100%',
  },
  cardContent: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 24,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  statusIcon: {
    fontSize: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  timerUrgent: {
    backgroundColor: '#FEF3C7',
  },
  timerOverdue: {
    backgroundColor: '#FEE2E2',
  },
  timerIcon: {
    fontSize: 14,
  },
  timerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    fontVariant: ['tabular-nums'],
  },
  timerTextUrgent: {
    color: '#D97706',
  },
  timerTextOverdue: {
    color: '#DC2626',
  },
  priorityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 8,
  },
  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  assigneeText: {
    fontSize: 13,
    color: '#6B7280',
  },
});
