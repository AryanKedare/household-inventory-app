import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';

import { isFirebaseConfigured } from '../config/env';
import { getFirebaseServices } from '../services/firebase/client';
import * as authService from '../services/firebase/authService';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    const services = getFirebaseServices();
    if (!services) {
      setLoading(false);
      return undefined;
    }

    return onAuthStateChanged(services.auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await authService.signIn(email, password);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    await authService.signUp(name, email, password);
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, configured: isFirebaseConfigured, signIn, signUp, signOut }),
    [user, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return context;
}
