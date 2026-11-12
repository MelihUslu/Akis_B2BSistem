import https from 'node:https';
import { execFile } from 'node:child_process';

/**
 * Güncelleme bildirimi (Platform → Sistem Durumu). SADECE BİLDİRİR — güncellemeyi kendisi YAPMAZ.
 * Sunucuda güncelleme, gösterilen komutla elle çalıştırılır (bkz. docs/canliya-cikis.md §7).
 *
 * İki kaynak:
 *   - Yeni sürüm: GitHub'daki en yüksek `Version.X` etiketi, çalışan sürümle (APP_VERSION) kıyaslanır.
 *   - Güvenlik: `npm audit` (yüksek + kritik), arka planda çalışır, sonucu önbelleğe alınır.
 *
 * Dış çağrılar ve denetim arka planda (stale-while-revalidate) yapılır; panel isteği hiç bloklanmaz.
 */

const REPO = (process.env.UPDATE_REPO || 'MelihUslu/Akis_B2BSistem').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
const COMPOSE = process.env.COMPOSE_FILE || 'docker-compose.prod.yml';
const TAG_TTL = 60 * 60 * 1000;      // sürüm kontrolü: saatte bir
const AUDIT_TTL = 12 * 60 * 60 * 1000; // güvenlik denetimi: 12 saatte bir

export const currentVersion = () => (process.env.APP_VERSION || '').trim() || null;

// "Version.1.2" / "v1.2" / "1.2.3" → [1,2] ; ayrıştırılamazsa null
const parseVer = (s) => {
  const m = String(s || '').match(/(\d+(?:\.\d+)*)/);
  return m ? m[1].split('.').map(Number) : null;
};
const cmp = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
};

// Basit stale-while-revalidate önbellek: bayat (ya da force) ise arka planda yeniler, eldekini hemen döndürür
const makeCache = (ttl, fn) => {
  let state = { value: null, at: 0, inflight: null };
  return (force = false) => {
    const stale = force || Date.now() - state.at > ttl;
    if (stale && !state.inflight) {
      state.inflight = Promise.resolve()
        .then(fn)
        .then((value) => { state = { value, at: Date.now(), inflight: null }; })
        .catch(() => { state.inflight = null; }); // hata: eldeki değer kalır, sonra yine denenir
    }
    return state.value;
  };
};

const httpsJson = (url) => new Promise((resolve, reject) => {
  const req = https.get(url, { headers: { 'User-Agent': 'Akis-B2B-UpdateCheck', Accept: 'application/vnd.github+json' }, timeout: 8000 }, (res) => {
    if (res.statusCode !== 200) { res.resume(); return reject(new Error(`GitHub ${res.statusCode}`)); }
    let body = '';
    res.on('data', (c) => { body += c; if (body.length > 1_000_000) req.destroy(); });
    res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
  });
  req.on('timeout', () => req.destroy(new Error('GitHub zaman aşımı')));
  req.on('error', reject);
});

const latestTag = makeCache(TAG_TTL, async () => {
  const tags = await httpsJson(`https://api.github.com/repos/${REPO}/tags?per_page=30`);
  if (!Array.isArray(tags)) return null;
  const versioned = tags.map((t) => t.name).filter((n) => parseVer(n));
  versioned.sort((a, b) => cmp(parseVer(b), parseVer(a)));
  return versioned[0] || null;
});

const runNpmAudit = () => new Promise((resolve) => {
  // Üretim bağımlılıkları; npm audit açık bulunca 1 ile çıkar (hata değil), stdout yine JSON
  execFile('npm', ['audit', '--omit=dev', '--json'], { cwd: process.cwd(), timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
    try {
      const v = JSON.parse(stdout).metadata?.vulnerabilities || {};
      resolve({ critical: v.critical || 0, high: v.high || 0, moderate: v.moderate || 0, low: v.low || 0, total: v.total ?? ((v.critical || 0) + (v.high || 0) + (v.moderate || 0) + (v.low || 0)) });
    } catch {
      resolve({ error: true }); // npm yok / ağ yok / çıktı okunamadı
    }
  });
});
const auditResult = makeCache(AUDIT_TTL, runNpmAudit);

export const updateStatus = ({ refresh = false } = {}) => {
  const current = currentVersion();
  const latest = latestTag(refresh);   // null olabilir (ilk çağrı ya da ulaşılamadı)
  const security = auditResult(refresh); // null olabilir (ilk çağrı: henüz denetlenmedi)

  const cv = current && parseVer(current);
  const lv = latest && parseVer(latest);
  const updateAvailable = Boolean(cv && lv && cmp(lv, cv) > 0);
  const securityUpdate = Boolean(security && !security.error && (security.high > 0 || security.critical > 0));

  const target = latest || '<yeni-sürüm>';
  const prev = current || '<önceki-sürüm>';
  const commands = {
    backup: `docker compose -f ${COMPOSE} exec backup /scripts/backup.sh`,
    update: `git fetch --tags && git checkout ${target} && APP_VERSION=${target} docker compose -f ${COMPOSE} up -d --build`,
    rollback: `git checkout ${prev} && APP_VERSION=${prev} docker compose -f ${COMPOSE} up -d --build`
  };

  return {
    current, latest, updateAvailable, security, securityUpdate,
    commands,
    repoUrl: `https://github.com/${REPO}`,
    releasesUrl: `https://github.com/${REPO}/releases`,
    compareUrl: current && latest ? `https://github.com/${REPO}/compare/${current}...${latest}` : null,
    versionKnown: Boolean(current),
    checkedAt: new Date().toISOString()
  };
};
