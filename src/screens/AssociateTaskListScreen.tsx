import React from 'react';
import { View, Text, FlatList, Button, StyleSheet, TouchableOpacity } from 'react-native';
import { useTasks } from '../hooks/useTasks';
import { TaskCard } from '../components/TaskCard';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../context/AuthContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const AssociateTaskListScreen = () => {
  const { tasks, refetch, isLoading } = useTasks({ scope: 'mine' });
  const navigation = useNavigation<Nav>();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>My Tasks</Text>
        <View style={styles.headerButtons}>
          <Button title="New" onPress={() => navigation.navigate('CreateTask')} />
          <Button title="Refresh" onPress={() => refetch()} disabled={isLoading} />
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text>No tasks assigned yet.</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
  },
  signOutButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  signOutText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  empty: {
    marginTop: 32,
    alignItems: 'center',
  },
});

