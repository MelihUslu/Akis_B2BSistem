import { basePrisma as db } from '../utils/prisma.js';
import { localDay } from '../utils/dates.js';

/**
 * Tanıtım sitesi ayarları (platform düzeyi; Platform → Geliştirici → Site ve Chatbot).
 * Gruplar: company (firma bilgileri), demo (canlı demo hesabı), legal (yasal metin geçersiz kılmaları),
 * chatbot, tracking (reklam ölçüm kimlikleri), billing (abonelik havale bilgileri). Kayıtlı olmayan alanlar varsayılanla tamamlanır.
 */
export const SITE_DEFAULTS = {
  company: {
    brand: process.env.PLATFORM_NAME || 'Akis B2B',
    legalName: '', address: '', phone: '', whatsapp: '', email: process.env.PLATFORM_ALERT_EMAIL || '',
    taxOffice: '', taxNumber: '', mersis: '', kepAddress: ''
  },
  demo: { enabled: false, url: '', adminEmail: '', adminPassword: '', dealerEmail: '', dealerPassword: '' },
  legal: { kvkk: '', privacy: '', terms: '', cookies: '', updatedAt: '' },
  chatbot: {
    enabled: true,
    botName: 'Asistan',
    greeting: 'Merhaba! B2B sipariş portalımız hakkında merak ettiklerinizi sorabilirsiniz. Fiyatlar, özellikler, kurulum ya da demo için buradayım.',
    quickReplies: ['Fiyatlar nedir?', 'ERP ile çalışır mı?', 'Demo görmek istiyorum', 'Sizi arayalım'],
    knowledge: '',
    handoffMessage: 'Ekibimiz en kısa sürede size dönecek. Telefon numaranızı ya da e-postanızı yazarsanız hemen iletirim.'
  },
  tracking: { metaPixelId: '', googleTagId: '', googleAdsConversion: '' },
  // Abonelik ödemesi için havale / EFT bilgileri (firma panelindeki Abonelik sayfasında gösterilir)
  billing: { bankName: '', accountName: '', iban: '', transferNote: '' }
};

const clean = (group, value) => {
  const base = SITE_DEFAULTS[group];
  const out = {};
  for (const [k, def] of Object.entries(base)) {
    const v = value?.[k];
    if (Array.isArray(def)) out[k] = Array.isArray(v) ? v.map((x) => String(x).slice(0, 80)).filter(Boolean).slice(0, 6) : def;
    else if (typeof def === 'boolean') out[k] = typeof v === 'boolean' ? v : def;
    else out[k] = v == null ? def : String(v).slice(0, k === 'knowledge' || group === 'legal' ? 40000 : 500);
  }
  return out;
};

let cache = null;
let cacheAt = 0;
export const getSiteSettings = async () => {
  if (cache && Date.now() - cacheAt < 30_000) return cache;
  const rows = await db.siteSetting.findMany();
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  cache = Object.fromEntries(Object.keys(SITE_DEFAULTS).map((g) => [g, clean(g, byKey[g] || {})]));
  cacheAt = Date.now();
  return cache;
};

export const saveSiteSettings = async (patch) => {
  for (const group of Object.keys(SITE_DEFAULTS)) {
    if (!patch?.[group]) continue;
    const value = clean(group, patch[group]);
    if (group === 'legal') value.updatedAt = localDay();
    await db.siteSetting.upsert({ where: { key: group }, create: { key: group, value }, update: { value } });
  }
  cache = null;
  return getSiteSettings();
};

// Ziyaretçiye gönderilen görünüm (chatbot ek bilgi metni gönderilmez)
export const publicSiteSettings = async () => {
  const s = await getSiteSettings();
  const { knowledge, handoffMessage, ...chatbot } = s.chatbot;
  return { company: s.company, demo: s.demo.enabled ? s.demo : { enabled: false }, legal: s.legal, chatbot, tracking: s.tracking };
};
