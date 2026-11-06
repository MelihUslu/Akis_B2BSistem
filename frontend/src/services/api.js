import axios from 'axios';
import { TENANT_SLUG, CUSTOM_HOST } from '../utils/tenant';
import { getLang } from '../i18n';
import { actingHeader } from '../utils/acting';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
export const API_BASE = baseURL;

// ─── Kiracı API'si (admin + bayi) ────────────────────────────────────────────
const api = axios.create({ baseURL });

// Request interceptor: token ve firma (alt alan adı) bilgisi her isteğe eklenir
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('akis_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (TENANT_SLUG) config.headers['X-Tenant'] = TENANT_SLUG;
    else if (CUSTOM_HOST) config.headers['X-Tenant-Host'] = CUSTOM_HOST;
    config.headers['X-Lang'] = getLang(); // API mesajları bayinin dilinde döner
    Object.assign(config.headers, actingHeader()); // yönetici / plasiyer bayi adına işlem yapıyorsa
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 503 + Retry-After: sunucu çok yoğun (kampanya anı gibi). Okuma istekleri en fazla 2 kez, biraz bekleyip yeniden denenir;
// kullanıcı çoğu zaman hata görmez. Yazma istekleri yeniden denenmez (çift kayıt olmasın), mesaj gösterilir.
const retryWhenBusy = (client, error) => {
  const { config, response } = error;
  if (response?.status !== 503 || !config || (config.method || 'get') !== 'get' || (config.busyRetries || 0) >= 2) return null;
  config.busyRetries = (config.busyRetries || 0) + 1;
  const wait = Math.min(5, parseInt(response.headers?.['retry-after']) || 2) * 1000 + Math.random() * 1000;
  return new Promise((resolve) => setTimeout(resolve, wait)).then(() => client(config));
};

// Response interceptor: 401 = oturum geçersiz (süresi dolmuş, askıya alınmış hesap).
// 402 = firmanın aboneliği kapalı. 403 sadece "bu işleme yetkin yok" demektir, oturumu kapatmaz.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const retry = retryWhenBusy(api, error);
    if (retry) return retry;
    const status = error.response?.status;
    if (status === 401 || (status === 402 && JSON.parse(localStorage.getItem('akis_user') || '{}').role !== 'ADMIN')) {
      localStorage.removeItem('akis_token');
      localStorage.removeItem('akis_user');
      if (status === 402) sessionStorage.setItem('akis_login_notice', error.response.data?.message || '');
      // Use window.location instead of navigate because we are outside a component
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    } else if (status === 402 && !window.location.pathname.startsWith('/admin/subscription')) {
      // Yönetici ödeme yapıp hesabı açabilsin diye abonelik sayfasına yönlendirilir
      window.location.href = '/admin/subscription';
    }
    return Promise.reject(error);
  }
);

// ─── Platform API'si (SUPER_ADMIN) ───────────────────────────────────────────
export const platformApi = axios.create({ baseURL: `${baseURL}/platform` });

platformApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('akis_platform_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

platformApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('akis_platform_token');
      localStorage.removeItem('akis_platform_user');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Herkese açık uçlar (kayıt, doğrulama, paketler) ─────────────────────────
export const publicApi = axios.create({ baseURL: `${baseURL}/public` });

export const errorMessage = (error, fallback = 'Beklenmeyen bir hata oluştu.') =>
  error?.response?.data?.message || fallback;

// Oturumdaki kullanıcı ve firması (/auth/me). Sayfa açılırken oturum tazeleme, destek menüsü ve katalog aynı anda
// ister: 10 sn içindeki istekler tek yanıtı paylaşır. Oturum ya da "bayi adına işlem" değişince yeniden istenir.
let me = null;
export const getMe = () => {
  const key = `${localStorage.getItem('akis_token')}|${JSON.stringify(actingHeader())}`;
  if (me && me.key === key && Date.now() - me.at < 10_000) return me.promise;
  const promise = api.get('/auth/me');
  me = { key, at: Date.now(), promise };
  promise.catch(() => { if (me?.promise === promise) me = null; });
  return promise;
};

export default api;
