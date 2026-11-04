import { useState } from 'react';
import { Smartphone, Share, PlusSquare } from 'lucide-react';
import useInstallPrompt from '../hooks/useInstallPrompt';
import { t } from '../i18n';
import ModalHeader from './shared/ModalHeader';

// Bayi menüsündeki "Uygulamayı Yükle" kartı. Kurulamıyorsa veya zaten kuruluysa görünmez.
const InstallAppButton = () => {
  const { canInstall, iosHint, install } = useInstallPrompt();
  const [iosOpen, setIosOpen] = useState(false);
  if (!canInstall && !iosHint) return null;

  return (
    <>
      <button type="button" onClick={() => (canInstall ? install() : setIosOpen(true))}
        className="w-full flex items-center gap-3 rounded-2xl p-4 bg-white/5 border border-white/10 text-left hover:bg-white/10 transition-colors">
        <span className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shrink-0"><Smartphone className="h-4 w-4 text-white" /></span>
        <span className="min-w-0">
          <span className="block text-xs font-black text-white">{t('Uygulamayı Yükle')}</span>
          <span className="block text-[10px] text-gray-400 leading-snug mt-0.5">{t('Ana ekrana ekleyin, uygulama gibi açılsın.')}</span>
        </span>
      </button>

      {iosOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="modal-backdrop" onClick={() => setIosOpen(false)} />
          <div className="modal-panel w-full max-w-sm">
            <ModalHeader icon={Smartphone} title={t('iPhone / iPad\'e yükleme')} onClose={() => setIosOpen(false)} closeLabel={t('Kapat')} />
            <ol className="p-6 space-y-4 text-sm text-gray-700">
              <li className="flex items-center gap-3"><span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><Share className="h-4 w-4" /></span>{t('Safari\'de alttaki Paylaş düğmesine dokunun')}</li>
              <li className="flex items-center gap-3"><span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><PlusSquare className="h-4 w-4" /></span>{t('"Ana Ekrana Ekle"yi seçin')}</li>
              <li className="flex items-center gap-3"><span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><Smartphone className="h-4 w-4" /></span>{t('Ana ekrandaki simgeden açın; bildirimleri buradan açabilirsiniz.')}</li>
            </ol>
            <div className="modal-footer"><button className="btn-gradient" onClick={() => setIosOpen(false)}>{t('Tamam')}</button></div>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallAppButton;
