import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDay, localMonth } from '../../src/utils/dates.js';

test('localDay: Türkiye günü (UTC değil) — gece 00:00–03:00 arası doğru güne düşer', () => {
  const prev = process.env.TZ;
  process.env.TZ = 'Europe/Istanbul';
  try {
    assert.equal(localDay(new Date('2026-11-02T22:30:00Z')), '2026-11-03'); // TR 01:30
    assert.equal(localDay(new Date('2026-11-02T20:59:00Z')), '2026-11-02'); // TR 23:59
    assert.equal(localMonth(new Date('2026-10-31T21:30:00Z')), '2026-11'); // TR 1 Kasım 00:30
  } finally {
    process.env.TZ = prev;
  }
});
