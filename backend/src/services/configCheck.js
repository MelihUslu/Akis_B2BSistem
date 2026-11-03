/**
 * Ortam ayarlarının kontrolü. Canlıda (NODE_ENV=production) hata varsa sunucu açılmaz;
 * uyarılar açılışta loglanır ve platform panelindeki "Sistem durumu"nda görünür.
 * Değerlerin kendisi (anahtar, şifre) hiçbir zaman döndürülmez, yalnızca var / yok bilgisi.
 *
 * Elle kontrol:  cd backend && npm run check:config
 */
const env = (k) => String(process.env[k] ?? '').trim();
const isLocal = (v) => /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(v);

export const checkConfig = () => {
  const production = env('NODE_ENV') === 'production';
  const errors = [];
  const warnings = [];
  const items = [];
  const add = (key, label, ok, note) => items.push({ key, label, ok: Boolean(ok), note: note || null });

  // ── Zorunlular ──────────────────────────────────────────────────────────────
  const jwt = env('JWT_SECRET');
  add('JWT_SECRET', 'Oturum anahtarı (JWT_SECRET)', jwt.length >= 32, jwt ? (jwt.length < 32 ? 'en az 32 karakter olmalı' : null) : 'tanımlı değil');
  if (jwt.length < 32) (production ? errors : warnings).push('JWT_SECRET en az 32 karakterlik rastgele bir değer olmalı (openssl rand -base64 48).');

  const enc = env('ENCRYPTION_KEY');
  add('ENCRYPTION_KEY', 'Şifreleme anahtarı (ENCRYPTION_KEY)', enc.length >= 32, enc ? null : 'tanımlı değil — POS / e-fatura / kargo anahtarları JWT_SECRET ile şifrelenir');
  if (!enc) (production ? errors : warnings).push('ENCRYPTION_KEY tanımlı değil. Tanımlanmazsa kayıtlı POS / e-fatura anahtarları JWT_SECRET değişince çözülemez.');
  else if (enc.length < 32) warnings.push('ENCRYPTION_KEY en az 32 karakter olmalı.');

  const root = env('ROOT_DOMAIN') || 'localhost';
  add('ROOT_DOMAIN', `Kök alan adı (${root})`, !isLocal(root));
  if (production && isLocal(root)) errors.push('ROOT_DOMAIN canlıda gerçek alan adı olmalı (ör. akisb2b.com).');

  const proto = env('FRONTEND_PROTOCOL') || 'http';
  add('FRONTEND_PROTOCOL', `Bağlantılarda protokol (${proto})`, proto === 'https');
  if (production && proto !== 'https') errors.push('FRONTEND_PROTOCOL canlıda https olmalı (e-posta ve paylaşım bağlantıları).');
  if (production && env('FRONTEND_PORT')) warnings.push('FRONTEND_PORT canlıda genelde boş olmalı (bağlantılarda port görünür).');

  const api = env('API_PUBLIC_URL');
  add('API_PUBLIC_URL', 'Backend dış adresi (API_PUBLIC_URL)', api && !isLocal(api) && api.startsWith('https://'), api ? null : 'tanımlı değil');
  if (production && (!api || isLocal(api) || !api.startsWith('https://'))) errors.push('API_PUBLIC_URL canlıda https ile başlayan dış adres olmalı (ödeme geri dönüşleri, dosya bağlantıları).');

  if (production && env('FX_FIXED')) errors.push('FX_FIXED yalnızca testler içindir; canlıda tanımlanmamalı.');
  if (production && env('AI_PROVIDER').toLowerCase() === 'mock') errors.push('AI_PROVIDER=mock canlıda kullanılamaz (örnek yapay zekâ).');
  if (production && env('SEED_DEMO') === 'true') warnings.push('SEED_DEMO=true: boş veritabanında demo firması oluşturulur. Canlıda kapatın.');
  if (production && env('PLATFORM_ADMIN_PASSWORD') && env('PLATFORM_ADMIN_PASSWORD').length < 12) warnings.push('PLATFORM_ADMIN_PASSWORD kısa; ilk girişten sonra platform panelinden değiştirin ve 2FA açın.');

  // ── İsteğe bağlı servisler (eksikse ilgili özellik çalışmaz) ────────────────
  const smtp = Boolean(env('SMTP_HOST'));
  add('SMTP', 'E-posta (SMTP)', smtp, smtp ? null : 'şifre sıfırlama, teklif, ekstre ve bildirim e-postaları gitmez');
  if (!smtp) warnings.push('SMTP tanımlı değil: şifre sıfırlama, teklif, ekstre ve bildirim e-postaları gönderilmez.');
  if (smtp && !env('MAIL_FROM')) warnings.push('MAIL_FROM tanımlı değil; gönderen adresi SMTP_USER olur.');

  const vapid = env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY');
  add('VAPID', 'Telefon / masaüstü bildirimi (VAPID)', vapid, vapid ? null : 'push bildirimleri kapalı');
  const workers = parseInt(env('WEB_CONCURRENCY')) || 1;
  if (workers > 1 && !env('REDIS_URL')) warnings.push(`WEB_CONCURRENCY=${workers} ama REDIS_URL yok: istek sınırı, yapay zekâ kotası, tek kullanımlık giriş kodu ve WhatsApp cevap kilidi süreç başına ayrı tutulur. Birden çok süreçte Redis kullanın.`);
  if (workers > 1 && parseInt(env('DB_POOL_SIZE')) * workers > 90) warnings.push(`Toplam veritabanı bağlantısı ${workers} × ${env('DB_POOL_SIZE')} = ${workers * parseInt(env('DB_POOL_SIZE'))}; PostgreSQL max_connections (varsayılan 100) aşılabilir.`);
  if (!vapid) warnings.push('VAPID anahtarları yok: telefona / masaüstüne anlık bildirim gönderilemez (npx web-push generate-vapid-keys).');

  const aiProvider = (env('AI_PROVIDER') || 'anthropic').toLowerCase();
  const ai = aiProvider === 'mock' ? !production : Boolean(env('AI_API_KEY') || env('ANTHROPIC_API_KEY'));
  add('AI', 'Yapay zekâ ile teklif', ai, aiProvider === 'mock' ? 'örnek (mock) mod' : ai ? null : 'AI_API_KEY yok — teklifler manuel hazırlanır');
  if (!ai && aiProvider !== 'mock') warnings.push('AI_API_KEY tanımlı değil: yapay zekâ ile teklif kapalı (manuel teklif çalışır).');

  const redis = Boolean(env('REDIS_URL'));
  add('REDIS', 'Redis (istek sınırı, zamanlanmış iş kilidi)', redis, redis ? null : 'tek sunucuda sorun değil; birden çok backend için gerekli');
  if (production && !redis) warnings.push('REDIS_URL yok: birden fazla backend örneği çalıştırılırsa istek sınırları ve zamanlanmış işler sunucu başına ayrı çalışır.');

  const alert = Boolean(env('PLATFORM_ALERT_EMAIL'));
  add('ALERT', 'Hata / destek uyarı e-postası', alert && smtp, alert ? (smtp ? null : 'SMTP yok') : 'PLATFORM_ALERT_EMAIL yok');
  if (!alert) warnings.push('PLATFORM_ALERT_EMAIL yok: yeni hata, destek talebi ve ödeme sorunlarında e-posta uyarısı gelmez.');

  const iyzico = env('IYZICO_API_KEY') && env('IYZICO_SECRET_KEY');
  add('IYZICO', 'Abonelik tahsilatı (iyzico)', iyzico, iyzico ? (env('IYZICO_BASE_URL').includes('sandbox') ? 'sandbox' : null) : 'abonelik ödemeleri elle işlenir');
  if (production && iyzico && env('IYZICO_BASE_URL').includes('sandbox')) warnings.push('IYZICO_BASE_URL sandbox adresi; canlı tahsilat için api.iyzipay.com kullanın.');

  const parasut = env('PARASUT_CLIENT_ID') && env('PARASUT_CLIENT_SECRET');
  add('PARASUT', 'Platform abonelik faturası (Paraşüt)', parasut, parasut ? null : 'abonelik faturaları elle kesilir');

  return { production, errors, warnings, items, ok: errors.length === 0 };
};

// Açılışta: canlıda hata varsa durdur, uyarıları logla
export const enforceConfig = () => {
  const { production, errors, warnings } = checkConfig();
  for (const w of warnings) console.warn(`[Ayar] Uyarı: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`[Ayar] HATA: ${e}`);
    if (production) {
      console.error('[Ayar] Canlı ortam ayarları eksik veya güvensiz; sunucu başlatılmadı. Ayrıntı: docs/canliya-cikis.md');
      process.exit(1);
    }
  }
};
