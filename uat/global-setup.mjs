// Her kullanıcı için bir kez API'den giriş yapılır ve oturum tarayıcı durumu olarak saklanır.
// Senaryolar bu oturumlarla açılır; giriş ekranının kendisi giris.spec.mjs'te ayrıca denenir.
// (Giriş ucunda 15 dakikada 20 deneme sınırı var; her testte yeniden giriş yapılsaydı sınıra takılırdı.)
import fs from 'fs';
import { API, WEB, TENANT, PASSWORD, ADMIN, DEALERS } from './data.mjs';

export const AUTH_DIR = new URL('./.data/auth/', import.meta.url);

export default async () => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const users = { admin: ADMIN.email, ...Object.fromEntries(Object.entries(DEALERS).map(([k, d]) => [k, d.email])) };
  for (const [key, email] of Object.entries(users)) {
    const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tenant': TENANT }, body: JSON.stringify({ email, password: PASSWORD }) });
    const body = await res.json();
    if (!res.ok) throw new Error(`${email} giriş yapamadı: ${res.status} ${body.message}`);
    const state = { cookies: [], origins: [{ origin: WEB, localStorage: [{ name: 'akis_token', value: body.token }, { name: 'akis_user', value: JSON.stringify(body.user) }] }] };
    fs.writeFileSync(new URL(`${key}.json`, AUTH_DIR), JSON.stringify(state));
  }
};
