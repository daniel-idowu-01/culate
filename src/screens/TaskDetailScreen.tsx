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
  Image,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { supabase } from '../api/supabaseClient';
import type {
  Task,
  TaskStatus,
  TaskPriority,
  Lead,
  TaskComment,
  TaskAttachment,
  TaskContact,
  Profile,
} from '../types';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../hooks/useLeads';
import * as DocumentPicker from 'expo-document-picker';

type TaskDetailRoute = RouteProp<RootStackParamList, 'TaskDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const formatRemaining = (dueAt: string | null, status: TaskStatus) => {
  if (status === 'closed') {
    return { text: 'Closed', isOverdue: false, isUrgent: false, hours: 0, minutes: 0, seconds: 0 };
  }
  if (!dueAt) return { text: 'No deadline', isOverdue: false, isUrgent: false };
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const diffMs = due - now;
  const diffSec = Math.floor(diffMs / 1000);
  const isOverdue = diffSec < 0;
  const isUrgent = diffSec > 0 && diffSec < 3600;
  
  if (isOverdue) {
    return {
      text: '00:00:00',
      isOverdue: true,
      isUrgent: false,
      hours: 0,
      minutes: 0,
      seconds: 0,
    };
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
  { value: 'p1', label: 'P1', color: '#EF4444' },
  { value: 'p2', label: 'P2', color: '#F59E0B' },
  { value: 'p3', label: 'P3', color: '#10B981' },
];

