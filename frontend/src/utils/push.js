import api from '../services/api';

/**
 * Web Push: uygulama (PWA) kapalıyken de telefona / masaüstüne bildirim.
 * Abonelik cihaza ve giriş yapan kullanıcıya bağlıdır; çıkışta bu cihazın aboneliği silinir.
 */
export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// iOS'ta push yalnızca ana ekrana eklenen uygulamada çalışır
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

const registration = async () =>
  (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.register('/sw.js');

const toKey = (base64) => {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

// İzin verilmişse aboneliği oluşturur / tazeler ve sunucuya kaydeder. true = push açık
export const syncPush = async () => {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try {
    const { data } = await api.get('/notifications/push');
    if (!data.enabled) return false;
    const reg = await registration();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // Sunucu anahtarı değiştiyse eski aboneliği yenile
    if (sub && sub.options?.applicationServerKey) {
      const current = new Uint8Array(sub.options.applicationServerKey);
      const wanted = toKey(data.publicKey);
      if (current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(data.publicKey) });
    await api.post('/notifications/push/subscribe', { subscription: sub.toJSON() });
    return true;
  } catch {
    return false;
  }
};

export const enablePush = async () => {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission === 'granted') await syncPush();
  return permission;
};

// Çıkışta: bu cihaz başka kullanıcıya geçerse önceki kullanıcının bildirimleri gelmesin
export const disablePushOnLogout = async () => {
  if (!pushSupported()) return;
  const token = localStorage.getItem('akis_token'); // çıkış token'ı silmeden önce alınır
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    if (token) await api.post('/notifications/push/unsubscribe', { endpoint: sub.endpoint }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    await sub.unsubscribe();
  } catch { /* yoksay */ }
};
