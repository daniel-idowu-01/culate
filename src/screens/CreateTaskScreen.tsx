import React, { useState } from 'react';
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
import type { TaskPriority } from '../types';
import { useAuth } from '../context/AuthContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: '#10B981' },
  { value: 'medium', label: 'Medium', color: '#F59E0B' },
  { value: 'high', label: 'High', color: '#EF4444' },
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
  const { session } = useAuth();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueAt, setDueAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; dueAt?: string }>({});

  const validateForm = () => {
    const newErrors: { title?: string; dueAt?: string } = {};

    if (!title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (dueAt && isNaN(new Date(dueAt).getTime())) {
      newErrors.dueAt = 'Invalid date format';
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
    
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        created_by: userId,
        assigned_to: userId,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
      })
      .select()
      .single();

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
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
          <Text style={styles.headerSubtitle}>
            Fill in the details below to create a task
          </Text>
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
          <Text style={styles.label}>Or Set Custom Date</Text>
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