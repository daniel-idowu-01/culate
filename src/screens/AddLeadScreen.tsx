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
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLeads } from '../hooks/useLeads';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type AddLeadRoute = RouteProp<RootStackParamList, 'AddLead'>;

export const AddLeadScreen = () => {
  const route = useRoute<AddLeadRoute>();
  const navigation = useNavigation<Nav>();
  const taskId = route.params?.taskId;
  const { createLead, isCreating } = useLeads({ scope: 'mine', taskId: taskId ?? undefined });

  const [name, setName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [conversationSummary, setConversationSummary] = useState('');
  const [errors, setErrors] = useState<{
    name?: string;
    contact?: string;
    summary?: string;
  }>({});

  const validateForm = () => {
    const newErrors: typeof errors = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!contactPhone.trim() && !contactEmail.trim()) {
      newErrors.contact = 'Phone number or email is required';
    }

    if (!conversationSummary.trim()) {
      newErrors.summary = 'Summary of conversation is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      await createLead({
        name: name.trim(),
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null,
        conversation_summary: conversationSummary.trim(),
        task_id: taskId ?? null,
      });
      Alert.alert(
        'Saved! ✓',
        'Potential customer recorded',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    }
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
          <Text style={styles.headerTitle}>Add Potential Customer</Text>
          <Text style={styles.headerSubtitle}>
            {taskId ? 'Link this contact to the current task' : 'Record details from your conversation'}
          </Text>
        </View>

        {/* Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Name <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={[styles.input, errors.name && styles.inputError]}
            placeholder="Customer name"
            placeholderTextColor="#9CA3AF"
            value={name}
            onChangeText={(t) => { setName(t); if (errors.name) setErrors({ ...errors, name: undefined }); }}
          />
          {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
        </View>

        {/* Contact - Phone */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 555-123-4567"
            placeholderTextColor="#9CA3AF"
            value={contactPhone}
            onChangeText={(t) => {
              setContactPhone(t);
              if (errors.contact) setErrors({ ...errors, contact: undefined });
            }}
            keyboardType="phone-pad"
          />
        </View>

        {/* Contact - Email */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, errors.contact && styles.inputError]}
            placeholder="e.g., john@example.com"
            placeholderTextColor="#9CA3AF"
            value={contactEmail}
            onChangeText={(t) => {
              setContactEmail(t);
              if (errors.contact) setErrors({ ...errors, contact: undefined });
            }}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {errors.contact && <Text style={styles.errorText}>{errors.contact}</Text>}
          <Text style={styles.helperText}>Provide at least one: phone or email</Text>
        </View>

        {/* Summary of Conversation */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Summary of Conversation <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={[styles.input, styles.textArea, errors.summary && styles.inputError]}
            placeholder="Brief notes about what was discussed, interests, next steps..."
            placeholderTextColor="#9CA3AF"
            value={conversationSummary}
            onChangeText={(t) => {
              setConversationSummary(t);
              if (errors.summary) setErrors({ ...errors, summary: undefined });
            }}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={1000}
          />
          {errors.summary && <Text style={styles.errorText}>{errors.summary}</Text>}
          <Text style={styles.charCount}>{conversationSummary.length}/1000</Text>
        </View>

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            disabled={isCreating}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.submitButton, isCreating && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isCreating}
            activeOpacity={0.8}
          >
            <Text style={styles.submitButtonText}>
              {isCreating ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: 20,
    backgroundColor: '#F9FAFB',
    paddingBottom: 40,
  },
  header: { marginBottom: 24 },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#6B7280',
  },
  inputGroup: { marginBottom: 20 },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  required: { color: '#EF4444' },
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
  inputError: { borderColor: '#EF4444' },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    marginTop: 6,
  },
  helperText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
  },
  charCount: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
    marginTop: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
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
  submitButton: {
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
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
