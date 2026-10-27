import fs from 'fs/promises';
import path from 'path';
import { basePrisma } from '../utils/prisma.js';
import { redisReady } from '../utils/redis.js';
import { checkConfig } from './configCheck.js';
import { getExchangeRates } from './exchangeRateService.js';

const started = Date.now();

// Canlılık + bağımlılıklar (dış izleme için; gizli bilgi içermez)
export const systemHealth = async () => {
  const t0 = Date.now();
  let db = false;
  try { await basePrisma.$queryRaw`SELECT 1`; db = true; } catch { db = false; }
  return {
    ok: db,
    db: { ok: db, ms: Date.now() - t0 },
    redis: process.env.REDIS_URL ? { ok: Boolean(redisReady()) } : { ok: null, note: 'tanımlı değil' },
    uptimeSeconds: Math.round((Date.now() - started) / 1000)
  };
};

/**
 * Son yedek: BACKUP_DIR (Compose'da ./backups salt okunur bağlanır) içindeki en yeni veritabanı yedeği.
 * 26 saatten eski ise uyarı verilir (yedek günlük 03:00'te alınır).
 */
const lastBackup = async () => {
  const dir = process.env.BACKUP_DIR;
  if (!dir) return { configured: false, note: 'BACKUP_DIR tanımlı değil; yedek durumu izlenmiyor' };
  try {
    const files = (await fs.readdir(dir)).filter((f) => /^db-.*\.dump$/.test(f));
    if (!files.length) return { configured: true, ok: false, note: 'Hiç yedek yok' };
    const stats = await Promise.all(files.map(async (f) => ({ f, s: await fs.stat(path.join(dir, f)) })));
    const latest = stats.sort((a, b) => b.s.mtimeMs - a.s.mtimeMs)[0];
    const ageHours = Math.round((Date.now() - latest.s.mtimeMs) / 36e5);
    return { configured: true, ok: ageHours <= 26 && latest.s.size > 0, file: latest.f, size: latest.s.size, at: latest.s.mtime, ageHours, count: files.length };
  } catch (error) {
    return { configured: true, ok: false, note: `Yedek klasörü okunamadı (${error.code || error.message})` };
  }
};

// Platform paneli "Sistem durumu"
export const systemStatus = async () => {
  const [health, backup, fx] = await Promise.all([systemHealth(), lastBackup(), getExchangeRates().catch(() => null)]);
  const config = checkConfig();
  return {
    ...health,
    nodeEnv: process.env.NODE_ENV || 'development',
    config: { production: config.production, items: config.items, warnings: config.warnings, errors: config.errors },
    backup,
    exchangeRates: fx ? { source: fx.source, date: fx.date, stale: Boolean(fx.stale), ok: Boolean(fx.rates?.USD && fx.rates?.EUR) } : { ok: false }
  };
};
