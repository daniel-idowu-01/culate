import React from 'react';
import { View, Text, FlatList, Button, StyleSheet } from 'react-native';
import { useTasks } from '../hooks/useTasks';
import { TaskCard } from '../components/TaskCard';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const AdminTaskListScreen = () => {
  const { tasks, refetch, isLoading } = useTasks({ scope: 'all' });
  const navigation = useNavigation<Nav>();

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>All Tasks</Text>
        <View style={styles.headerButtons}>
          <Button title="New" onPress={() => navigation.navigate('CreateTask')} />
          <Button title="Refresh" onPress={() => refetch()} disabled={isLoading} />
        </View>
      </View>
      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })}
            showAssignee
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text>No tasks yet.</Text>
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
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
  },
  empty: {
    marginTop: 32,
    alignItems: 'center',
  },
});

