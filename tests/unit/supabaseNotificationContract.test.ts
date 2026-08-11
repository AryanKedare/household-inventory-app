import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  RECEIPT_CHECK_DELAY_MS,
  RECEIPT_EXPIRY_MS,
} from '../../supabase/functions/_shared/expoPush';

const migration = readFileSync(
  'supabase/migrations/20260811170000_notification_preferences.sql',
  'utf8',
);

test('hosted push receipt timing remains fifteen minutes and twenty-four hours', () => {
  assert.equal(RECEIPT_CHECK_DELAY_MS, 15 * 60 * 1000);
  assert.equal(RECEIPT_EXPIRY_MS, 24 * 60 * 60 * 1000);
});

test('explicit notification preference remains durable across token refresh', () => {
  assert.match(
    migration,
    /notifications_enabled boolean not null default true/,
  );
  assert.match(migration, /platform in \('ios', 'android'\)/);
});
