import AsyncStorage from '@react-native-async-storage/async-storage';
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

const DEVICE_KEY_STORAGE = 'homestock.push.device-key.v1';

async function ensureAndroidChannel(): Promise<void> {
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

function supportedPlatform(): 'ios' | 'android' | null {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;
}

async function getDeviceKey(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_KEY_STORAGE);
  if (existing && /^[A-Za-z0-9_-]{8,128}$/.test(existing)) return existing;

  const random = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  const created = `device_${Date.now().toString(36)}_${random}`.slice(0, 96);
  await AsyncStorage.setItem(DEVICE_KEY_STORAGE, created);
  return created;
}

async function loadPreference(uid: string): Promise<boolean> {
  const { data, error } = await requireSupabaseClient()
    .from('profiles')
    .select('notifications_enabled')
    .eq('id', uid)
    .maybeSingle();
  if (error) throw error;
  return data?.notifications_enabled !== false;
}

async function setPreference(uid: string, enabled: boolean): Promise<void> {
  const now = new Date().toISOString();
  const supabase = requireSupabaseClient();
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ notifications_enabled: enabled, updated_at: now })
    .eq('id', uid);
  if (profileError) throw profileError;

  if (!enabled) {
    const { error: deviceError } = await supabase
      .from('devices')
      .update({ notifications_enabled: false, updated_at: now })
      .eq('user_id', uid);
    if (deviceError) throw deviceError;
  }
}

async function registerCurrentToken(uid: string, token: string): Promise<void> {
  const platform = supportedPlatform();
  if (!platform) throw new Error('Push notifications are available only on iOS and Android.');

  const { error } = await requireSupabaseClient().functions.invoke('register-push-device', {
    body: {
      deviceKey: await getDeviceKey(),
      expoPushToken: token,
      platform,
    },
  });
  if (error) throw error;
}

export async function getNotificationRegistrationStatus(
  uid: string,
): Promise<NotificationRegistrationStatus> {
  if (!supportedPlatform()) return 'unavailable';

  const [permissions, enabled] = await Promise.all([
    Notifications.getPermissionsAsync(),
    loadPreference(uid),
  ]);

  if (permissions.status === 'granted' && enabled) return 'enabled';
  if (permissions.canAskAgain === false && permissions.status !== 'granted') return 'denied';
  return 'unavailable';
}

export async function registerForPushNotifications(
  uid: string,
): Promise<NotificationRegistrationStatus> {
  if (!supportedPlatform()) return 'unavailable';
  await ensureAndroidChannel();

  const currentPermission = await Notifications.getPermissionsAsync();
  let finalStatus = currentPermission.status;
  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== 'granted') {
    await setPreference(uid, false);
    return 'denied';
  }

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error('Push notifications need the EAS project ID. Run EAS init before device testing.');
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await registerCurrentToken(uid, token);
  return 'enabled';
}

export async function refreshPushTokenIfAlreadyAllowed(uid: string): Promise<void> {
  if (!supportedPlatform()) return;
  const [permission, enabled] = await Promise.all([
    Notifications.getPermissionsAsync(),
    loadPreference(uid),
  ]);
  if (permission.status !== 'granted' || !enabled) return;

  const projectId = getProjectId();
  if (!projectId) return;

  await ensureAndroidChannel();
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await registerCurrentToken(uid, token);
}

export async function disablePushNotifications(uid: string): Promise<void> {
  await setPreference(uid, false);
}
