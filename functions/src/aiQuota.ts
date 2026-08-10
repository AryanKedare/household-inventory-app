import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

const db = getFirestore();

export type AiQuotaKind = 'category' | 'bill' | 'insights';

const DAILY_LIMITS: Record<AiQuotaKind, number> = {
  category: 40,
  bill: 20,
  insights: 5,
};

function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function consumeAiQuota(uid: string, kind: AiQuotaKind): Promise<void> {
  const day = utcDayKey();
  const ref = db.doc(`aiUsage/${uid}_${day}`);
  const limit = DAILY_LIMITS[kind];

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    const current = typeof data?.[kind] === 'number' && Number.isInteger(data[kind]) ? data[kind] : 0;
    if (current >= limit) {
      throw new HttpsError(
        'resource-exhausted',
        kind === 'insights'
          ? 'Daily household AI insight limit reached. Try again tomorrow.'
          : 'Daily household AI limit reached. Try again tomorrow.',
      );
    }

    transaction.set(
      ref,
      {
        uid,
        day,
        [kind]: current + 1,
        total: typeof data?.total === 'number' ? data.total + 1 : 1,
        updatedAt: FieldValue.serverTimestamp(),
        ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
  });
}
