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
      background_color: '#0f172a',
      theme_color: '#4f46e5',
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

/**
 * Alt alan adındaki firmanın marka bilgisi (ad, logo) ve erişim durumu.
 * Firma bulunamazsa `notFound` true olur.
 */
export const TenantProvider = ({ children }) => {
  const [state, setState] = useState({ loading: true, tenant: null, notFound: false });

  const refresh = () =>
    api.get('/tenant/public')
      .then((res) => {
        setState({ loading: false, tenant: res.data, notFound: false });
        document.title = `${res.data.name} · B2B Portal`;
        applyManifest(res.data);
      })
      .catch((err) => setState({ loading: false, tenant: null, notFound: err.response?.status === 404 }));

  useEffect(() => { refresh(); }, []);

  return <TenantContext.Provider value={{ ...state, refresh }}>{children}</TenantContext.Provider>;
};

export const useTenant = () => useContext(TenantContext) || { tenant: null };
