export type NotificationRegistrationStatus = 'enabled' | 'denied' | 'unavailable';

/**
 * HomeStock intentionally has no Expo/Firebase push transport in the bare
 * React Native build. Supabase Realtime continues to update household data
 * while the application is running.
 */
export async function getNotificationRegistrationStatus(
  _uid: string,
): Promise<NotificationRegistrationStatus> {
  return 'unavailable';
}

export async function registerForPushNotifications(
  _uid: string,
): Promise<NotificationRegistrationStatus> {
  throw new Error(
    'Remote push notifications are not configured in this Expo/Firebase-free build. Household data still updates through Supabase Realtime while HomeStock is open.',
  );
}

export async function refreshPushTokenIfAlreadyAllowed(_uid: string): Promise<void> {
  // Intentionally empty: there is no Expo or Firebase push-token provider.
}

export async function disablePushNotifications(_uid: string): Promise<void> {
  // Intentionally empty: there is no remote push registration to disable.
}
