import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260811160000_ai_quota_insights.sql',
  'utf8',
);

test('hosted AI keeps the established daily quota contract', () => {
  assert.match(migration, /when 'category' then 40/);
  assert.match(migration, /when 'bill' then 20/);
  assert.match(migration, /when 'insights' then 5/);
  assert.match(migration, /AI_QUOTA_EXCEEDED/);
});

test('AI quota RPC remains backend-only', () => {
  assert.match(
    migration,
    /revoke all on function public\.consume_ai_quota\(uuid, text\) from public, anon, authenticated;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.consume_ai_quota\(uuid, text\) to service_role;/,
  );
});
