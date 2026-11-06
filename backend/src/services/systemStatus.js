import { basePrisma } from '../utils/prisma.js';
import { redisReady } from '../utils/redis.js';
import { checkConfig } from './configCheck.js';
import { getExchangeRates } from './exchangeRateService.js';
import { lastBackup, backupRuns, driveStatus } from './backupStatus.js';

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

// Platform paneli "Sistem durumu"
export const systemStatus = async () => {
  const [health, backup, runs, fx] = await Promise.all([systemHealth(), lastBackup(), backupRuns().catch(() => []), getExchangeRates().catch(() => null)]);
  const config = checkConfig();
  return {
    ...health,
    nodeEnv: process.env.NODE_ENV || 'development',
    config: { production: config.production, items: config.items, warnings: config.warnings, errors: config.errors },
    backup,
    drive: driveStatus(runs),
    exchangeRates: fx ? { source: fx.source, date: fx.date, stale: Boolean(fx.stale), ok: Boolean(fx.rates?.USD && fx.rates?.EUR) } : { ok: false }
  };
};
