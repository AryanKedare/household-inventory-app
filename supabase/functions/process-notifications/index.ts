import { jsonResponse } from '../_shared/http.ts';
import { createAdminClient, getSecretKey } from '../_shared/supabase.ts';

const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const TIMEOUT_MS = 15_000;
const RECEIPT_DELAY_MS = 15 * 60 * 1000;
const RECEIPT_EXPIRY_MS = 24 * 60 * 60 * 1000;

interface ActivityRow {
  id: string;
  household_id: string;
  actor_id: string | null;
  activity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface DeviceRow {
  id: string;
  expo_push_token: string | null;
}

function authorized(req: Request): boolean {
  const apikey = req.headers.get('apikey') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return Boolean(apikey && apikey === getSecretKey());
}

function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 256 && value.endsWith(']') &&
    (value.startsWith('ExpoPushToken[') || value.startsWith('ExponentPushToken['));
}

function notificationCopy(activity: ActivityRow): { title: string; body: string } | null {
  const metadata = activity.metadata ?? {};
  const itemName = typeof metadata.itemName === 'string' ? metadata.itemName : 'An item';
  if (activity.activity_type === 'item_finished') {
    return { title: 'Item finished', body: `${itemName} is finished at home and needs to be bought.` };
  }
  if (activity.activity_type === 'shopping_item_added') {
    return { title: 'Shopping list updated', body: `${itemName} was added to the shopping list.` };
  }
  if (activity.activity_type === 'item_purchased') {
    const storeName = typeof metadata.storeName === 'string' ? metadata.storeName : null;
    return { title: 'Item purchased', body: storeName ? `${itemName} was purchased from ${storeName}.` : `${itemName} was purchased.` };
  }
  return null;
}

async function disableDevice(deviceId: string, token: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from('devices').select('expo_push_token').eq('id', deviceId).maybeSingle();
  if (error || data?.expo_push_token !== token) return;
  await admin.from('devices').update({
    notifications_enabled: false,
    disabled_reason: 'DeviceNotRegistered',
    disabled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', deviceId);
}

async function collectTargets(activity: ActivityRow): Promise<Array<{ token: string; deviceIds: string[] }>> {
  const admin = createAdminClient();
  const { data: members, error: memberError } = await admin
    .from('household_members')
    .select('user_id')
    .eq('household_id', activity.household_id);
  if (memberError) throw memberError;
  const userIds = (members ?? []).map((row) => row.user_id as string).filter((id) => id !== activity.actor_id);
  if (!userIds.length) return [];
  const { data: devices, error: deviceError } = await admin
    .from('devices')
    .select('id,expo_push_token')
    .in('user_id', userIds)
    .eq('notifications_enabled', true);
  if (deviceError) throw deviceError;

  const grouped = new Map<string, string[]>();
  for (const row of (devices ?? []) as DeviceRow[]) {
    if (!isExpoPushToken(row.expo_push_token)) continue;
    const ids = grouped.get(row.expo_push_token) ?? [];
    ids.push(row.id);
    grouped.set(row.expo_push_token, ids);
  }
  return [...grouped].map(([token, deviceIds]) => ({ token, deviceIds }));
}

async function sendActivity(activity: ActivityRow) {
  const copy = notificationCopy(activity);
  if (!copy) return;
  const targets = await collectTargets(activity);
  const admin = createAdminClient();

  for (let start = 0; start < targets.length; start += 100) {
    const chunk = targets.slice(start, start + 100);
    const response = await fetch(SEND_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify(chunk.map((target) => ({
        to: target.token,
        title: copy.title,
        body: copy.body,
        sound: 'default',
        data: {
          householdId: activity.household_id,
          activityId: activity.id,
          type: activity.activity_type,
          entityId: activity.entity_id ?? '',
        },
      }))),
    });
    if (!response.ok) throw new Error(`Expo push send failed with HTTP ${response.status}.`);
    const payload = await response.json() as { data?: Array<Record<string, unknown>> | Record<string, unknown> };
    const tickets = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];

    for (let index = 0; index < chunk.length; index += 1) {
      const target = chunk[index]!;
      const ticket = tickets[index];
      if (!ticket) continue;
      if (ticket.status === 'ok' && typeof ticket.id === 'string') {
        const now = new Date();
        await admin.from('push_receipts').upsert({
          ticket_id: ticket.id,
          expo_push_token: target.token,
          device_ids: target.deviceIds,
          sent_at: now.toISOString(),
          next_check_at: new Date(now.getTime() + RECEIPT_DELAY_MS).toISOString(),
          attempt_count: 0,
          updated_at: now.toISOString(),
        });
      } else if (ticket.status === 'error' && (ticket.details as Record<string, unknown> | undefined)?.error === 'DeviceNotRegistered') {
        await Promise.all(target.deviceIds.map((id) => disableDevice(id, target.token)));
      }
    }
  }
}

