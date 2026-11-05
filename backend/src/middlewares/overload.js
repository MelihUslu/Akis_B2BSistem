/**
 * Aşırı yükte hızlı ret (yük atma). Bir işçi süreç aynı anda MAX_INFLIGHT'tan (varsayılan 100) fazla istek işliyorsa
 * yenilerine hemen 503 + Retry-After döner. Böylece yoğunlukta kuyruk birikmez: içeride işlenenler makul sürede biter,
 * fazlası birkaç saniye sonra yeniden dener (ön yüz okuma isteklerini kendiliğinden yeniden dener).
 * Ani yük testinde (kapasitenin ~3 katı, 5 Kasım 2026) yük atma yokken istekler kuyrukta 60 sn bekleyip zaman aşımına
 * düşüyordu. Normal yoğunlukta bir işçide aynı anda 10'dan az istek olur; 100, sürecin saniyeye yakın geride kaldığı anlamına gelir.
 * Caddy'nin backend'e açtığı bağlantı sınırıyla birlikte çalışır (deploy/Caddyfile: max_conns_per_host 1024 → 4 işçide
 * işçi başına 256): eşik bunun altında olmalı ki fazla istek Caddy'de kuyrukta beklemesin, buradan hemen 503 alsın.
 * Ölçüm (kapasitenin 3 katı, Caddy arkasında): zaman aşımı yok, tepede %95 süre ~2 sn, fazlası anında 503.
 * Muaf: sağlık kontrolü ve dışarıdan gelen dönüşler (ödeme, Google girişi, WhatsApp) — bunlar kaybolmamalı.
 */
import { dbDown } from '../utils/dbHealth.js';

const MAX = Math.max(10, parseInt(process.env.MAX_INFLIGHT) || 100);
const EXEMPT = /^\/(health|api\/public\/(iyzico|pos|google)\/callback|api\/whatsapp\/webhook\/)/;
let inflight = 0;

export const overload = (req, res, next) => {
  if (EXEMPT.test(req.path)) return next();
  if (inflight >= MAX) {
    res.set('Retry-After', '3');
    return res.status(503).json({ message: 'Sistem şu an çok yoğun. Birkaç saniye sonra tekrar deneyin.' });
  }
  inflight++;
  let done = false;
  const end = () => { if (!done) { done = true; inflight--; } };
  res.on('finish', end);
  res.on('close', end);
  next();
};

export const inflightCount = () => inflight;

/** Veritabanı kısa süre önce ulaşılamaz göründüyse (utils/dbHealth.js) istek veritabanına gitmeden 503 alır. */
export const dbGate = (req, res, next) => {
  if (!dbDown() || EXEMPT.test(req.path)) return next();
  res.set('Retry-After', '3');
  return res.status(503).json({ message: 'Sisteme şu an ulaşılamıyor. Birkaç saniye sonra tekrar deneyin.' });
};
