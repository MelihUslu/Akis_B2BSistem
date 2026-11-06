/**
 * Netgsm SMS (REST v2): https://api.netgsm.com.tr/sms/rest/v2
 *   POST /send       { msgheader, encoding: 'TR', messages: [{ msg, no: '5XXXXXXXXX' }] } → { code: '00', jobid }
 *   GET  /msgheader  onaylı gönderici adları → { code: '00', msgheaders: [...] }
 * Kimlik: Basic (Netgsm kullanıcı adı / abone no : API şifresi). Gövdede code "00" değilse hata.
 * Bilgilendirme mesajında İYS süzgeci (iysfilter) verilmez. Ticari toplu SMS'te verilir: alıcı bireyselse "11", tacirse "12"
 * (Netgsm belgelerindeki değerler; canlıda Netgsm'den teyit edin). Netgsm, İYS'de reddetmiş alıcıya göndermez.
 */
import { trackExternal } from '../monitoring.js';

const BASE = () => process.env.NETGSM_API_URL || 'https://api.netgsm.com.tr';

export class NetgsmError extends Error {}

// Netgsm yanıt kodları (Netgsm'in kendi SDK'sındaki liste)
const CODES = {
  20: 'Mesaj metni hatalı ya da çok uzun',
  30: 'Kullanıcı adı / şifre hatalı ya da API erişim izni yok (Netgsm panelinde API kullanıcısı ve IP kısıtını kontrol edin)',
  40: 'Gönderici adı (SMS başlığı) bu hesapta tanımlı değil',
  50: 'İYS kontrollü gönderim yapılamadı',
  51: 'İYS\'de markanız tanımlı değil',
  70: 'Hatalı ya da eksik parametre',
  80: 'Gönderim hızı sınırı aşıldı',
  85: 'Aynı numaraya kısa sürede çok fazla mesaj (mükerrer gönderim sınırı)',
  100: 'Netgsm sistem hatası',
  101: 'Netgsm sistem hatası'
};
const describe = (code) => CODES[code] || `Netgsm hata kodu ${code ?? '—'}`;

const request = async (creds, method, path, body) => {
  const res = await fetch(`${BASE()}/sms/rest/v2${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  });
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') {
    const error = new NetgsmError(`Netgsm: beklenmeyen yanıt (HTTP ${res.status})`);
    error.status = res.status;
    throw error;
  }
  if (String(data.code) !== '00') {
    const error = new NetgsmError(`Netgsm: ${describe(data.code)}`);
    error.status = res.status;
    error.code = String(data.code);
    throw error;
  }
  return data;
};

export const IYS_FILTER = { INDIVIDUAL: '11', MERCHANT: '12' };

/** messages: [{ no: '5XXXXXXXXX', msg }] — tek istekte gider (Netgsm bire-çok gönderim). İş numarası döner. */
export const sendSms = (creds, messages, { iysfilter } = {}) => trackExternal('Netgsm', `SMS (${messages.length})`, async () => {
  const data = await request(creds, 'POST', '/send', { msgheader: creds.header, encoding: 'TR', ...(iysfilter && { iysfilter }), messages });
  return data.jobid || null;
});

/** Hesapta onaylı gönderici adları (SMS başlıkları); bilgileri doğrulamak için de kullanılır */
export const listHeaders = (creds) => trackExternal('Netgsm', 'Gönderici adları', async () => {
  const data = await request(creds, 'GET', '/msgheader');
  return [...new Set([...(data.msgheaders || []), ...(data.msgheader || [])])];
});
