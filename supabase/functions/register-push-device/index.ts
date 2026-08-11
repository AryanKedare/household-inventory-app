import { isExpoPushToken } from '../_shared/expoPush.ts';
import { handleCors, jsonResponse } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

interface RegisterPushDeviceBody {
  deviceKey?: unknown;
  expoPushToken?: unknown;
  platform?: unknown;
}

function cleanDeviceKey(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Device key is required.');
  const key = value.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new Error('Device key is invalid.');
  return key;
}

function cleanPlatform(value: unknown): 'ios' | 'android' {
  if (value !== 'ios' && value !== 'android') throw new Error('Platform is invalid.');
  return value;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const { user } = await requireUser(req);
    const body = (await req.json()) as RegisterPushDeviceBody;
    const deviceKey = cleanDeviceKey(body.deviceKey);
    if (!isExpoPushToken(body.expoPushToken)) throw new Error('Expo push token is invalid.');
    const expoPushToken = body.expoPushToken;
    const platform = cleanPlatform(body.platform);
    const admin = createAdminClient();

    const { data: currentTokenRow, error: lookupError } = await admin
      .from('devices')
      .select('id,user_id,device_key')
      .eq('expo_push_token', expoPushToken)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (
      currentTokenRow &&
      (currentTokenRow.user_id !== user.id || currentTokenRow.device_key !== deviceKey)
    ) {
      const { error: deleteError } = await admin
        .from('devices')
        .delete()
        .eq('id', currentTokenRow.id);
      if (deleteError) throw deleteError;
    }

    const now = new Date().toISOString();
    const { error: upsertError } = await admin.from('devices').upsert(
      {
        user_id: user.id,
        device_key: deviceKey,
        expo_push_token: expoPushToken,
        notifications_enabled: true,
        disabled_reason: null,
        disabled_at: null,
        platform,
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: 'user_id,device_key' },
    );
    if (upsertError) throw upsertError;

    const { error: profileError } = await admin
      .from('profiles')
      .update({ notifications_enabled: true, updated_at: now })
      .eq('id', user.id);
    if (profileError) throw profileError;

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('register-push-device failed', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unable to register push device.' }, 400);
  }
});
