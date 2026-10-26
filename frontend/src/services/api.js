import axios from 'axios';
import { TENANT_SLUG, CUSTOM_HOST } from '../utils/tenant';
import { getLang } from '../i18n';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

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
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: 401 = oturum geçersiz (süresi dolmuş, askıya alınmış hesap).
// 402 = firmanın aboneliği kapalı. 403 sadece "bu işleme yetkin yok" demektir, oturumu kapatmaz.
api.interceptors.response.use(
  (response) => response,
  (error) => {
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

export default api;
