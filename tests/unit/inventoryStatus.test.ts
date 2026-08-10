import assert from 'node:assert/strict';
import test from 'node:test';

import { getItemStatus } from '../../src/utils/inventoryStatus';

test('zero and negative quantities are out of stock', () => {
  assert.equal(getItemStatus(0, 1), 'out_of_stock');
  assert.equal(getItemStatus(-1, 1), 'out_of_stock');
});

test('threshold marks low stock', () => {
  assert.equal(getItemStatus(1, 2), 'low_stock');
  assert.equal(getItemStatus(2, 2), 'low_stock');
  assert.equal(getItemStatus(3, 2), 'available');
});

test('without a threshold positive quantity remains available', () => {
  assert.equal(getItemStatus(1), 'available');
});
