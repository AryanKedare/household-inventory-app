import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.110.9';

function readNamedKey(jsonVariable: string, fallbackVariable: string): string {
  const namedKeys = Deno.env.get(jsonVariable);
  if (namedKeys) {
    try {
      const parsed = JSON.parse(namedKeys) as Record<string, unknown>;
      const defaultKey = parsed.default;
      if (typeof defaultKey === 'string' && defaultKey.length > 0) {
        return defaultKey;
      }

      const firstKey = Object.values(parsed).find(
        (value): value is string => typeof value === 'string' && value.length > 0,
      );
      if (firstKey) {
        return firstKey;
      }
    } catch {
      // Fall through to the legacy single-key variables below.
    }
  }

  const fallback = Deno.env.get(fallbackVariable);
  if (!fallback) {
    throw new Error(`Missing Supabase key: ${jsonVariable} / ${fallbackVariable}`);
  }

  return fallback;
}

function getSupabaseUrl(): string {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) {
    throw new Error('Missing SUPABASE_URL');
  }
  return url;
}

export function getPublishableKey(): string {
  return readNamedKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
}

export function getSecretKey(): string {
  return readNamedKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
}

export function createAdminClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getSecretKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export function createUserClient(req: Request): SupabaseClient {
  const authorization = req.headers.get('Authorization');
  if (!authorization) {
    throw new Error('Missing Authorization header');
  }

  return createClient(getSupabaseUrl(), getPublishableKey(), {
    global: {
      headers: { Authorization: authorization },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function requireUser(req: Request): Promise<{
  user: User;
  supabase: SupabaseClient;
}> {
  const supabase = createUserClient(req);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error('Unauthenticated request');
  }

  return { user: data.user, supabase };
}
