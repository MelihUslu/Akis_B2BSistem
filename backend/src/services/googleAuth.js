import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_VERIFY, API_PUBLIC_URL } from '../config.js';
import { markOnce } from '../utils/redis.js';
import { trackExternal } from './monitoring.js';

/**
 * Google ile giriş (OpenID Connect, yetkilendirme kodu akışı).
 *
 * Firmaların her biri ayrı adreste (alt alan adı / özel alan adı) çalışır; Google ise sayfa içi düğme için her adresin
 * tek tek kaydedilmesini ister. Bu yüzden yönlendirmeli akış kullanılır: tek dönüş adresi API'dedir
 * (API_PUBLIC_URL/api/public/google/callback) ve bütün portallara yeter.
 *
 *   giriş sayfası → /google/start → Google → /google/callback → giriş sayfası#google=<bilet>
 *
 * Bilet, Google'ın doğruladığı e-postayı taşır; kısa ömürlü ve tek kullanımlıktır, yalnızca başlatıldığı portalda
 * (ya da ortak girişte) geçer. Hesap e-postayla eşleşir; Google ile yeni hesap açılmaz. Sonraki kontroller
 * (pasif hesap, abonelik, bayi durumu, iki aşamalı doğrulama) şifreli girişle aynıdır.
 */
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const STATE_TTL = 10 * 60; // sn: kullanıcının Google ekranında geçireceği süre
const TICKET_TTL = 120; // sn

const clientId = () => process.env.GOOGLE_CLIENT_ID || '';
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET || '';
const tokenUrl = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token'; // testte taklit sunucu

export const googleEnabled = () => Boolean(clientId() && clientSecret());
export const CALLBACK_PATH = '/api/public/google/callback';
const redirectUri = () => `${API_PUBLIC_URL}${CALLBACK_PATH}`;

/** Hata kodu giriş sayfasına adresin # kısmında döner; sayfa koda göre mesaj gösterir. */
export class GoogleLoginError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

/**
 * Google'a yönlendirme adresi. nonce tarayıcıya çerez olarak da yazılır: dönüşte çerezle state eşleşmezse
 * (bağlantı başka bir tarayıcıda açıldıysa) giriş reddedilir. Böylece biri kendi Google girişinin dönüş
 * bağlantısını başkasına açtırıp onu kendi hesabına sokamaz.
 */
export const googleAuthUrl = ({ portal }) => {
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = jwt.sign({ typ: 'google-state', portal: portal || null, n: nonce }, JWT_SECRET, { expiresIn: STATE_TTL });
  const params = new URLSearchParams({
    client_id: clientId(), redirect_uri: redirectUri(), response_type: 'code',
    scope: 'openid email profile', state, nonce, prompt: 'select_account'
  });
  return { url: `${AUTH_URL}?${params}`, nonce, maxAge: STATE_TTL };
};

// Dönüşte hata olsa bile kullanıcı başladığı sayfaya dönsün diye portal imza doğrulanmadan okunur (yalnızca yönlendirme için)
export const peekStatePortal = (state) => {
  const p = jwt.decode(String(state || ''));
  return p?.typ === 'google-state' && typeof p.portal === 'string' ? p.portal : null;
};

export const readState = (state, cookieNonce) => {
  let p;
  try {
    p = jwt.verify(String(state || ''), JWT_SECRET, JWT_VERIFY);
  } catch {
    throw new GoogleLoginError('expired');
  }
  if (p.typ !== 'google-state' || !cookieNonce || p.n !== cookieNonce) throw new GoogleLoginError('expired');
  return { portal: p.portal || null, nonce: p.n };
};

/**
 * Kodu Google'da kimlik belirtecine (id_token) çevirir ve içindeki kişiyi döner.
 * Belirteç doğrudan Google'ın token ucundan TLS ile alındığı için imzası ayrıca doğrulanmaz
 * (OpenID Connect Core 3.1.3.7); yayıncı, alıcı (client_id), süre ve nonce kontrol edilir.
 */
export const exchangeCode = (code, nonce) => trackExternal('Google', 'oauth/token', async () => {
  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: String(code || ''), client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri(), grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(10000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id_token) {
    const error = new Error(data.error_description || data.error || `HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return identityFrom(data.id_token, nonce);
});

export const identityFrom = (idToken, nonce) => {
  const p = jwt.decode(idToken);
  const aud = Array.isArray(p?.aud) ? p.aud : [p?.aud];
  if (!p || !ISSUERS.includes(p.iss) || !aud.includes(clientId()) || !(p.exp * 1000 > Date.now()) || p.nonce !== nonce) {
    throw new Error('Google kimlik belirteci geçersiz.');
  }
  if (!p.email || !(p.email_verified === true || p.email_verified === 'true')) throw new GoogleLoginError('unverified');
  return { email: String(p.email).toLowerCase().trim(), name: p.name || null };
};

// Giriş sayfasına dönen bilet: portal null ise ortak girişe (/giris) aittir
export const issueTicket = ({ email, name }, portal) =>
  jwt.sign({ typ: 'google-login', email, name, portal: portal || null, jti: crypto.randomBytes(12).toString('hex') }, JWT_SECRET, { expiresIn: TICKET_TTL });

export const consumeTicket = async (ticket, portal) => {
  let p;
  try {
    p = jwt.verify(String(ticket || ''), JWT_SECRET, JWT_VERIFY);
  } catch {
    throw new GoogleLoginError('expired', 'Google ile girişin süresi doldu. Lütfen tekrar deneyin.');
  }
  if (p.typ !== 'google-login' || (p.portal || null) !== (portal || null)) throw new GoogleLoginError('expired', 'Google ile giriş bu portala ait değil. Lütfen tekrar deneyin.');
  const ttl = Math.max(1000, p.exp * 1000 - Date.now());
  if (!(await markOnce(`google:${p.jti}`, ttl))) throw new GoogleLoginError('expired', 'Bu Google girişi daha önce kullanıldı. Lütfen tekrar deneyin.');
  return { email: p.email, name: p.name };
};
