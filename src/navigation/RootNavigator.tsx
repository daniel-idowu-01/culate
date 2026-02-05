import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { AdminTaskListScreen } from '../screens/AdminTaskListScreen';
import { AssociateTaskListScreen } from '../screens/AssociateTaskListScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  TaskDetail: { taskId: string };
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const AdminTabs = () => (
  <Tab.Navigator>
    <Tab.Screen name="Tasks" component={AdminTaskListScreen} />
  </Tab.Navigator>
);

const AssociateTabs = () => (
  <Tab.Navigator>
    <Tab.Screen name="MyTasks" component={AssociateTaskListScreen} options={{ title: 'My Tasks' }} />
  </Tab.Navigator>
);

export const RootNavigator = () => {
  const { session, role, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator>
        {!session ? (
          <RootStack.Screen
            name="Auth"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <RootStack.Screen
              name="Main"
              component={role === 'admin' ? AdminTabs : AssociateTabs}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="TaskDetail"
              component={TaskDetailScreen}
              options={{ title: 'Task Details' }}
            />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
};

