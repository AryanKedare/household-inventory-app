const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured =
  typeof supabaseUrl === 'string' &&
  supabaseUrl.length > 0 &&
  typeof supabasePublishableKey === 'string' &&
  supabasePublishableKey.length > 0;

export const supabaseConfig = {
  url: supabaseUrl ?? '',
  publishableKey: supabasePublishableKey ?? '',
};
