import { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';
import { getLang } from '../i18n';

// Telefona kurulan uygulama firmanın adıyla görünsün: manifest firma bilgisiyle tarayıcıda üretilir
const applyManifest = (tenant) => {
  try {
    const origin = window.location.origin;
    const manifest = {
      id: `${origin}/`,
      name: `${tenant.name} B2B`,
      short_name: tenant.name.length > 14 ? tenant.name.slice(0, 14) : tenant.name,
      description: `${tenant.name} bayi portalı`,
      start_url: `${origin}/`,
      scope: `${origin}/`,
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#14283F',
      theme_color: '#986B47',
      lang: getLang(),
      icons: [
        { src: `${origin}/icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${origin}/icon-512.png`, sizes: '512x512', type: 'image/png' },
        { src: `${origin}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };
    const link = document.querySelector('link[rel="manifest"]');
    if (link) link.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', tenant.name);
  } catch { /* eski tarayıcı: statik manifest kalır */ }
};

const TenantContext = createContext(null);

// Son alınan firma bilgisi tarayıcıda saklanır (her alt alan adı ayrı köken, ayrı kayıt): sayfa onu beklemeden
// çizilir, yenisi arka planda alınır. Yoğunlukta bu istek 0,5–0,9 sn sürüp açılışa olduğu gibi ekleniyordu.
const CACHE_KEY = 'akis_tenant';
const readCached = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || null; } catch { return null; }
};
const apply = (tenant) => {
  document.title = `${tenant.name} · B2B Portal`;
  applyManifest(tenant);
};

/**
 * Alt alan adındaki firmanın marka bilgisi (ad, logo) ve erişim durumu.
 * Firma bulunamazsa `notFound` true olur.
 */
export const TenantProvider = ({ children }) => {
  const [state, setState] = useState(() => {
    const cached = readCached();
    return cached ? { loading: false, tenant: cached, notFound: false } : { loading: true, tenant: null, notFound: false };
  });

  const refresh = () =>
    api.get('/tenant/public')
      .then((res) => {
        setState({ loading: false, tenant: res.data, notFound: false });
        apply(res.data);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(res.data)); } catch { /* gizli sekme */ }
      })
      .catch((err) => {
        const notFound = err.response?.status === 404;
        if (notFound) try { localStorage.removeItem(CACHE_KEY); } catch { /* gizli sekme */ }
        // Ağ hatasında saklanan bilgiyle devam edilir
        setState((prev) => (prev.tenant && !notFound ? prev : { loading: false, tenant: null, notFound }));
      });

  useEffect(() => {
    const cached = readCached();
    if (cached) apply(cached);
    refresh();
  }, []);

  return <TenantContext.Provider value={{ ...state, refresh }}>{children}</TenantContext.Provider>;
};

export const useTenant = () => useContext(TenantContext) || { tenant: null };
