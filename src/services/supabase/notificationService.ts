import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { requireSupabaseClient } from './client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type NotificationRegistrationStatus = 'enabled' | 'denied' | 'unavailable';

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('household-updates', {
    name: 'Household updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2457F5',
  });
}

function getProjectId(): string | null {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

async function upsertDevice(uid: string, token: string, enabled: boolean) {
  const { error } = await requireSupabaseClient()
    .from('devices')
    .upsert(
      {
        user_id: uid,
        device_key: token,
        expo_push_token: token,
        notifications_enabled: enabled,
        disabled_reason: enabled ? null : 'user_disabled',
        disabled_at: enabled ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,device_key' },
    );
  if (error) throw error;
}

export async function getNotificationRegistrationStatus(uid: string): Promise<NotificationRegistrationStatus> {
  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.canAskAgain === false && permissions.status !== 'granted') return 'denied';
  if (permissions.status !== 'granted') return 'unavailable';

  const { data, error } = await requireSupabaseClient()
    .from('devices')
    .select('id')
    .eq('user_id', uid)
    .eq('notifications_enabled', true)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0 ? 'enabled' : 'unavailable';
}

export async function registerForPushNotifications(uid: string): Promise<NotificationRegistrationStatus> {
  await ensureAndroidChannel();
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';

  const projectId = getProjectId();
  if (!projectId) throw new Error('Push notifications need the EAS project ID. Run EAS init before device testing.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await upsertDevice(uid, token, true);
  return 'enabled';
}

export async function refreshPushTokenIfAlreadyAllowed(uid: string): Promise<void> {
  const permission = await Notifications.getPermissionsAsync();
  const projectId = getProjectId();
  if (permission.status !== 'granted' || !projectId) return;
  await ensureAndroidChannel();
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await upsertDevice(uid, token, true);
}

export async function disablePushNotifications(uid: string): Promise<void> {
  const { error } = await requireSupabaseClient()
    .from('devices')
    .update({
      notifications_enabled: false,
      disabled_reason: 'user_disabled',
      disabled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', uid);
  if (error) throw error;
}
