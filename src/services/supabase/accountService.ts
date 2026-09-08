import { requireSupabaseClient } from './client';

export async function deleteAccount(): Promise<void> {
  const { data, error } = await requireSupabaseClient().functions.invoke('delete-account', { body: {} });
  if (error) throw error;
  if (data && typeof data === 'object' && !Array.isArray(data) && typeof data.error === 'string') {
    throw new Error(data.error);
  }
}
