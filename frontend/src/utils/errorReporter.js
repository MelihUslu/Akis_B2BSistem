// Tarayıcıda oluşan hataları platformun hata izlemesine gönderir (geliştirmede yalnızca konsola yazar)
const API = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
const sent = new Set(); // aynı hatayı tekrar tekrar göndermemek için

export const reportError = (error, extra = {}) => {
  const message = String(error?.message || error || 'Bilinmeyen hata').slice(0, 1000);
  const key = `${message}|${extra.componentStack || ''}`.slice(0, 300);
  if (sent.has(key) || sent.size > 20) return;
  sent.add(key);
  if (!import.meta.env.PROD) return;
  try {
    fetch(`${API}/public/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, stack: `${error?.stack || ''}${extra.componentStack ? `\n--- bileşen ---${extra.componentStack}` : ''}`.slice(0, 6000), url: window.location.href }),
      keepalive: true
    }).catch(() => {});
  } catch { /* raporlama asla uygulamayı bozmaz */ }
};

export const installErrorReporter = () => {
  window.addEventListener('error', (e) => reportError(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => {
    // API hataları (axios) zaten kullanıcıya gösteriliyor; yalnızca kod hataları raporlanır
    if (e.reason?.isAxiosError) return;
    reportError(e.reason);
  });
};
