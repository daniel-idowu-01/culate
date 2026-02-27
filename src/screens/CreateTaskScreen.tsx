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
import DateTimePicker from '@react-native-community/datetimepicker';
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
  const [dueAtDate, setDueAtDate] = useState<Date | null>(null);
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [customDurationSeconds, setCustomDurationSeconds] = useState<number | null>(null);
  const [durationHours, setDurationHours] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
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

    if (!dueAtDate) {
      newErrors.dueAt = 'Due date is required';
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
    setDueAtDate(dueDate);
    setErrors({ ...errors, dueAt: undefined });
  };

  const setDuration = (hours: number, minutes: number) => {
    const totalMinutes = hours * 60 + minutes;
    if (totalMinutes <= 0) {
      setCustomDurationSeconds(null);
      return;
    }
    setCustomDurationSeconds(totalMinutes * 60);
    setDurationHours(hours ? String(hours) : '');
    setDurationMinutes(minutes ? String(minutes) : '');
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
      due_at: (dueAtDate ?? new Date()).toISOString(),
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
          <Text style={styles.label}>Custom Timer Duration (optional)</Text>
          <Text style={styles.helperText}>
            Optional: Set a custom timer duration for tasks that need longer periods. Timer starts when task is opened.
          </Text>
          <View style={styles.durationRow}>
            <View style={styles.durationField}>
              <Text style={styles.durationLabel}>Hours</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                keyboardType="numeric"
                value={durationHours}
                onChangeText={(text) => {
                  const h = parseInt(text || '0', 10);
                  const m = parseInt(durationMinutes || '0', 10);
                  setDurationHours(text);
                  setDuration(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m);
                }}
              />
            </View>
            <View style={styles.durationField}>
              <Text style={styles.durationLabel}>Minutes</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                keyboardType="numeric"
                value={durationMinutes}
                onChangeText={(text) => {
                  const h = parseInt(durationHours || '0', 10);
                  const m = parseInt(text || '0', 10);
                  setDurationMinutes(text);
                  setDuration(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m);
                }}
              />
            </View>
          </View>
          {customDurationSeconds && (
            <Text style={styles.helperText}>
              Duration: {Math.floor(customDurationSeconds / 3600)}h {Math.floor((customDurationSeconds % 3600) / 60)}m
            </Text>
          )}
          <View style={styles.quickDurationContainer}>
            {[
              { label: '30 min', h: 0, m: 30 },
              { label: '1h', h: 1, m: 0 },
              { label: '2h', h: 2, m: 0 },
              { label: '4h', h: 4, m: 0 },
              { label: '8h', h: 8, m: 0 },
              { label: '1 day', h: 24, m: 0 },
            ].map((d) => (
              <TouchableOpacity
                key={d.label}
                style={styles.quickDurationButton}
                onPress={() => setDuration(d.h, d.m)}
              >
                <Text style={styles.quickDurationText}>{d.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.quickDurationButton}
              onPress={() => {
                setCustomDurationSeconds(null);
                setDurationHours('');
                setDurationMinutes('');
              }}
            >
              <Text style={styles.quickDurationText}>Clear</Text>
            </TouchableOpacity>
          </View>
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

        {/* Due Date Picker */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Due Date <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={[styles.input, styles.dropdown, errors.dueAt && styles.inputError]}
            onPress={() => setShowDuePicker(true)}
          >
            <Text style={styles.dropdownText}>
              {dueAtDate ? dueAtDate.toLocaleString() : 'Tap to pick date & time'}
            </Text>
            <Text style={styles.dropdownCaret}>▼</Text>
          </TouchableOpacity>
          {errors.dueAt && (
            <Text style={styles.errorText}>{errors.dueAt}</Text>
          )}
          <Text style={styles.helperText}>
            Choose a specific deadline or use quick buttons above.
          </Text>
          {showDuePicker && (
            <DateTimePicker
              value={dueAtDate ?? new Date()}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              {...(Platform.OS === 'ios'
                ? {
                    themeVariant: 'light' as const,
                    textColor: '#111827',
                  }
                : {})}
              onChange={(_event, selected) => {
                if (Platform.OS !== 'ios') setShowDuePicker(false);
                if (selected) {
                  setDueAtDate(selected);
                  if (errors.dueAt) setErrors({ ...errors, dueAt: undefined });
                }
              }}
            />
          )}
          {Platform.OS === 'ios' && showDuePicker ? (
            <TouchableOpacity
              style={[styles.quickDurationButton, { alignSelf: 'flex-start', marginTop: 10 }]}
              onPress={() => setShowDuePicker(false)}
            >
              <Text style={styles.quickDurationText}>Done</Text>
            </TouchableOpacity>
          ) : null}
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
  durationRow: {
    flexDirection: 'row',
    gap: 12,
  },
  durationField: {
    flex: 1,
  },
  durationLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
    fontWeight: '600',
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
