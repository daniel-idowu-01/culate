import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
} from 'react-native';
import { supabase } from '../api/supabaseClient';
import type { SubTask, TaskStatus } from '../types';

type Props = {
  taskId: string;
  subtasks: SubTask[];
  onUpdate: () => void;
  canEdit: boolean;
};

export const SubTaskList: React.FC<Props> = ({ taskId, subtasks, onUpdate, canEdit }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!newTitle.trim()) {
      Alert.alert('Error', 'Sub-task title is required');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('subtasks')
        .insert({
          parent_task_id: taskId,
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          created_by: user.id,
          assigned_to: user.id,
        });

      if (error) throw error;

      setNewTitle('');
      setNewDescription('');
      setIsAdding(false);
      onUpdate();
    } catch (error) {
      Alert.alert('Error', (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (subtask: SubTask) => {
    const newStatus: TaskStatus = subtask.status === 'closed' ? 'open' : 'closed';
    
    try {
      const { error } = await supabase
        .from('subtasks')
        .update({
          status: newStatus,
          completed_at: newStatus === 'closed' ? new Date().toISOString() : null,
        })
        .eq('id', subtask.id);

      if (error) throw error;
      onUpdate();
    } catch (error) {
      Alert.alert('Error', (error as Error).message);
    }
  };

  const handleDelete = async (subtaskId: string) => {
    Alert.alert(
      'Delete Sub-task',
      'Are you sure you want to delete this sub-task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('subtasks')
                .delete()
                .eq('id', subtaskId);

              if (error) throw error;
              onUpdate();
            } catch (error) {
              Alert.alert('Error', (error as Error).message);
            }
          },
        },
      ]
    );
  };

  const completedCount = subtasks.filter(st => st.status === 'closed').length;
  const progress = subtasks.length > 0 ? (completedCount / subtasks.length) * 100 : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Sub-tasks</Text>
          <Text style={styles.headerSubtitle}>
            {completedCount} of {subtasks.length} completed
          </Text>
        </View>
        {canEdit && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setIsAdding(!isAdding)}
          >
            <Text style={styles.addButtonText}>
              {isAdding ? '✕' : '+ Add'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {subtasks.length > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>{Math.round(progress)}%</Text>
        </View>
      )}

      {isAdding && (
        <View style={styles.addForm}>
          <TextInput
            style={styles.input}
            placeholder="Sub-task title"
            value={newTitle}
            onChangeText={setNewTitle}
            placeholderTextColor="#9CA3AF"
          />
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Description (optional)"
            value={newDescription}
            onChangeText={setNewDescription}
            multiline
            numberOfLines={2}
            placeholderTextColor="#9CA3AF"
          />
          <View style={styles.formButtons}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setIsAdding(false);
                setNewTitle('');
                setNewDescription('');
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={handleAdd}
              disabled={loading}
            >
              <Text style={styles.saveButtonText}>
                {loading ? 'Adding...' : 'Add'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <FlatList
        data={subtasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.subtaskItem}>
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => handleToggle(item)}
              disabled={!canEdit}
            >
              {item.status === 'closed' ? (
                <View style={styles.checkboxChecked}>
                  <Text style={styles.checkmark}>✓</Text>
                </View>
              ) : (
                <View style={styles.checkboxUnchecked} />
              )}
            </TouchableOpacity>
            
            <View style={styles.subtaskContent}>
              <Text
                style={[
                  styles.subtaskTitle,
                  item.status === 'closed' && styles.subtaskTitleCompleted,
                ]}
              >
                {item.title}
              </Text>
              {item.description && (
                <Text style={styles.subtaskDescription}>
                  {item.description}
                </Text>
              )}
              {item.completed_at && (
                <Text style={styles.completedDate}>
                  Completed {new Date(item.completed_at).toLocaleDateString()}
                </Text>
              )}
            </View>

            {canEdit && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDelete(item.id)}
              >
                <Text style={styles.deleteIcon}>🗑</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={
          !isAdding ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📝</Text>
              <Text style={styles.emptyText}>No sub-tasks yet</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    minWidth: 40,
  },
  addForm: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    fontSize: 15,
    color: '#111827',
    marginBottom: 8,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  formButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  subtaskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  checkbox: {
    paddingTop: 2,
  },
  checkboxUnchecked: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#D1D5DB',
  },
  checkboxChecked: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  subtaskContent: {
    flex: 1,
  },
  subtaskTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    lineHeight: 20,
  },
  subtaskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  subtaskDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 18,
  },
  completedDate: {
    fontSize: 12,
    color: '#10B981',
    marginTop: 4,
  },
  deleteButton: {
    padding: 4,
  },
  deleteIcon: {
    fontSize: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});