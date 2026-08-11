import type { User } from '@supabase/supabase-js';

import { requireSupabaseClient } from './client';

export async function signIn(email: string, password: string): Promise<User> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw error;
  }
  if (!data.user) {
    throw new Error('Supabase did not return a signed-in user.');
  }

  return data.user;
}

export async function signUp(name: string, email: string, password: string): Promise<User> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        display_name: name.trim(),
      },
    },
  });

  if (error) {
    throw error;
  }
  if (!data.user) {
    throw new Error('Supabase did not return the newly created user.');
  }

  return data.user;
}

export async function signOut(): Promise<void> {
  const { error } = await requireSupabaseClient().auth.signOut();
  if (error) {
    throw error;
  }
}
