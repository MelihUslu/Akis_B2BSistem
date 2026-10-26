import { useEffect, useState } from 'react';
import { isStandalone } from '../utils/push';

// Tarayıcı "uygulamayı yükle" olayını sayfa açılışında gönderir; bileşen sonra açılsa da kaçmasın diye saklanır
let deferred = null;
const listeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((fn) => fn()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((fn) => fn()); });
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * PWA kurulumu. canInstall: Android / masaüstü Chrome'da yerel kurulum penceresi açılabilir.
 * iosHint: iPhone'da kurulum elle yapılır (Paylaş → Ana Ekrana Ekle), talimat gösterilir.
 */
const useInstallPrompt = () => {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const installed = isStandalone();
  const install = async () => {
    if (!deferred) return false;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    force((n) => n + 1);
    return outcome === 'accepted';
  };

  return { canInstall: !installed && Boolean(deferred), iosHint: !installed && isIos(), install };
};

export default useInstallPrompt;
