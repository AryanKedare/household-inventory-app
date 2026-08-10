const env = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(env).every(
  (value) => typeof value === 'string' && value.length > 0,
);

export const firebaseConfig = {
  apiKey: env.apiKey ?? '',
  authDomain: env.authDomain ?? '',
  projectId: env.projectId ?? '',
  storageBucket: env.storageBucket ?? '',
  messagingSenderId: env.messagingSenderId ?? '',
  appId: env.appId ?? '',
};
