/**
 * Yedek durumu (Platform → Sistem Durumu, Platform → Yedekler, günlük özet e-postası). Yedek servisi ayrı konteynerde
 * çalışır (scripts/backup.sh); backend yalnızca BACKUP_DIR'i (Compose'da ./backups, salt okunur) okur.
 */
import fs from 'fs/promises';
import path from 'path';

/**
 * Son yedek: BACKUP_DIR (Compose'da ./backups salt okunur bağlanır) içindeki en yeni veritabanı yedeği.
 * 26 saatten eski ise uyarı verilir (yedek günlük 03:00'te alınır).
 */
export const lastBackup = async () => {
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

/**
 * Yedek geçmişi: yedek servisi (scripts/backup.sh) her çalışmada BACKUP_DIR/.yedek-gecmisi.jsonl'a bir satır yazar
 * (ne alındı, Drive kopyası, bağlantılar, hata). En yeni önce; okunamayan satır atlanır.
 */
export const backupRuns = async () => {
  const dir = process.env.BACKUP_DIR;
  if (!dir) return [];
  try {
    const text = await fs.readFile(path.join(dir, '.yedek-gecmisi.jsonl'), 'utf8');
    return text.split('\n').filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean).reverse();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

/** Google Drive kopyası: son denemenin sonucu ve son başarılı kopya (26 saatten eskiyse uyarı). */
export const driveStatus = (runs) => {
  const tried = runs.filter((r) => ['ok', 'hata', 'atlandi'].includes(r.drive?.status));
  if (!tried.length) return { configured: false, note: 'Google Drive kopyası kurulmadı (scripts/drive-setup.sh)' };
  const lastOk = tried.find((r) => r.drive.status === 'ok');
  const ageHours = lastOk ? Math.round((Date.now() - new Date(lastOk.end).getTime()) / 36e5) : null;
  const last = tried[0];
  return {
    configured: true,
    ok: last.drive.status === 'ok' && ageHours <= 26,
    lastOkAt: lastOk?.end || null,
    ageHours,
    error: last.drive.status === 'ok' ? null : (last.drive.error || last.error || 'Drive adımına gelinmedi'),
    folderLink: tried.find((r) => r.drive.folderLink)?.drive.folderLink || null
  };
};

// Platform paneli "Yedekler": özet + geçmiş
export const backupOverview = async () => {
  const [backup, runs] = await Promise.all([lastBackup(), backupRuns()]);
  return { backup, drive: driveStatus(runs), runs };
};
