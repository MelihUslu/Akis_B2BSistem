import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkConfig } from '../../src/services/configCheck.js';

const withEnv = (vars, fn) => {
  const saved = { ...process.env };
  try {
    for (const k of ['JWT_SECRET', 'ENCRYPTION_KEY', 'ROOT_DOMAIN', 'FRONTEND_PROTOCOL', 'FRONTEND_PORT', 'API_PUBLIC_URL', 'AI_PROVIDER', 'AI_API_KEY', 'ANTHROPIC_API_KEY', 'FX_FIXED', 'SMTP_HOST', 'SEED_DEMO', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_TOKEN_URL']) delete process.env[k];
    Object.assign(process.env, vars);
    return fn();
  } finally {
    process.env = saved;
  }
};
const good = {
  NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(48), ENCRYPTION_KEY: 'y'.repeat(48), ROOT_DOMAIN: 'akisb2b.com',
  FRONTEND_PROTOCOL: 'https', FRONTEND_PORT: '', API_PUBLIC_URL: 'https://api.akisb2b.com'
};

test('canlı ayar kontrolü: zorunlu ayarlar tamamsa hata yok, eksik servisler uyarı', () => withEnv(good, () => {
  const r = checkConfig();
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.includes('SMTP')));
  assert.ok(r.items.every((i) => !('value' in i))); // değerler hiçbir zaman döndürülmez
}));

test('canlı ayar kontrolü: güvensiz ayarlar sunucuyu durduracak hata üretir', () => withEnv({ ...good, JWT_SECRET: 'kisa', ROOT_DOMAIN: 'localhost', FRONTEND_PROTOCOL: 'http', API_PUBLIC_URL: 'http://localhost:5001', AI_PROVIDER: 'mock', FX_FIXED: 'USD:1' }, () => {
  const r = checkConfig();
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 6);
}));

test('geliştirmede eksik ayarlar yalnızca uyarıdır', () => withEnv({ NODE_ENV: 'development', JWT_SECRET: 'kisa' }, () => {
  const r = checkConfig();
  assert.equal(r.errors.length, 0);
  assert.ok(r.warnings.length > 0);
}));

test('Google ile giriş: iki anahtar birlikte gerekir, test token adresi canlıda hatadır', () => {
  withEnv({ ...good, GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com' }, () => {
    const r = checkConfig();
    assert.equal(r.items.find((i) => i.key === 'GOOGLE').ok, false);
    assert.ok(r.warnings.some((w) => w.includes('GOOGLE_CLIENT_SECRET')));
  });
  withEnv({ ...good, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', GOOGLE_TOKEN_URL: 'http://127.0.0.1/token' }, () => {
    const r = checkConfig();
    assert.equal(r.items.find((i) => i.key === 'GOOGLE').ok, true);
    assert.ok(r.errors.some((e) => e.includes('GOOGLE_TOKEN_URL')));
  });
});
