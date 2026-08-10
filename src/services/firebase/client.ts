import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import type { Auth, Persistence } from 'firebase/auth';
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

type ReactNativeAuthModule = typeof FirebaseAuth & {
  getReactNativePersistence(storage: typeof AsyncStorage): Persistence;
};

let services: FirebaseServices | null = null;
let emulatorsConnected = false;

function shouldUseEmulators() {
  return __DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true';
}

function initializeFirebaseAuth(app: FirebaseApp): Auth {
  if (Platform.OS === 'web') {
    return FirebaseAuth.getAuth(app);
  }

  try {
    const reactNativeAuth = FirebaseAuth as ReactNativeAuthModule;
    if (typeof reactNativeAuth.getReactNativePersistence !== 'function') {
      return FirebaseAuth.getAuth(app);
    }

    return FirebaseAuth.initializeAuth(app, {
      persistence: reactNativeAuth.getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return FirebaseAuth.getAuth(app);
  }
}

export function getFirebaseServices(): FirebaseServices | null {
  if (!isFirebaseConfigured) {
    return null;
  }

  if (services) {
    return services;
  }

  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  const auth = initializeFirebaseAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, 'europe-west1');

  if (shouldUseEmulators() && !emulatorsConnected) {
    const host =
      process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ||
      (Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1');
    FirebaseAuth.connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectFunctionsEmulator(functions, host, 5001);
    emulatorsConnected = true;
  }

  services = { app, auth, db, functions };
  return services;
}
