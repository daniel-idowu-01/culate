import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabaseClient';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Register device for push notifications and save token to Supabase
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Permission to send notifications was denied');
      return null;
    }

    // Get push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID, // Your Expo project ID
    });
    const token = tokenData.data;

    // Save token to Supabase
    await saveTokenToSupabase(userId, token);

    // Configure notification channels for Android
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

/**
 * Save push token to Supabase devices table
 */
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

/**
 * Schedule a local notification for a task deadline
 */
export async function scheduleTaskDeadlineNotification(
  taskId: string,
  taskTitle: string,
  dueAt: string
) {
  try {
    const dueDate = new Date(dueAt);
    const now = new Date();

    // Don't schedule if the task is already overdue
    if (dueDate <= now) {
      return;
    }

    // Cancel any existing notifications for this task
    await cancelTaskNotifications(taskId);

    // Schedule notification 1 hour before deadline
    const oneHourBefore = new Date(dueDate.getTime() - 60 * 60 * 1000);
    if (oneHourBefore > now) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Task Deadline Approaching',
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

    // Schedule notification 15 minutes before deadline
    const fifteenMinBefore = new Date(dueDate.getTime() - 15 * 60 * 1000);
    if (fifteenMinBefore > now) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 Task Deadline Soon!',
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

    // Schedule notification at deadline
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ Task Overdue',
        body: `"${taskTitle}" deadline has passed!`,
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

/**
 * Cancel all notifications for a specific task
 */
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

/**
 * Update notifications when task status changes
 */
export async function updateTaskNotifications(
  taskId: string,
  taskTitle: string,
  status: string,
  dueAt: string | null
) {
  // Cancel existing notifications
  await cancelTaskNotifications(taskId);

  // Only schedule new notifications if task is not completed and has a deadline
  if (status !== 'completed' && dueAt) {
    await scheduleTaskDeadlineNotification(taskId, taskTitle, dueAt);
  }
}

/**
 * Send immediate notification for task status change
 */
export async function sendTaskStatusNotification(
  taskTitle: string,
  status: string
) {
  let title = '';
  let body = '';
  let emoji = '';

  switch (status) {
    case 'completed':
      emoji = '✅';
      title = 'Task Completed!';
      body = `Great job! You completed "${taskTitle}"`;
      break;
    case 'in_progress':
      emoji = '▶️';
      title = 'Task Started';
      body = `You started working on "${taskTitle}"`;
      break;
    case 'overdue':
      emoji = '⚠️';
      title = 'Task Overdue';
      body = `"${taskTitle}" is now overdue`;
      break;
    default:
      return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${emoji} ${title}`,
      body,
      sound: true,
    },
    trigger: null, // Send immediately
  });
}

/**
 * Add notification listener
 */
export function addNotificationListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add notification response listener (when user taps notification)
 */
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}