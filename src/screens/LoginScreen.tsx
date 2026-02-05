import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export const LoginScreen = () => {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    const trimmedEmail = email.trim();
    const action = mode === 'signin' ? signIn : signUp;
    const { error } = await action(trimmedEmail, password);
    setLoading(false);
    if (error) {
      console.log(error)
      Alert.alert('Error', error.message);
    } else if (mode === 'signup') {
      Alert.alert('Success', 'Account created. Please sign in.');
      setMode('signin');
      setPassword('');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <Text style={styles.title}>Task Tracker</Text>
          <View style={styles.card}>
            <Text style={styles.subtitle}>
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <Button
              title={
                loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Sign Up'
              }
              onPress={handleSubmit}
              disabled={loading}
            />
          </View>
          <View style={styles.switchRow}>
            <Text>
              {mode === 'signin'
                ? "Don't have an account?"
                : 'Already have an account?'}
            </Text>
            <Text
              style={styles.switchText}
              onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </Text>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#0F172A',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 24,
    textAlign: 'center',
    color: '#E5E7EB',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: '#111827',
    color: '#E5E7EB',
  },
  card: {
    backgroundColor: '#020617',
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    gap: 4,
  },
  switchText: {
    color: '#38BDF8',
    marginLeft: 4,
  },
});

