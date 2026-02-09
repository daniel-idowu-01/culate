import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabaseClient';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return null;
  }

  const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!projectId || !uuidPattern.test(projectId)) {
    console.log('Missing or invalid EXPO_PUBLIC_PROJECT_ID. Skipping push registration.');
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Permission to send notifications was denied');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenData.data;

    await saveTokenToSupabase(userId, token);

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('task-reminders', {
        name: 'Task Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
      });
    }

    return token;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}

async function saveTokenToSupabase(userId: string, token: string) {
  try {
    const { error } = await supabase
      .from('devices')
      .upsert(
        {
          user_id: userId,
          expo_push_token: token,
          last_seen_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,expo_push_token',
        }
      );

    if (error) {
      console.error('Error saving push token:', error);
    }
  } catch (err) {
    console.error('Error in saveTokenToSupabase:', err);
  }
}

export async function scheduleTaskDeadlineNotification(
  taskId: string,
  taskTitle: string,
  dueAt: string
) {
  try {
    const dueDate = new Date(dueAt);
    const now = new Date();

    if (dueDate <= now) {
      return;
    }

    await cancelTaskNotifications(taskId);

    const oneHourBefore = new Date(dueDate.getTime() - 60 * 60 * 1000);
    if (oneHourBefore > now) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Task deadline approaching',
          body: `"${taskTitle}" is due in 1 hour`,
          data: { taskId, type: 'warning' },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          date: oneHourBefore,
          channelId: 'task-reminders',
        },
        identifier: `task-${taskId}-1hour`,
      });
    }

    const fifteenMinBefore = new Date(dueDate.getTime() - 15 * 60 * 1000);
    if (fifteenMinBefore > now) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Task deadline soon',
          body: `"${taskTitle}" is due in 15 minutes`,
          data: { taskId, type: 'urgent' },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: {
          date: fifteenMinBefore,
          channelId: 'task-reminders',
        },
        identifier: `task-${taskId}-15min`,
      });
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Task overdue',
        body: `"${taskTitle}" deadline has passed`,
        data: { taskId, type: 'overdue' },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: {
        date: dueDate,
        channelId: 'task-reminders',
      },
      identifier: `task-${taskId}-deadline`,
    });

    console.log('Scheduled notifications for task:', taskTitle);
  } catch (error) {
    console.error('Error scheduling task notifications:', error);
  }
}

export async function cancelTaskNotifications(taskId: string) {
  try {
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();

    const taskNotificationIds = scheduledNotifications
      .filter((notification) => notification.identifier.startsWith(`task-${taskId}`))
      .map((notification) => notification.identifier);

    for (const id of taskNotificationIds) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  } catch (error) {
    console.error('Error canceling task notifications:', error);
  }
}

export async function updateTaskNotifications(
  taskId: string,
  taskTitle: string,
  status: string,
  dueAt: string | null
) {
  await cancelTaskNotifications(taskId);

  if (status !== 'closed' && dueAt) {
    await scheduleTaskDeadlineNotification(taskId, taskTitle, dueAt);
  }
}

export async function sendTaskStatusNotification(taskTitle: string, status: string) {
  let title = '';
  let body = '';
  let icon = '';

  switch (status) {
    case 'closed':
      icon = 'x';
      title = 'Task closed';
      body = `Task "${taskTitle}" was closed`;
      break;
    case 'open':
      icon = '>';
      title = 'Task opened';
      body = `"${taskTitle}" is now open`;
      break;
    case 'pending':
      icon = '||';
      title = 'Task pending';
      body = `"${taskTitle}" is now pending`;
      break;
    default:
      return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${icon} ${title}`,
      body,
      sound: true,
    },
    trigger: null,
  });
}

export function addNotificationListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}
