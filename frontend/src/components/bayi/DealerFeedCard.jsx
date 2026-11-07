import { useEffect, useState } from 'react';
import { Rss, Copy, Check, RefreshCw, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { formatDate } from '../../utils/format';
import { t } from '../../i18n';

/**
 * Profilim → XML ürün beslemesi (bayinin ana kullanıcısı; firma açtıysa görünür). Adres bayinin fiyatlarını içerir.
 */
const DealerFeedCard = ({ showAlert, confirm }) => {
  const [feed, setFeed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { api.get('/feed').then((r) => setFeed(r.data)).catch(() => {}); }, []);
  if (!feed?.enabled || !feed.isOwner) return null;

  const run = async (fn) => {
    setBusy(true);
    try {
      const res = await fn();
      setFeed(res.data.feed);
      showAlert({ type: 'success', title: t('XML ürün beslemesi'), message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: t('İşlem yapılamadı'), message: errorMessage(err, t('Besleme adresi güncellenemedi.')) });
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    if (feed.url && !(await confirm({ type: 'warning', title: t('Yeni adres üretilsin mi?'), message: t('Eski adres hemen çalışmaz olur; sitenizdeki ayarı yeni adresle güncellemeniz gerekir.'), confirmText: t('Yeni adres üret') }))) return;
    run(() => api.post('/feed'));
  };
  const remove = async () => {
    if (!(await confirm({ type: 'warning', title: t('Besleme kapatılsın mı?'), message: t('Adres çalışmaz olur; sitenize ürün aktarımı durur.'), confirmText: t('Kapat') }))) return;
    run(() => api.delete('/feed'));
  };
  const copy = () => {
    navigator.clipboard?.writeText(feed.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="card-premium p-5 md:p-8 space-y-4">
      <h3 className="font-black text-gray-900 flex items-center"><Rss className="h-5 w-5 mr-2 text-brand-500" /> {t('XML ürün beslemesi')}</h3>
      <p className="text-sm text-gray-500">{t('E-ticaret sitenize ürünlerimizi kendi fiyatlarınız, stok durumu ve görselleriyle aktarın. Siteniz bu adresten güncel listeyi çeker; liste en geç 10 dakikada bir yenilenir.')}</p>
      {feed.url ? (
        <>
          <div className="flex gap-2 items-center">
            <code className="flex-1 bg-gray-50 px-3 py-2.5 rounded-xl text-xs font-mono break-all">{feed.url}</code>
            <button type="button" onClick={copy} aria-label={t('Adresi kopyala')} className="p-2.5 rounded-xl bg-gray-50 text-gray-600 hover:text-brand-600">{copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}</button>
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 rounded-xl p-3">{t('Adres fiyatlarınızı içerir; parola gibi saklayın, yalnızca sitenizin yönetim paneline girin.')}{feed.createdAt && ` ${t('Üretildi:')} ${formatDate(feed.createdAt)}.`}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={create} className="btn-secondary !h-10 disabled:opacity-60"><RefreshCw className="h-4 w-4 mr-2" /> {t('Yeni adres üret')}</button>
            <button type="button" disabled={busy} onClick={remove} className="h-10 px-4 rounded-2xl text-sm font-bold text-red-600 hover:bg-red-50 inline-flex items-center disabled:opacity-60"><Trash2 className="h-4 w-4 mr-2" /> {t('Beslemeyi kapat')}</button>
          </div>
        </>
      ) : (
        <button type="button" disabled={busy} onClick={create} className="btn-gradient disabled:opacity-60">{t('Besleme adresi oluştur')}</button>
      )}
      <p className="text-[11px] text-gray-400">{t('Alanlar: stok kodu, barkod, ad, marka, kategori, açıklama, birim, en az sipariş, sipariş katı, stok (100\'den fazlası 100), liste fiyatı ve size özel fiyat (KDV hariç, TL), KDV oranı, görseller. Varyantlar ana ürün koduyla ayrı satırdır.')}</p>
    </div>
  );
};

export default DealerFeedCard;