export const TaskDetailScreen = () => {
  const route = useRoute<TaskDetailRoute>();
  const navigation = useNavigation<Nav>();
  const { role, session } = useAuth();
  const isManager = role === 'admin' || role === 'supervisor' || role === 'department_head';
  
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('open');
  const [priority, setPriority] = useState<TaskPriority>('p2');
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState('');
  const [department, setDepartment] = useState('Sales');
  const [timeInfo, setTimeInfo] = useState(formatRemaining(null, 'open'));
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [contacts, setContacts] = useState<TaskContact[]>([]);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactNotes, setContactNotes] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [commentSaving, setCommentSaving] = useState(false);
  const [attachmentSaving, setAttachmentSaving] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showUserList, setShowUserList] = useState(false);

  const canEditAll = isManager;
  const isRunning = task?.started_at !== null;
  const canManageContacts =
    !!session &&
    !!task &&
    (session.user.id === task.assigned_to ||
      session.user.id === task.created_by ||
      isManager);

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
        setAssignedTo(t.assigned_to);
        setDepartment(t.department ?? 'Sales');
        setTimeInfo(formatRemaining(t.due_at, t.status));
      }
      setLoading(false);
    };

    fetchTask();
  }, [route.params.taskId]);

  const fetchComments = async (taskId: string) => {
    setCommentsLoading(true);
    const { data, error } = await supabase
      .from('task_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Error loading comments', error.message);
    } else {
      setComments((data ?? []) as TaskComment[]);
    }
    setCommentsLoading(false);
  };

  const fetchUsers = async () => {
    if (!isManager) return;
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

  const fetchAttachments = async (taskId: string) => {
    setAttachmentsLoading(true);
    const { data, error } = await supabase
      .from('task_attachments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Error loading attachments', error.message);
    } else {
      setAttachments((data ?? []) as TaskAttachment[]);
    }
    setAttachmentsLoading(false);
  };

  const fetchContacts = async (taskId: string) => {
    setContactsLoading(true);
    const { data, error } = await supabase
      .from('task_contacts')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Error loading contacts', error.message);
    } else {
      setContacts((data ?? []) as TaskContact[]);
    }
    setContactsLoading(false);
  };

  useEffect(() => {
    if (!task?.id) return;
    fetchComments(task.id);
    fetchAttachments(task.id);
    fetchContacts(task.id);
  }, [task?.id]);

  useEffect(() => {
    fetchUsers();
  }, [isManager]);

  useEffect(() => {
    const id = setInterval(() => {
      setTimeInfo(formatRemaining(dueAt, status));
    }, 1000);
    return () => clearInterval(id);
  }, [dueAt, status]);

  const handleAddComment = async () => {
    if (!task || !session || !commentText.trim()) return;
    setCommentSaving(true);
    const { data, error } = await supabase
      .from('task_comments')
      .insert({
        task_id: task.id,
        body: commentText.trim(),
        created_by: session.user.id,
      })
      .select()
      .single();
    setCommentSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setComments((prev) => [data as TaskComment, ...prev]);
    setCommentText('');
  };

  const handleAddAttachment = async () => {
    if (!task || !session) return;
    setAttachmentSaving(true);
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets || result.assets.length === 0) {
      setAttachmentSaving(false);
      return;
    }

    const file = result.assets[0];
    const fileName = file.name ?? `attachment-${Date.now()}`;
    const path = `${task.id}/${Date.now()}-${fileName}`;

    try {
      const response = await fetch(file.uri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from('task-attachments')
        .upload(path, blob, {
          contentType: file.mimeType ?? 'application/octet-stream',
          upsert: false,
        });
      if (uploadError) {
        throw uploadError;
      }

      const { data: publicData } = supabase.storage
        .from('task-attachments')
        .getPublicUrl(path);
      const fileUrl = publicData.publicUrl;

      const { data, error } = await supabase
        .from('task_attachments')
        .insert({
          task_id: task.id,
          file_name: fileName,
          file_url: fileUrl,
          mime_type: file.mimeType ?? null,
          uploaded_by: session.user.id,
        })
        .select()
        .single();
      if (error) throw error;
      setAttachments((prev) => [data as TaskAttachment, ...prev]);
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message ?? 'Unable to upload attachment');
    } finally {
      setAttachmentSaving(false);
    }
  };

  const handleAddContact = async () => {
    if (!task || !session) return;
    if (!contactName.trim() || (!contactPhone.trim() && !contactEmail.trim())) {
      Alert.alert('Missing info', 'Provide a name and at least one contact detail.');
      return;
    }
    setContactSaving(true);
    const { data, error } = await supabase
      .from('task_contacts')
      .insert({
        task_id: task.id,
        name: contactName.trim(),
        phone: contactPhone.trim() || null,
        email: contactEmail.trim() || null,
        notes: contactNotes.trim() || null,
        created_by: session.user.id,
      })
      .select()
      .single();
    setContactSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setContacts((prev) => [data as TaskContact, ...prev]);
    setContactName('');
    setContactPhone('');
    setContactEmail('');
    setContactNotes('');
  };

  const handleSave = async () => {
    if (!task) return;
    setSaving(true);

    const updates: Partial<Task> = {};
    if (canEditAll) {
      updates.title = title;
      updates.description = description;
      updates.priority = priority;
      updates.due_at = dueAt;
      updates.assigned_to = assignedTo;
      updates.department = department;
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

  const handleOpen = async () => {
    if (!task || !session) return;
    const now = new Date().toISOString();
    const { error, data } = await supabase
      .from('tasks')
      .update({ started_at: now, status: 'open' })
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

  const handlePending = async () => {
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
        status: 'pending',
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

  const handleClose = async () => {
    if (!task || !session) return;
    if (!isManager) {
      Alert.alert('Approval Required', 'Only supervisors or department heads can close tasks.');
      return;
    }
    const confirm = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Close Task',
        'This will mark the task as closed and record your approval.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Close', style: 'destructive', onPress: () => resolve(true) },
        ]
      );
    });
    if (!confirm) return;
    const now = new Date();
    let total = task.time_spent_seconds;
    
    if (task.started_at) {
      const startedAtDate = new Date(task.started_at);
      const diffSec = Math.floor((now.getTime() - startedAtDate.getTime()) / 1000);
      total += diffSec;
    }
    
    let { error, data } = await supabase
      .from('tasks')
      .update({
        started_at: null,
        time_spent_seconds: total,
        status: 'closed',
        closed_approved_by: session.user.id,
        closed_at: now.toISOString(),
      })
      .eq('id', task.id)
      .select()
      .single();

    if (error && (error.message.includes('closed_approved_by') || error.message.includes('closed_at'))) {
      const retry = await supabase
        .from('tasks')
        .update({
          started_at: null,
          time_spent_seconds: total,
          status: 'closed',
        })
        .eq('id', task.id)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }
    
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    
    const updated = data as Task;
    setTask(updated);
    setStatus(updated.status);
    
    Alert.alert('Closed', 'Task closed with supervisor approval.');
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
      {isManager && (
        <View style={styles.controlsCard}>
          <TouchableOpacity
            style={[
              styles.controlButton,
              styles.startButton,
              isRunning && styles.controlButtonDisabled,
            ]}
            onPress={handleOpen}
            disabled={isRunning || status === 'closed'}
          >
            <Text style={styles.controlButtonIcon}>▶</Text>
            <Text style={styles.controlButtonText}>Open</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.controlButton,
              styles.pauseButton,
              !isRunning && styles.controlButtonDisabled,
            ]}
            onPress={handlePending}
            disabled={!isRunning && status === 'pending'}
          >
            <Text style={styles.controlButtonIcon}>⏸</Text>
            <Text style={styles.controlButtonText}>Pending</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.controlButton,
              styles.completeButton,
              status === 'closed' && styles.controlButtonDisabled,
            ]}
            onPress={handleClose}
            disabled={status === 'closed'}
          >
            <Text style={styles.controlButtonIcon}>✓</Text>
            <Text style={styles.controlButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Task Details */}
      <View style={styles.detailsCard}>
        <View style={styles.statusRow}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{status.toUpperCase()}</Text>
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

        {/* Priority (Managers only) */}
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

        {/* Assignee (Managers only) */}
        {canEditAll && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Assigned To</Text>
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
          </View>
        )}

        {/* Department (Managers only) */}
        {canEditAll && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Department</Text>
            <TextInput
              style={styles.input}
              value={department}
              onChangeText={setDepartment}
              placeholder="Sales"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        )}

        {/* Due Date (Managers only) */}
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

        {task.closed_approved_by && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Supervisor Approval</Text>
            <Text style={styles.helperText}>
              Approved by {task.closed_approved_by.substring(0, 8)}... on{' '}
              {task.closed_at ? new Date(task.closed_at).toLocaleString() : 'N/A'}
            </Text>
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

      {/* Comments */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Comments</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Add a comment..."
          placeholderTextColor="#9CA3AF"
          value={commentText}
          onChangeText={setCommentText}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
        <TouchableOpacity
          style={[styles.saveButton, commentSaving && styles.saveButtonDisabled]}
          onPress={handleAddComment}
          disabled={commentSaving || !commentText.trim()}
        >
          <Text style={styles.saveButtonText}>
            {commentSaving ? 'Adding...' : 'Add Comment'}
          </Text>
        </TouchableOpacity>
        {commentsLoading ? (
          <Text style={styles.helperText}>Loading comments...</Text>
        ) : comments.length === 0 ? (
          <Text style={styles.helperText}>No comments yet.</Text>
        ) : (
          comments.map((comment) => (
            <View key={comment.id} style={styles.commentItem}>
              <Text style={styles.commentBody}>{comment.body}</Text>
              <Text style={styles.commentMeta}>
                {comment.created_by.substring(0, 8)}... ·{' '}
                {new Date(comment.created_at).toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Attachments */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Attachments</Text>
        <TouchableOpacity
          style={[styles.saveButton, attachmentSaving && styles.saveButtonDisabled]}
          onPress={handleAddAttachment}
          disabled={attachmentSaving}
        >
          <Text style={styles.saveButtonText}>
            {attachmentSaving ? 'Uploading...' : 'Upload Attachment'}
          </Text>
        </TouchableOpacity>
        {attachmentsLoading ? (
          <Text style={styles.helperText}>Loading attachments...</Text>
        ) : attachments.length === 0 ? (
          <Text style={styles.helperText}>No attachments yet.</Text>
        ) : (
          attachments.map((attachment) => (
            <View key={attachment.id} style={styles.attachmentItem}>
              <Text style={styles.attachmentName}>{attachment.file_name}</Text>
              {attachment.mime_type?.startsWith('image/') ? (
                <Image
                  source={{ uri: attachment.file_url }}
                  style={styles.attachmentPreview}
                  resizeMode="cover"
                />
              ) : null}
              <Text style={styles.attachmentUrl}>{attachment.file_url}</Text>
              <Text style={styles.commentMeta}>
                {attachment.uploaded_by.substring(0, 8)}... ·{' '}
                {new Date(attachment.created_at).toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Contacts */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Contacts</Text>
        {canManageContacts ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Contact name"
              placeholderTextColor="#9CA3AF"
              value={contactName}
              onChangeText={setContactName}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone (optional)"
              placeholderTextColor="#9CA3AF"
              value={contactPhone}
              onChangeText={setContactPhone}
            />
            <TextInput
              style={styles.input}
              placeholder="Email (optional)"
              placeholderTextColor="#9CA3AF"
              value={contactEmail}
              onChangeText={setContactEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Notes (optional)"
              placeholderTextColor="#9CA3AF"
              value={contactNotes}
              onChangeText={setContactNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.saveButton, contactSaving && styles.saveButtonDisabled]}
              onPress={handleAddContact}
              disabled={contactSaving}
            >
              <Text style={styles.saveButtonText}>
                {contactSaving ? 'Saving...' : 'Add Contact'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.helperText}>
            Only the task owner can add contacts.
          </Text>
        )}

        {contactsLoading ? (
          <Text style={styles.helperText}>Loading contacts...</Text>
        ) : contacts.length === 0 ? (
          <Text style={styles.helperText}>No contacts yet.</Text>
        ) : (
          contacts.map((contact) => (
            <View key={contact.id} style={styles.commentItem}>
              <Text style={styles.commentBody}>{contact.name}</Text>
              {contact.phone ? (
                <Text style={styles.attachmentUrl}>{contact.phone}</Text>
              ) : null}
              {contact.email ? (
                <Text style={styles.attachmentUrl}>{contact.email}</Text>
              ) : null}
              {contact.notes ? (
                <Text style={styles.commentBody}>{contact.notes}</Text>
              ) : null}
              <Text style={styles.commentMeta}>
                {contact.created_by.substring(0, 8)}... ·{' '}
                {new Date(contact.created_at).toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Task Outcome - Potential customers linked to this task */}
      {isManager && (
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
  helperText: {
    fontSize: 13,
    color: '#6B7280',
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
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: {
    fontSize: 15,
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
  sectionCard: {
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  commentItem: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
    marginTop: 12,
  },
  commentBody: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  commentMeta: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
  },
  attachmentItem: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
    marginTop: 12,
  },
  attachmentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  attachmentPreview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginTop: 10,
    backgroundColor: '#F3F4F6',
  },
  attachmentUrl: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
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
