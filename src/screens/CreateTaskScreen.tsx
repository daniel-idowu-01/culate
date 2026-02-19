import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../api/supabaseClient';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { TaskPriority, TaskStatus, Profile } from '../types';
import { useAuth } from '../context/AuthContext';
import { updateTaskNotifications, sendTaskAssignedNotification } from '../api/pushNotifications';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'p1', label: 'P1', color: '#EF4444' },
  { value: 'p2', label: 'P2', color: '#F59E0B' },
  { value: 'p3', label: 'P3', color: '#10B981' },
];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'closed', label: 'Closed' },
];

const QUICK_DURATIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '4 hours', minutes: 240 },
  { label: '1 day', minutes: 1440 },
];

export const CreateTaskScreen = () => {
  const navigation = useNavigation<Nav>();
  const { session, role } = useAuth();
  const isAdmin = role === 'admin';
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('p2');
  const [status, setStatus] = useState<TaskStatus>('open');
  const [assignedTo, setAssignedTo] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showUserList, setShowUserList] = useState(false);
  const [department, setDepartment] = useState('Sales');
  const [dueAt, setDueAt] = useState('');
  const [customDurationSeconds, setCustomDurationSeconds] = useState<number | null>(null);
  const [customDurationInput, setCustomDurationInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{
    title?: string;
    dueAt?: string;
    assignedTo?: string;
  }>({});

  const validateForm = () => {
    const newErrors: { title?: string; dueAt?: string; assignedTo?: string } = {};

    if (!title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!dueAt.trim()) {
      newErrors.dueAt = 'Due date is required';
    } else if (isNaN(new Date(dueAt).getTime())) {
      newErrors.dueAt = 'Invalid date format (use ISO)';
    }

    if (!isAdmin && assignedTo.trim() && assignedTo.trim() !== session?.user.id) {
      newErrors.assignedTo = 'Only admins can assign tasks to other users';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const setQuickDuration = (minutes: number) => {
    const dueDate = new Date();
    dueDate.setMinutes(dueDate.getMinutes() + minutes);
    setDueAt(dueDate.toISOString());
    setErrors({ ...errors, dueAt: undefined });
  };

  useEffect(() => {
    const loadUsers = async () => {
      if (!session || !isAdmin) return;
      setUsersLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, staff_id, department, created_at')
        .order('created_at', { ascending: false });
      if (!error) {
        setUsers((data ?? []) as Profile[]);
      }
      setUsersLoading(false);
    };
    loadUsers();
  }, [session, isAdmin]);

  const handleCreate = async () => {
    if (!session) {
      Alert.alert('Error', 'You must be signed in to create tasks');
      return;
    }

    if (!validateForm()) {
      return;
    }

    setSaving(true);
    const userId = session.user.id;
    const assignee = isAdmin ? (assignedTo.trim() || userId) : userId;

    const closedPayload =
      status === 'closed' && isAdmin
        ? { closed_approved_by: userId, closed_at: new Date().toISOString() }
        : {};

    const basePayload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status,
      created_by: userId,
      assigned_to: assignee,
      due_at: new Date(dueAt).toISOString(),
      custom_duration_seconds: customDurationSeconds || null,
      ...closedPayload,
    };

    let payload: Record<string, unknown> = {
      ...basePayload,
      department: department.trim() || 'Sales',
    };

    let { data, error } = await supabase.from('tasks').insert(payload).select().single();

    if (error) {
      const message = error.message;
      if (message.includes('department')) {
        const { department: _department, ...rest } = payload;
        payload = rest;
      }
      if (message.includes('priority')) {
        const { priority: _priority, ...rest } = payload;
        payload = rest;
      }
      if (message.includes('status')) {
        const { status: _status, ...rest } = payload;
        payload = rest;
      }
      if (message.includes('closed_approved_by') || message.includes('closed_at')) {
        const { closed_approved_by: _approved, closed_at: _closedAt, ...rest } = payload;
        payload = rest;
      }
      const retry = await supabase.from('tasks').insert(payload).select().single();
      data = retry.data;
      error = retry.error;
    }

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    // Schedule push notifications around this task's deadline
    if (data?.id && data?.title && data?.status && data?.due_at) {
      await updateTaskNotifications(data.id, data.title, data.status, data.due_at);
    }

    // Notify assignee when task is assigned to them
    if (data?.assigned_to && data.assigned_to !== userId) {
      await sendTaskAssignedNotification(data.id, data.title, data.assigned_to);
    }

    Alert.alert(
      'Success! ✓',
      'Your task has been created',
      [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView 
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Create New Task</Text>
          <Text style={styles.headerSubtitle}>Fill in the details below to create a task</Text>
        </View>

        {/* Title Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Title <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, errors.title && styles.inputError]}
            placeholder="e.g., Follow up with client"
            placeholderTextColor="#9CA3AF"
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              if (errors.title) setErrors({ ...errors, title: undefined });
            }}
            maxLength={100}
          />
          {errors.title && (
            <Text style={styles.errorText}>{errors.title}</Text>
          )}
          <Text style={styles.charCount}>{title.length}/100</Text>
        </View>

        {/* Description Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Add more details about this task..."
            placeholderTextColor="#9CA3AF"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.charCount}>{description.length}/500</Text>
        </View>

        {/* Priority Selection */}
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
                <View 
                  style={[
                    styles.priorityDot,
                    { backgroundColor: priority === option.value ? '#FFFFFF' : option.color }
                  ]} 
                />
                <Text
                  style={[
                    styles.priorityText,
                    priority === option.value && styles.priorityTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Status Selection (Manager only) */}
        {isAdmin && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.statusContainer}>
              {STATUS_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.statusButton,
                    status === option.value && styles.statusButtonActive,
                  ]}
                  onPress={() => setStatus(option.value)}
                >
                  <Text
                    style={[
                      styles.statusText,
                      status === option.value && styles.statusTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Assignment */}
        {isAdmin && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Assign To</Text>
            <TouchableOpacity
              style={[styles.input, styles.dropdown]}
              onPress={() => setShowUserList((prev) => !prev)}
              disabled={usersLoading}
            >
              <Text style={styles.dropdownText}>
                {assignedTo
                  ? (() => {
                      const user = users.find((u) => u.id === assignedTo);
                      const email = user?.email ?? '';
                      const emailName = email.includes('@') ? email.split('@')[0] : '';
                      return user?.full_name || emailName || assignedTo;
                    })()
                  : 'Select a user'}
              </Text>
              <Text style={styles.dropdownCaret}>{showUserList ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {errors.assignedTo && (
              <Text style={styles.errorText}>{errors.assignedTo}</Text>
            )}
            {showUserList && (
              <View style={styles.dropdownList}>
                {usersLoading ? (
                  <Text style={styles.helperText}>Loading users...</Text>
                ) : users.length === 0 ? (
                  <Text style={styles.helperText}>No users found.</Text>
                ) : (
                  users.map((user) => (
                    <TouchableOpacity
                      key={user.id}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setAssignedTo(user.id);
                        setShowUserList(false);
                        if (errors.assignedTo) setErrors({ ...errors, assignedTo: undefined });
                      }}
                    >
                      <Text style={styles.dropdownItemText}>
                        {(user.full_name || (user.email ? user.email.split('@')[0] : null) || user.id.substring(0, 8) + '...')}
                        {' · '}
                        {user.role}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
            <Text style={styles.helperText}>Admins can assign tasks to any user.</Text>
          </View>
        )}

        {/* Department */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Department</Text>
          <TextInput
            style={styles.input}
            placeholder="Sales"
            placeholderTextColor="#9CA3AF"
            value={department}
            onChangeText={setDepartment}
            maxLength={50}
          />
          <Text style={styles.helperText}>
            If you haven’t applied the schema change yet, this field will be ignored.
          </Text>
        </View>

        {/* Custom Timer Duration */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Custom Timer Duration (hours)</Text>
          <Text style={styles.helperText}>
            Optional: Set a custom timer duration for tasks that need longer periods. Timer starts when task is opened.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 8 (for 8 hours)"
            keyboardType="numeric"
            value={customDurationInput}
            onChangeText={(text) => {
              setCustomDurationInput(text);
              const hours = parseInt(text, 10);
              if (!isNaN(hours) && hours > 0) {
                setCustomDurationSeconds(hours * 3600);
              } else {
                setCustomDurationSeconds(null);
              }
            }}
          />
          {customDurationSeconds && (
            <Text style={styles.helperText}>
              Duration: {Math.floor(customDurationSeconds / 3600)}h {Math.floor((customDurationSeconds % 3600) / 60)}m
            </Text>
          )}
        </View>

        {/* Quick Duration Buttons */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Quick Due Date</Text>
          <View style={styles.quickDurationContainer}>
            {QUICK_DURATIONS.map((duration) => (
              <TouchableOpacity
                key={duration.label}
                style={styles.quickDurationButton}
                onPress={() => setQuickDuration(duration.minutes)}
              >
                <Text style={styles.quickDurationText}>{duration.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Custom Due Date Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Due Date <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, errors.dueAt && styles.inputError]}
            placeholder="2026-02-05T18:00:00.000Z"
            placeholderTextColor="#9CA3AF"
            value={dueAt}
            onChangeText={(text) => {
              setDueAt(text);
              if (errors.dueAt) setErrors({ ...errors, dueAt: undefined });
            }}
          />
          {errors.dueAt && (
            <Text style={styles.errorText}>{errors.dueAt}</Text>
          )}
          <Text style={styles.helperText}>
            {dueAt && !errors.dueAt
              ? `Due: ${new Date(dueAt).toLocaleString()}`
              : 'ISO format or use quick buttons above'}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            disabled={saving}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.createButton, saving && styles.createButtonDisabled]}
            onPress={handleCreate}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={styles.createButtonText}>
              {saving ? 'Creating...' : 'Create Task'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: 20,
    backgroundColor: '#F9FAFB',
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#6B7280',
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    fontSize: 16,
    color: '#111827',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    marginTop: 6,
  },
  charCount: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
    marginTop: 4,
  },
  helperText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
  },
  priorityContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: {
    fontSize: 16,
    color: '#111827',
  },
  dropdownCaret: {
    fontSize: 12,
    color: '#6B7280',
  },
  dropdownList: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#374151',
  },
  statusContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  statusButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  statusTextActive: {
    color: '#FFFFFF',
  },
  priorityButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  priorityButtonActive: {
    borderWidth: 2,
  },
  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  priorityText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  priorityTextActive: {
    color: '#FFFFFF',
  },
  quickDurationContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickDurationButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  quickDurationText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 40,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  createButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  createButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
