import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import ModalHeader from '../shared/ModalHeader';
import { t } from '../../i18n';

/**
 * Telefon kamerasıyla barkod okutma (Hızlı Sipariş). Arka kamera açılır; okunan her kod onCode ile bildirilir,
 * pencere açık kaldıkça arka arkaya okutulabilir. Okuyucu kütüphanesi yalnızca pencere açılınca yüklenir.
 * Kamera izni ve güvenli bağlantı (https) gerekir.
 */
const BarcodeScanner = ({ onCode, onClose }) => {
  const video = useRef(null);
  const [error, setError] = useState(null);
  const [last, setLast] = useState(null);
  const lastAt = useRef({ code: null, at: 0 });

  useEffect(() => {
    let controls = null;
    let stopped = false;
    import('@zxing/browser').then(async ({ BrowserMultiFormatReader }) => {
      if (stopped) return;
      const reader = new BrowserMultiFormatReader();
      controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video.current, (result) => {
        if (!result) return;
        const code = result.getText();
        const now = Date.now();
        // Kamera aynı kodu saniyede birçok kez okur: aynı kod 1,5 sn içinde tekrar sayılmaz
        if (lastAt.current.code === code && now - lastAt.current.at < 1500) return;
        lastAt.current = { code, at: now };
        navigator.vibrate?.(60);
        setLast(code);
        onCode(code);
      });
      if (stopped) controls.stop();
    }).catch(() => setError(t('Kamera açılamadı. Tarayıcıya kamera izni verin; bağlantının güvenli (https) olması gerekir.')));
    return () => { stopped = true; controls?.stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={t('Barkod okut')} className="modal-panel w-full max-w-md flex flex-col">
        <ModalHeader icon={Camera} title={t('Barkod okut')} subtitle={t('Barkodu çerçevenin ortasına tutun; okunan ürün listeye eklenir.')} onClose={onClose} closeLabel={t('Kapat')} />
        <div className="p-5 space-y-3">
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
            <video ref={video} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-24 rounded-xl ring-2 ring-white/80 pointer-events-none" />
          </div>
          {error && <p className="text-xs font-bold text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}
          {last && <p className="text-sm font-bold text-emerald-700 bg-emerald-50 rounded-xl p-3">{t('Okundu:')} <span className="font-mono">{last}</span></p>}
          <button type="button" onClick={onClose} className="w-full h-11 rounded-xl bg-navy-900 text-white text-sm font-bold flex items-center justify-center gap-2"><X className="h-4 w-4" /> {t('Bitti')}</button>
        </div>
      </div>
    </div>
  );
};

export default BarcodeScanner;
