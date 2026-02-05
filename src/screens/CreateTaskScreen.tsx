import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../api/supabaseClient';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../context/AuthContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const CreateTaskScreen = () => {
  const navigation = useNavigation<Nav>();
  const { session } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!session) {
      Alert.alert('Not signed in');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Validation', 'Title is required.');
      return;
    }
    setSaving(true);
    const userId = session.user.id;
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        created_by: userId,
        assigned_to: userId,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
      })
      .select()
      .single();

    setSaving(false);

    if (error) {
      Alert.alert('Error creating task', error.message);
      return;
    }

    Alert.alert('Success', 'Task created.');
    navigation.goBack();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>New Task</Text>
      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter task title"
        value={title}
        onChangeText={setTitle}
      />
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Optional description"
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <Text style={styles.label}>Due at (optional, ISO)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 2026-02-05T18:00:00.000Z"
        value={dueAt}
        onChangeText={setDueAt}
      />
      <View style={styles.buttonRow}>
        <Button title={saving ? 'Creating...' : 'Create Task'} onPress={handleCreate} />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 16,
  },
  label: {
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  buttonRow: {
    marginTop: 24,
  },
});

