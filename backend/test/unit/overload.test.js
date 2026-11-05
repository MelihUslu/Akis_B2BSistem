import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

process.env.MAX_INFLIGHT = '10';
const { overload, inflightCount, dbGate } = await import('../../src/middlewares/overload.js');
const { noteDbError, isDbUnavailable } = await import('../../src/utils/dbHealth.js');

const call = (path) => {
  const res = Object.assign(new EventEmitter(), {
    headers: {}, statusCode: 200, body: null,
    set(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  });
  let passed = false;
  overload({ path }, res, () => { passed = true; });
  return { res, passed };
};

test('yük atma: sınıra kadar kabul, sınırda 503 + Retry-After, muaf yollar geçer, biten istek yer açar', () => {
  const open = Array.from({ length: 10 }, () => call('/api/products'));
  assert.ok(open.every((c) => c.passed));
  assert.equal(inflightCount(), 10);

  const busy = call('/api/products');
  assert.equal(busy.passed, false);
  assert.equal(busy.res.statusCode, 503);
  assert.equal(busy.res.headers['Retry-After'], '3');

  for (const p of ['/health', '/health/ready', '/api/public/iyzico/callback', '/api/public/pos/callback', '/api/whatsapp/webhook/abc']) {
    assert.equal(call(p).passed, true, p);
  }
  assert.equal(inflightCount(), 10); // muaf yollar sayılmaz

  open[0].res.emit('finish');
  open[0].res.emit('close'); // ikisi de gelir; bir kez düşülür
  assert.equal(inflightCount(), 9);
  assert.equal(call('/api/orders').passed, true);
  open.slice(1).forEach((c) => c.res.emit('close'));
});

test('veritabanı kapalı: bağlantı hatasından sonra istekler veritabanına gitmeden 503 alır; havuz zaman aşımı kesinti sayılmaz', () => {
  const gate = (path) => {
    const res = { headers: {}, statusCode: 200, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.statusCode = c; return this; }, json() { return this; } };
    let passed = false;
    dbGate({ path }, res, () => { passed = true; });
    return { res, passed };
  };
  assert.equal(gate('/api/products').passed, true);
  assert.equal(isDbUnavailable({ code: 'P2024', message: 'Timed out fetching a new connection from the connection pool.' }), false);
  noteDbError({ code: 'P2024', message: 'Timed out fetching a new connection from the connection pool.' });
  assert.equal(gate('/api/products').passed, true);

  const orig = console.error; console.error = () => {};
  noteDbError({ message: 'Error querying the database: FATAL: database "akis" is not currently accepting connections' });
  console.error = orig;
  const blocked = gate('/api/products');
  assert.equal(blocked.passed, false);
  assert.equal(blocked.res.statusCode, 503);
  assert.equal(blocked.res.headers['Retry-After'], '3');
  assert.equal(gate('/health').passed, true);
  assert.equal(isDbUnavailable({ code: 'P1001' }), true);
});
