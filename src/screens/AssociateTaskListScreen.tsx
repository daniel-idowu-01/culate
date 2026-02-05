import React from 'react';
import { View, Text, FlatList, Button, StyleSheet } from 'react-native';
import { useTasks } from '../hooks/useTasks';
import { TaskCard } from '../components/TaskCard';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const AssociateTaskListScreen = () => {
  const { tasks, refetch, isLoading } = useTasks({ scope: 'mine' });
  const navigation = useNavigation<Nav>();

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>My Tasks</Text>
        <Button title="Refresh" onPress={() => refetch()} disabled={isLoading} />
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
  title: {
    fontSize: 22,
    fontWeight: '600',
  },
  empty: {
    marginTop: 32,
    alignItems: 'center',
  },
});

