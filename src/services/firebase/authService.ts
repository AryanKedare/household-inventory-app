import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { getFirebaseServices } from './client';

function requireFirebase() {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured. Copy .env.example to .env and add Firebase values.');
  }
  return services;
}

export async function signIn(email: string, password: string): Promise<User> {
  const { auth } = requireFirebase();
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function signUp(name: string, email: string, password: string): Promise<User> {
  const { auth, db } = requireFirebase();
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);

  await updateProfile(credential.user, { displayName: name.trim() });
  await setDoc(doc(db, 'users', credential.user.uid), {
    displayName: name.trim(),
    email: credential.user.email,
    preferences: {
      currency: 'EUR',
      notificationsEnabled: true,
      theme: 'system',
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return credential.user;
}

export async function signOut(): Promise<void> {
  const { auth } = requireFirebase();
  await firebaseSignOut(auth);
}
