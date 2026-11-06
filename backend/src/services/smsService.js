/**
 * SMS bildirimi: firma kendi Netgsm hesabını bağlar (Ayarlar → SMS), istediğinde kapatır (bilgiler silinmez).
 * Açıkken panel bildirimlerinin seçilen türleri, cep telefonu kayıtlı ve kapatmamış kullanıcılara SMS olarak da gider
 * (notificationService → fanOut). Yalnızca bilgilendirme mesajı; ücret firmanın Netgsm hesabından düşer.
 */
import { encrypt, decrypt } from '../utils/secretBox.js';
import { tenantPortalUrl } from '../config.js';
import * as netgsm from './sms/netgsm.js';

export const SMS_PROVIDERS = ['NETGSM'];
const MAX_LENGTH = 300; // Türkçe karakterli SMS 1 boyda ~155 karakter; en fazla 2 boy

export const smsCreds = (tenant) => {
  if (tenant?.smsProvider !== 'NETGSM' || !tenant.smsConfigEnc) return null;
  try { return JSON.parse(decrypt(tenant.smsConfigEnc)); } catch { return null; }
};
export const encryptSmsConfig = ({ username, password, header }) => encrypt(JSON.stringify({ username, password, header }));
/** SMS gönderilir mi: açık ve bilgiler tam */
export const smsActive = (tenant) => Boolean(tenant?.smsEnabled) && Boolean(smsCreds(tenant)?.header);

/**
 * Türkiye cep telefonu → 5XXXXXXXXX (Netgsm biçimi). Boşsa null; geçersizse hata.
 * Kabul: 05xx, +90 5xx, 90 5xx, 5xx (boşluk, tire, parantez serbest).
 */
export class PhoneError extends Error {}
export const normalizePhone = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let digits = raw.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (/^90\d{10}$/.test(digits)) digits = digits.slice(2);
  else if (/^0\d{10}$/.test(digits)) digits = digits.slice(1);
  if (!/^5\d{9}$/.test(digits)) throw new PhoneError('Geçerli bir cep telefonu girin (5XX XXX XX XX).');
  return digits;
};

/** Bildirimden SMS metni: "Firma: Başlık. Mesaj https://firma.../bayi/orders" (uzunsa mesaj kısalır, bağlantı kalır) */
export const smsText = (tenant, notification) => {
  const link = tenant ? `${tenantPortalUrl(tenant)}${notification.link || '/login'}` : '';
  const text = `${tenant?.name ? `${tenant.name}: ` : ''}${notification.title}. ${notification.message || ''}`.replace(/\s+/g, ' ').trim();
  const room = MAX_LENGTH - (link ? link.length + 1 : 0);
  const body = text.length > room ? `${text.slice(0, room - 1).trimEnd()}…` : text;
  return link ? `${body} ${link}` : body;
};

/** items: [{ phone, text }] → tek Netgsm isteği. Hata fırlatır (çağıran yakalar; İzleme'de dış servis kaydı olur). */
export const sendSmsBatch = async (tenant, items) => {
  const creds = smsCreds(tenant);
  if (!creds || !items.length) return null;
  return netgsm.sendSms(creds, items.map((i) => ({ no: i.phone, msg: i.text })));
};

export const testSms = (creds, phone, tenantName) =>
  netgsm.sendSms(creds, [{ no: phone, msg: `${tenantName}: SMS bildirimleri bağlandı. Bu bir deneme mesajıdır.` }]);
export const smsHeaders = (creds) => netgsm.listHeaders(creds);
