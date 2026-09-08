import Config from 'react-native-config';

const supabaseUrl = Config.SUPABASE_URL;
const supabasePublishableKey = Config.SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured =
  typeof supabaseUrl === 'string' &&
  supabaseUrl.length > 0 &&
  typeof supabasePublishableKey === 'string' &&
  supabasePublishableKey.length > 0;

export const supabaseConfig = {
  url: supabaseUrl ?? '',
  publishableKey: supabasePublishableKey ?? '',
};
