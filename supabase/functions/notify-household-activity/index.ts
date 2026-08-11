import {
  EXPO_PUSH_SEND_URL,
  EXPO_REQUEST_TIMEOUT_MS,
  RECEIPT_CHECK_DELAY_MS,
  isDeviceNotRegistered,
  isExpoPushToken,
  normalizeTickets,
  type ExpoPushMessage,
  type ExpoPushSendResponse,
} from '../_shared/expoPush.ts';
import { jsonResponse } from '../_shared/http.ts';
import { requireInternalSecret } from '../_shared/internalAuth.ts';
import { createAdminClient } from '../_shared/supabase.ts';

interface DatabaseWebhookPayload {
  type?: unknown;
  table?: unknown;
  schema?: unknown;
  record?: unknown;
}

interface PushTarget {
  token: string;
  deviceIds: string[];
}

function notificationCopy(activity: Record<string, unknown>): { title: string; body: string } | null {
  const type = activity.activity_type;
  const metadata =
    activity.metadata && typeof activity.metadata === 'object'
      ? (activity.metadata as Record<string, unknown>)
      : {};
  const itemName = typeof metadata.itemName === 'string' ? metadata.itemName : 'An item';

  if (type === 'item_finished') {
    return {
      title: 'Item finished',
      body: `${itemName} is finished at home and needs to be bought.`,
    };
  }
  if (type === 'shopping_item_added') {
    return {
      title: 'Shopping list updated',
      body: `${itemName} was added to the shopping list.`,
    };
  }
  if (type === 'item_purchased') {
    const storeName = typeof metadata.storeName === 'string' ? metadata.storeName : null;
    return {
      title: 'Item purchased',
      body: storeName ? `${itemName} was purchased from ${storeName}.` : `${itemName} was purchased.`,
    };
  }
  return null;
}

async function collectTargets(
  householdId: string,
  actorId: unknown,
): Promise<PushTarget[]> {
  const admin = createAdminClient();
  const { data: memberships, error: memberError } = await admin
    .from('household_members')
    .select('user_id')
    .eq('household_id', householdId);
  if (memberError) throw memberError;

  const recipientIds = (memberships ?? [])
    .map((membership) => membership.user_id as string)
    .filter((userId) => typeof actorId !== 'string' || userId !== actorId);
  if (recipientIds.length === 0) return [];

  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .in('id', recipientIds)
    .eq('notifications_enabled', true);
  if (profileError) throw profileError;
  const enabledUserIds = (profiles ?? []).map((profile) => profile.id as string);
  if (enabledUserIds.length === 0) return [];

  const { data: devices, error: deviceError } = await admin
    .from('devices')
    .select('id,expo_push_token')
    .in('user_id', enabledUserIds)
    .eq('notifications_enabled', true)
    .not('expo_push_token', 'is', null);
  if (deviceError) throw deviceError;

  const idsByToken = new Map<string, Set<string>>();
  for (const device of devices ?? []) {
    const token = device.expo_push_token;
    if (!isExpoPushToken(token)) continue;
    const ids = idsByToken.get(token) ?? new Set<string>();
    ids.add(device.id as string);
    idsByToken.set(token, ids);
  }

  return [...idsByToken.entries()].map(([token, ids]) => ({
    token,
    deviceIds: [...ids],
  }));
}

