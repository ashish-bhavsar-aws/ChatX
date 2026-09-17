import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushToken } from '@workspace/api-client-react';

let handlerConfigured = false;

export function configureNotifications() {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function enablePushNotifications(userId: string) {
  if (Platform.OS === 'web' || !Device.isDevice) {
    return { ok: false as const, reason: 'physical_device_required' as const };
  }

  const existing = await Notifications.getPermissionsAsync();
  const permission =
    existing.granted || existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
      ? existing
      : await Notifications.requestPermissionsAsync();
  if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return { ok: false as const, reason: 'permission_denied' as const };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages-and-calls', {
      name: 'Messages and calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }

  const deviceToken = await Notifications.getDevicePushTokenAsync();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  await registerPushToken({
    userId,
    token: String(deviceToken.data),
    platform,
  });
  return { ok: true as const, tokenType: deviceToken.type };
}

export function subscribeToNotifications(
  onNotification: (notification: Notifications.Notification) => void,
  onResponse: (response: Notifications.NotificationResponse) => void,
) {
  const received = Notifications.addNotificationReceivedListener(onNotification);
  const response = Notifications.addNotificationResponseReceivedListener(onResponse);
  return () => {
    received.remove();
    response.remove();
  };
}