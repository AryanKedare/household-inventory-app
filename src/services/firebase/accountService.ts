import { httpsCallable } from 'firebase/functions';

import { getFirebaseServices } from './client';

function requireFunctions() {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }
  return services.functions;
}

export async function deleteAccount(): Promise<void> {
  const call = httpsCallable<Record<string, never>, { success: boolean }>(
    requireFunctions(),
    'deleteAccount',
  );
  await call({});
}
