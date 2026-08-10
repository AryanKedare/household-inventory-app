import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { getFirebaseServices } from './client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type NotificationRegistrationStatus = 'enabled' | 'denied' | 'unavailable';

function requireServices() {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }
  return services;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') {
    return;
  }

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

export async function getNotificationRegistrationStatus(
  uid: string,
): Promise<NotificationRegistrationStatus> {
  const { db } = requireServices();
  const [permissions, userSnapshot] = await Promise.all([
    Notifications.getPermissionsAsync(),
    getDoc(doc(db, 'users', uid)),
  ]);
  const notificationsEnabled = userSnapshot.data()?.preferences?.notificationsEnabled === true;

  if (permissions.status === 'granted' && notificationsEnabled) {
    return 'enabled';
  }
  if (permissions.canAskAgain === false && permissions.status !== 'granted') {
    return 'denied';
  }
  return 'unavailable';
}

export async function registerForPushNotifications(
  uid: string,
): Promise<NotificationRegistrationStatus> {
  const { db } = requireServices();
  await ensureAndroidChannel();

  const currentPermission = await Notifications.getPermissionsAsync();
  let finalStatus = currentPermission.status;
  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== 'granted') {
    await updateDoc(doc(db, 'users', uid), {
      'preferences.notificationsEnabled': false,
      updatedAt: serverTimestamp(),
    });
    return 'denied';
  }

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error('Push notifications need the EAS project ID. Run EAS init before device testing.');
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const deviceId = encodeURIComponent(token);

  await setDoc(
    doc(db, 'users', uid, 'devices', deviceId),
    {
      expoPushToken: token,
      platform: Platform.OS,
      enabled: true,
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await updateDoc(doc(db, 'users', uid), {
    'preferences.notificationsEnabled': true,
    updatedAt: serverTimestamp(),
  });

  return 'enabled';
}

export async function refreshPushTokenIfAlreadyAllowed(uid: string): Promise<void> {
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') {
    return;
  }

  const projectId = getProjectId();
  if (!projectId) {
    return;
  }

  const { db } = requireServices();
  await ensureAndroidChannel();
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await setDoc(
    doc(db, 'users', uid, 'devices', encodeURIComponent(token)),
    {
      expoPushToken: token,
      platform: Platform.OS,
      enabled: true,
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function disablePushNotifications(uid: string): Promise<void> {
  const { db } = requireServices();
  const devices = await getDocs(collection(db, 'users', uid, 'devices'));
  const batch = writeBatch(db);

  for (const device of devices.docs) {
    batch.update(device.ref, { enabled: false, updatedAt: serverTimestamp() });
  }
  batch.update(doc(db, 'users', uid), {
    'preferences.notificationsEnabled': false,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}
