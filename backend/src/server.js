import cluster from 'node:cluster';
import { PORT } from './config.js';
import { enforceConfig } from './services/configCheck.js';

/**
 * WEB_CONCURRENCY > 1 ise ana süreç o kadar işçi süreç başlatır; istekler işçiler arasında dağıtılır
 * (Node tek iş parçacıklıdır: ağır bir rapor hesaplanırken diğer istekler beklemesin).
 * Zamanlanmış işler (hatırlatmalar, raporlar, webhook kuyruğu, kargo senkronu) yalnızca ilk işçide çalışır.
 * Birden fazla süreçte REDIS_URL önerilir: istek sınırı, yapay zekâ kotası, tek kullanımlık giriş kodları ve
 * WhatsApp cevap kilidi süreçler arasında ortak olur. Toplam veritabanı bağlantısı = süreç × DB_POOL_SIZE.
 */
const WORKERS = Math.max(1, parseInt(process.env.WEB_CONCURRENCY) || 1);

if (WORKERS > 1 && cluster.isPrimary) {
  enforceConfig(); // canlıda eksik / güvensiz ayarla açılmaz
  console.log(`[Cluster] ${WORKERS} işçi süreç başlatılıyor (port ${PORT})`);
  const roles = new Map(); // worker.id -> JOB_RUNNER
  const fork = (jobRunner) => {
    const worker = cluster.fork({ JOB_RUNNER: jobRunner ? '1' : '0' });
    roles.set(worker.id, jobRunner);
  };
  for (let i = 0; i < WORKERS; i++) fork(i === 0);
  cluster.on('exit', (worker, code, signal) => {
    const jobRunner = roles.get(worker.id);
    roles.delete(worker.id);
    console.warn(`[Cluster] İşçi ${worker.process.pid} kapandı (${signal || code}); yenisi başlatılıyor`);
    fork(jobRunner);
  });
} else {
  if (!cluster.isWorker) enforceConfig();
  const { installErrorTracking } = await import('./services/errorTracker.js');
  installErrorTracking();
  const { default: app } = await import('./app.js');
  const { startNotificationJobs } = await import('./services/notificationService.js');
  const runsJobs = !cluster.isWorker || process.env.JOB_RUNNER === '1';

  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}${cluster.isWorker ? ` (işçi ${process.pid}${runsJobs ? ', zamanlanmış işler' : ''})` : ''}`);
    if (runsJobs) startNotificationJobs();
  });
  // Boştaki bağlantıyı Caddy'nin (2 dk) ardından kapat: Node'un 5 sn varsayılanında Caddy kapanmış bağlantıya istek
  // gönderip 502 alabilir, yoğunlukta da her düşünme arasında yeni bağlantı açılır.
  server.keepAliveTimeout = 125_000;
  server.headersTimeout = 126_000;
}
