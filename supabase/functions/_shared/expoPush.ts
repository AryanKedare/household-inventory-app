export const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
export const EXPO_REQUEST_TIMEOUT_MS = 15_000;
export const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000;
export const RECEIPT_EXPIRY_MS = 24 * 60 * 60 * 1000;
export const RECEIPT_BATCH_LIMIT = 500;

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: Record<string, string>;
}

export interface ExpoPushDetails {
  error?: unknown;
  [key: string]: unknown;
}

export interface ExpoPushTicket {
  status?: unknown;
  id?: unknown;
  message?: unknown;
  details?: ExpoPushDetails;
}

export interface ExpoPushReceipt {
  status?: unknown;
  message?: unknown;
  details?: ExpoPushDetails;
}

export interface ExpoPushSendResponse {
  data?: ExpoPushTicket[] | ExpoPushTicket;
  errors?: unknown;
}

export interface ExpoPushReceiptResponse {
  data?: Record<string, ExpoPushReceipt>;
  errors?: unknown;
}

export function isExpoPushToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 256 &&
    value.endsWith(']') &&
    (value.startsWith('ExpoPushToken[') || value.startsWith('ExponentPushToken['))
  );
}

export function isDeviceNotRegistered(details: ExpoPushDetails | undefined): boolean {
  return details?.error === 'DeviceNotRegistered';
}

export function normalizeTickets(data: ExpoPushSendResponse['data']): ExpoPushTicket[] {
  if (Array.isArray(data)) return data;
  return data ? [data] : [];
}
