import { useEffect, useState } from 'react';
import api from '../services/api';

// Bayi portalı ayarları (stokta olmayan ürüne teklif, Gel-Al). Oturum boyunca bir kez yüklenir.
const DEFAULTS = { quoteOutOfStock: false, pickup: { enabled: false, address: '', hours: '', leadHours: 2 } };
let cache = null;
let pending = null;

const load = () => {
  pending ||= api.get('/settings/portal').then((r) => { cache = { ...DEFAULTS, ...r.data }; return cache; }).catch(() => DEFAULTS).finally(() => { pending = null; });
  return pending;
};

const usePortalSettings = () => {
  const [settings, setSettings] = useState(cache || DEFAULTS);
  useEffect(() => {
    let alive = true;
    load().then((s) => { if (alive) setSettings(s); });
    return () => { alive = false; };
  }, []);
  return settings;
};

export default usePortalSettings;
