import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { Platform } from 'react-native';

import { firebaseConfig, isFirebaseConfigured } from '../../config/env';

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
}

let services: FirebaseServices | null = null;
let emulatorsConnected = false;

function shouldUseEmulators() {
  return __DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true';
}

export function getFirebaseServices(): FirebaseServices | null {
  if (!isFirebaseConfigured) {
    return null;
  }

  if (services) {
    return services;
  }

  const app = getApps()[0] ?? initializeApp(firebaseConfig);

  let auth: Auth;
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    auth = getAuth(app);
  }

  const db = getFirestore(app);
  const functions = getFunctions(app, 'europe-west1');

  if (shouldUseEmulators() && !emulatorsConnected) {
    const host =
      process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ||
      (Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1');
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectFunctionsEmulator(functions, host, 5001);
    emulatorsConnected = true;
  }

  services = { app, auth, db, functions };
  return services;
}