async function disableTarget(target: PushTarget): Promise<void> {
  if (target.deviceIds.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from('devices')
    .update({
      notifications_enabled: false,
      disabled_reason: 'DeviceNotRegistered',
      disabled_at: now,
      updated_at: now,
    })
    .in('id', target.deviceIds)
    .eq('expo_push_token', target.token);
  if (error) throw error;
}

async function persistReceipt(ticketId: string, target: PushTarget): Promise<void> {
  const sentAt = new Date();
  const { error } = await createAdminClient().from('push_receipts').upsert(
    {
      ticket_id: ticketId,
      expo_push_token: target.token,
      device_ids: target.deviceIds,
      sent_at: sentAt.toISOString(),
      next_check_at: new Date(sentAt.getTime() + RECEIPT_CHECK_DELAY_MS).toISOString(),
      attempt_count: 0,
      updated_at: sentAt.toISOString(),
    },
    { onConflict: 'ticket_id' },
  );
  if (error) throw error;
}

async function sendTargets(
  targets: PushTarget[],
  copy: { title: string; body: string },
  data: Record<string, string>,
): Promise<void> {
  for (let start = 0; start < targets.length; start += 100) {
    const chunk = targets.slice(start, start + 100);
    const messages: ExpoPushMessage[] = chunk.map((target) => ({
      to: target.token,
      title: copy.title,
      body: copy.body,
      sound: 'default',
      data,
    }));

    let response: Response;
    try {
      response = await fetch(EXPO_PUSH_SEND_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(EXPO_REQUEST_TIMEOUT_MS),
        body: JSON.stringify(messages),
      });
    } catch (error) {
      console.error('Unable to send Expo push notifications', error instanceof Error ? error.name : 'network_error');
      continue;
    }

    if (!response.ok) {
      console.error('Expo push request failed', response.status, (await response.text()).slice(0, 500));
      continue;
    }

    let payload: ExpoPushSendResponse;
    try {
      payload = (await response.json()) as ExpoPushSendResponse;
    } catch {
      console.error('Expo push request returned unreadable JSON');
      continue;
    }

    const tickets = normalizeTickets(payload.data);
    if (tickets.length !== chunk.length) {
      console.error('Expo push ticket count did not match message count', {
        messages: chunk.length,
        tickets: tickets.length,
      });
    }

    await Promise.all(
      chunk.map(async (target, index) => {
        const ticket = tickets[index];
        if (!ticket) return;
        if (ticket.status === 'ok' && typeof ticket.id === 'string' && ticket.id.length > 0) {
          await persistReceipt(ticket.id, target);
          return;
        }
        if (ticket.status === 'error') {
          if (isDeviceNotRegistered(ticket.details)) {
            await disableTarget(target);
            return;
          }
          console.error('Expo rejected push notification', {
            message: typeof ticket.message === 'string' ? ticket.message : 'Unknown Expo push error',
            error: ticket.details?.error,
          });
        }
      }),
    );
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    requireInternalSecret(req);
    const payload = (await req.json()) as DatabaseWebhookPayload;
    if (payload.type !== 'INSERT' || payload.table !== 'activities' || payload.schema !== 'public') {
      return jsonResponse({ ok: true, ignored: true });
    }
    if (!payload.record || typeof payload.record !== 'object' || Array.isArray(payload.record)) {
      throw new Error('Activity webhook payload is invalid.');
    }

    const activity = payload.record as Record<string, unknown>;
    const householdId = typeof activity.household_id === 'string' ? activity.household_id : '';
    const activityId = typeof activity.id === 'string' ? activity.id : '';
    if (!householdId || !activityId) throw new Error('Activity webhook is missing identifiers.');

    const copy = notificationCopy(activity);
    if (!copy) return jsonResponse({ ok: true, ignored: true });

    try {
      const targets = await collectTargets(householdId, activity.actor_id);
      await sendTargets(targets, copy, {
        householdId,
        activityId,
        type: typeof activity.activity_type === 'string' ? activity.activity_type : 'household_update',
        entityId: typeof activity.entity_id === 'string' ? activity.entity_id : '',
      });
      return jsonResponse({ ok: true, targetCount: targets.length });
    } catch (error) {
      // Push delivery is downstream of the household write and must not create a
      // webhook retry loop for a successful inventory/shopping transaction.
      console.error('Household push fan-out failed', error);
      return jsonResponse({ ok: true, deliveryFailed: true });
    }
  } catch (error) {
    console.error('notify-household-activity rejected request', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid webhook request.' }, 401);
  }
});
