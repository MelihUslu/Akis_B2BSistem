// Senaryoların oturumları: her kullanıcı için oturum anahtarı (JWT, HS256) UAT backend'inin gizli anahtarıyla imzalanır
// ve tarayıcı durumu olarak saklanır. Giriş ucu çağrılmaz (15 dakikada 20 deneme sınırı vardır); giriş ekranının
// kendisi giris.spec.mjs'te gerçek girişle denenir. Kullanıcı kimlikleri seed.mjs'ten gelir (run.sh → .data/users.json).
import fs from 'fs';
import crypto from 'crypto';
import { WEB } from './data.mjs';

const data = new URL('./.data/', import.meta.url);
export const AUTH_DIR = new URL('./auth/', data);

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const sign = (payload, secret) => {
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
};

export default async () => {
  const secret = fs.readFileSync(new URL('secret', data), 'utf8').trim();
  const { tenantId, users } = JSON.parse(fs.readFileSync(new URL('users.json', data), 'utf8'));
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const now = Math.floor(Date.now() / 1000);
  for (const u of users) {
    const token = sign({ id: u.id, role: u.role, companyId: u.companyId, tenantId, iat: now, exp: now + 86400 }, secret);
    const user = { id: u.id, name: u.name, email: u.email, role: u.role, companyId: u.companyId, isOwner: u.isOwner, permissions: [] };
    const state = { cookies: [], origins: [{ origin: WEB, localStorage: [{ name: 'akis_token', value: token }, { name: 'akis_user', value: JSON.stringify(user) }] }] };
    fs.writeFileSync(new URL(`${u.key}.json`, AUTH_DIR), JSON.stringify(state));
  }
};