async function processOutbox() {
  const admin = createAdminClient();
  const { data: jobs, error } = await admin
    .from('notification_outbox')
    .select('activity_id,attempt_count')
    .is('processed_at', null)
    .lte('available_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw error;

  for (const job of jobs ?? []) {
    const { data: activity, error: activityError } = await admin
      .from('activities')
      .select('id,household_id,actor_id,activity_type,entity_id,metadata')
      .eq('id', job.activity_id)
      .maybeSingle();
    if (activityError || !activity) {
      await admin.from('notification_outbox').update({ processed_at: new Date().toISOString(), last_error: 'Activity missing.' }).eq('activity_id', job.activity_id);
      continue;
    }

    try {
      await sendActivity(activity as ActivityRow);
      await admin.from('notification_outbox').update({ processed_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('activity_id', job.activity_id);
    } catch (error) {
      const attempts = Number(job.attempt_count) + 1;
      await admin.from('notification_outbox').update({
        attempt_count: attempts,
        available_at: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString(),
        last_error: error instanceof Error ? error.message.slice(0, 500) : 'Push delivery failed.',
        updated_at: new Date().toISOString(),
        ...(attempts >= 8 ? { processed_at: new Date().toISOString() } : {}),
      }).eq('activity_id', job.activity_id);
    }
  }
}

async function processReceipts() {
  const admin = createAdminClient();
  const { data: pending, error } = await admin
    .from('push_receipts')
    .select('ticket_id,expo_push_token,device_ids,sent_at,attempt_count')
    .lte('next_check_at', new Date().toISOString())
    .order('sent_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  if (!(pending ?? []).length) return;

  const response = await fetch(RECEIPTS_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({ ids: pending!.map((row) => row.ticket_id) }),
  });
  if (!response.ok) return;
  const payload = await response.json() as { data?: Record<string, Record<string, unknown>> };
  const receipts = payload.data ?? {};

  for (const row of pending ?? []) {
    const receipt = receipts[row.ticket_id];
    const expired = Date.now() - new Date(row.sent_at).getTime() >= RECEIPT_EXPIRY_MS;
    if (!receipt) {
      if (expired) await admin.from('push_receipts').delete().eq('ticket_id', row.ticket_id);
      else await admin.from('push_receipts').update({ attempt_count: Number(row.attempt_count) + 1, next_check_at: new Date(Date.now() + RECEIPT_DELAY_MS).toISOString() }).eq('ticket_id', row.ticket_id);
      continue;
    }
    if (receipt.status === 'error' && (receipt.details as Record<string, unknown> | undefined)?.error === 'DeviceNotRegistered') {
      await Promise.all((row.device_ids as string[]).map((id) => disableDevice(id, row.expo_push_token)));
    }
    await admin.from('push_receipts').delete().eq('ticket_id', row.ticket_id);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
  if (!authorized(req)) return jsonResponse({ error: 'unauthorized' }, 401);
  try {
    await processOutbox();
    await processReceipts();
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('process-notifications failed', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Notification processing failed.' }, 500);
  }
});
