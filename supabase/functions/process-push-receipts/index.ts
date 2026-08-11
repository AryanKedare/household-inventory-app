import {
  EXPO_PUSH_RECEIPTS_URL,
  EXPO_REQUEST_TIMEOUT_MS,
  RECEIPT_BATCH_LIMIT,
  RECEIPT_CHECK_DELAY_MS,
  RECEIPT_EXPIRY_MS,
  isDeviceNotRegistered,
  type ExpoPushReceiptResponse,
} from '../_shared/expoPush.ts';
import { jsonResponse } from '../_shared/http.ts';
import { requireInternalSecret } from '../_shared/internalAuth.ts';
import { createAdminClient } from '../_shared/supabase.ts';

interface ReceiptQueueRow {
  ticket_id: string;
  expo_push_token: string;
  device_ids: string[];
  sent_at: string;
  next_check_at: string;
  attempt_count: number;
  created_at: string;
}

async function disableDevices(row: ReceiptQueueRow): Promise<void> {
  if (!Array.isArray(row.device_ids) || row.device_ids.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from('devices')
    .update({
      notifications_enabled: false,
      disabled_reason: 'DeviceNotRegistered',
      disabled_at: now,
      updated_at: now,
    })
    .in('id', row.device_ids)
    .eq('expo_push_token', row.expo_push_token);
  if (error) throw error;
}

async function deleteReceipt(ticketId: string): Promise<void> {
  const { error } = await createAdminClient().from('push_receipts').delete().eq('ticket_id', ticketId);
  if (error) throw error;
}

async function retryReceipt(row: ReceiptQueueRow, now: Date): Promise<void> {
  const { error } = await createAdminClient()
    .from('push_receipts')
    .update({
      attempt_count: row.attempt_count + 1,
      next_check_at: new Date(now.getTime() + RECEIPT_CHECK_DELAY_MS).toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('ticket_id', row.ticket_id);
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    requireInternalSecret(req);
    const admin = createAdminClient();
    const now = new Date();
    const { data: pending, error: pendingError } = await admin
      .from('push_receipts')
      .select('ticket_id,expo_push_token,device_ids,sent_at,next_check_at,attempt_count,created_at')
      .lte('next_check_at', now.toISOString())
      .order('next_check_at', { ascending: true })
      .limit(RECEIPT_BATCH_LIMIT);
    if (pendingError) throw pendingError;

    const rows = (pending ?? []) as ReceiptQueueRow[];
    if (rows.length === 0) {
      return jsonResponse({ ok: true, processed: 0, disabled: 0, retried: 0, expired: 0 });
    }

    let response: Response;
    try {
      response = await fetch(EXPO_PUSH_RECEIPTS_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(EXPO_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({ ids: rows.map((row) => row.ticket_id) }),
      });
    } catch (error) {
      console.error(
        'Unable to request Expo push receipts',
        error instanceof Error ? error.name : 'Unknown network error',
      );
      return jsonResponse({ ok: true, retained: rows.length, reason: 'network_error' });
    }

    if (!response.ok) {
      console.error('Expo push receipt request failed', response.status, (await response.text()).slice(0, 500));
      return jsonResponse({ ok: true, retained: rows.length, reason: 'provider_error' });
    }

    let payload: ExpoPushReceiptResponse;
    try {
      payload = (await response.json()) as ExpoPushReceiptResponse;
    } catch {
      console.error('Expo push receipt request returned unreadable JSON');
      return jsonResponse({ ok: true, retained: rows.length, reason: 'unreadable_provider_response' });
    }

    const receipts = payload.data ?? {};
    let processed = 0;
    let disabled = 0;
    let retried = 0;
    let expired = 0;

    for (const row of rows) {
      try {
        const receipt = receipts[row.ticket_id];
        const createdAt = Date.parse(row.created_at || row.sent_at);
        const ageMs = Number.isFinite(createdAt) ? now.getTime() - createdAt : RECEIPT_EXPIRY_MS;

        if (!receipt) {
          if (ageMs >= RECEIPT_EXPIRY_MS) {
            await deleteReceipt(row.ticket_id);
            expired += 1;
          } else {
            await retryReceipt(row, now);
            retried += 1;
          }
          continue;
        }

        if (receipt.status === 'ok') {
          await deleteReceipt(row.ticket_id);
          processed += 1;
          continue;
        }

        if (receipt.status === 'error') {
          if (isDeviceNotRegistered(receipt.details)) {
            await disableDevices(row);
            disabled += 1;
          } else {
            console.error('Expo push receipt reported an error', {
              ticketId: row.ticket_id,
              message: typeof receipt.message === 'string' ? receipt.message : 'Unknown Expo receipt error',
              error: receipt.details?.error,
            });
          }
          await deleteReceipt(row.ticket_id);
          processed += 1;
          continue;
        }

        if (ageMs >= RECEIPT_EXPIRY_MS) {
          await deleteReceipt(row.ticket_id);
          expired += 1;
        } else {
          await retryReceipt(row, now);
          retried += 1;
        }
      } catch (error) {
        console.error('Unable to process one Expo push receipt', row.ticket_id, error);
      }
    }

    return jsonResponse({ ok: true, processed, disabled, retried, expired });
  } catch (error) {
    console.error('process-push-receipts rejected request', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid receipt request.' }, 401);
  }
});
