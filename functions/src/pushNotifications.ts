import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

const db = getFirestore();
const REGION = 'europe-west1';
const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000;
const RECEIPT_EXPIRY_MS = 24 * 60 * 60 * 1000;
const RECEIPT_BATCH_LIMIT = 500;

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: Record<string, string>;
}

interface PushTarget {
  token: string;
  devicePaths: string[];
}

interface ExpoPushDetails {
  error?: unknown;
  [key: string]: unknown;
}

interface ExpoPushTicket {
  status?: unknown;
  id?: unknown;
  message?: unknown;
  details?: ExpoPushDetails;
}

interface ExpoPushReceipt {
  status?: unknown;
  message?: unknown;
  details?: ExpoPushDetails;
}

interface ExpoPushSendResponse {
  data?: ExpoPushTicket[] | ExpoPushTicket;
  errors?: unknown;
}

interface ExpoPushReceiptResponse {
  data?: Record<string, ExpoPushReceipt>;
  errors?: unknown;
}

function isExpoPushToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value.startsWith('ExpoPushToken[') || value.startsWith('ExponentPushToken['))
  );
}

function isDeviceNotRegistered(details: ExpoPushDetails | undefined): boolean {
  return details?.error === 'DeviceNotRegistered';
}

function notificationCopy(activity: Record<string, unknown>): { title: string; body: string } | null {
  const type = activity.type;
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

async function collectHouseholdPushTargets(
  householdId: string,
  actorId: unknown,
): Promise<PushTarget[]> {
  const members = await db.collection(`households/${householdId}/members`).get();
  const devicePathsByToken = new Map<string, Set<string>>();

  await Promise.all(
    members.docs.map(async (member) => {
      if (typeof actorId === 'string' && member.id === actorId) {
        return;
      }

      const devices = await db
        .collection(`users/${member.id}/devices`)
        .where('enabled', '==', true)
        .get();

      for (const device of devices.docs) {
        const token = device.data().expoPushToken;
        if (!isExpoPushToken(token)) {
          continue;
        }

        const paths = devicePathsByToken.get(token) ?? new Set<string>();
        paths.add(device.ref.path);
        devicePathsByToken.set(token, paths);
      }
    }),
  );

  return [...devicePathsByToken.entries()].map(([token, paths]) => ({
    token,
    devicePaths: [...paths],
  }));
}

async function disableDeviceIfTokenMatches(devicePath: string, token: string): Promise<void> {
  const deviceRef = db.doc(devicePath);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(deviceRef);
    if (!snapshot.exists || snapshot.data()?.expoPushToken !== token) {
      return;
    }

    transaction.set(
      deviceRef,
      {
        enabled: false,
        disabledReason: 'DeviceNotRegistered',
        disabledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

async function disableTarget(target: PushTarget): Promise<void> {
  await Promise.all(
    target.devicePaths.map((devicePath) => disableDeviceIfTokenMatches(devicePath, target.token)),
  );
}

function normalizeTickets(data: ExpoPushSendResponse['data']): ExpoPushTicket[] {
  if (Array.isArray(data)) {
    return data;
  }
  return data ? [data] : [];
}

async function persistReceiptTicket(ticketId: string, target: PushTarget): Promise<void> {
  await db.doc(`pushReceipts/${ticketId}`).set({
    expoPushToken: target.token,
    devicePaths: target.devicePaths,
    sentAt: Timestamp.now(),
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function sendExpoPushTargets(
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

    const response = await fetch(EXPO_PUSH_SEND_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      console.error('Expo push request failed', response.status, responseBody.slice(0, 500));
      continue;
    }

    const payload = (await response.json()) as ExpoPushSendResponse;
    const tickets = normalizeTickets(payload.data);
    if (tickets.length !== chunk.length) {
      console.error('Expo push ticket count did not match the message count', {
        messages: chunk.length,
        tickets: tickets.length,
      });
    }

    await Promise.all(
      chunk.map(async (target, index) => {
        const ticket = tickets[index];
        if (!ticket) {
          return;
        }

        if (ticket.status === 'ok' && typeof ticket.id === 'string' && ticket.id.length > 0) {
          await persistReceiptTicket(ticket.id, target);
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

function queuedTarget(data: Record<string, unknown>): PushTarget | null {
  const token = data.expoPushToken;
  if (!isExpoPushToken(token) || !Array.isArray(data.devicePaths)) {
    return null;
  }

  const devicePaths = data.devicePaths.filter(
    (value): value is string =>
      typeof value === 'string' && /^users\/[^/]+\/devices\/[^/]+$/.test(value),
  );
  if (devicePaths.length === 0) {
    return null;
  }

  return { token, devicePaths: [...new Set(devicePaths)] };
}

export const householdActivityNotification = onDocumentCreated(
  { region: REGION, document: 'households/{householdId}/activities/{activityId}' },
  async (event) => {
    const activity = event.data?.data();
    if (!activity) {
      return;
    }

    const copy = notificationCopy(activity);
    if (!copy) {
      return;
    }

    try {
      const targets = await collectHouseholdPushTargets(event.params.householdId, activity.actorId);
      await sendExpoPushTargets(targets, copy, {
        householdId: event.params.householdId,
        activityId: event.params.activityId,
        type: typeof activity.type === 'string' ? activity.type : 'household_update',
        entityId: typeof activity.entityId === 'string' ? activity.entityId : '',
      });
    } catch (error) {
      // Push delivery must never make the underlying household action fail or retry forever.
      console.error('Unable to send household push notifications', error);
    }
  },
);

export const processExpoPushReceipts = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: REGION,
    timeZone: 'Etc/UTC',
  },
  async () => {
    const now = Date.now();
    const dueAt = Timestamp.fromMillis(now - RECEIPT_CHECK_DELAY_MS);
    const pending = await db
      .collection('pushReceipts')
      .where('sentAt', '<=', dueAt)
      .orderBy('sentAt', 'asc')
      .limit(RECEIPT_BATCH_LIMIT)
      .get();

    if (pending.empty) {
      return;
    }

    let response: Response;
    try {
      response = await fetch(EXPO_PUSH_RECEIPTS_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: pending.docs.map((document) => document.id) }),
      });
    } catch (error) {
      console.error('Unable to request Expo push receipts', error);
      return;
    }

    if (!response.ok) {
      const responseBody = await response.text();
      console.error('Expo push receipt request failed', response.status, responseBody.slice(0, 500));
      return;
    }

    const payload = (await response.json()) as ExpoPushReceiptResponse;
    const receipts = payload.data ?? {};
    const batch = db.batch();
    let writeCount = 0;

    for (const pendingDocument of pending.docs) {
      const pendingData = pendingDocument.data();
      const target = queuedTarget(pendingData);
      const sentAt = pendingData.sentAt;
      const receipt = receipts[pendingDocument.id];

      if (!target || !(sentAt instanceof Timestamp)) {
        batch.delete(pendingDocument.ref);
        writeCount += 1;
        continue;
      }

      if (!receipt) {
        if (sentAt.toMillis() <= now - RECEIPT_EXPIRY_MS) {
          batch.delete(pendingDocument.ref);
          writeCount += 1;
        }
        continue;
      }

      if (receipt.status === 'ok') {
        batch.delete(pendingDocument.ref);
        writeCount += 1;
        continue;
      }

      if (receipt.status === 'error' && isDeviceNotRegistered(receipt.details)) {
        try {
          await disableTarget(target);
          batch.delete(pendingDocument.ref);
          writeCount += 1;
        } catch (error) {
          console.error('Unable to disable unregistered Expo push token', error);
        }
        continue;
      }

      console.error('Expo push delivery receipt reported an error', {
        receiptId: pendingDocument.id,
        message: typeof receipt.message === 'string' ? receipt.message : 'Unknown Expo receipt error',
        error: receipt.details?.error,
      });
      batch.delete(pendingDocument.ref);
      writeCount += 1;
    }

    if (writeCount > 0) {
      await batch.commit();
    }
  },
);
