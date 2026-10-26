import React, { useState } from 'react';
import { Download, AlertOctagon } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { downloadFile } from '../../utils/download';

// KVKK: tüm verinin dışa aktarılması ve hesabın kapatılması
const DataSettings = ({ showAlert }) => {
  const { user, logout } = useAuth();
  const { tenant } = useTenant();
  const [exporting, setExporting] = useState(false);
  const [close, setClose] = useState(null);

  const exportAll = async () => {
    setExporting(true);
    try {
      await downloadFile('/account/export', {}, 'tum-veriler.xlsx');
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Veriler indirilemedi.') });
    } finally {
      setExporting(false);
    }
  };

  const submitClose = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/account/close', close);
      showAlert({ type: 'success', title: 'Hesap Kapatıldı', message: res.data.message });
      setTimeout(() => { logout(); window.location.href = '/login'; }, 4000);
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Hesap kapatılamadı.') });
    }
  };

  return (
    <div className="space-y-6">
      <div className="card-premium p-6 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h3 className="font-black text-gray-900">Tüm Verilerimi İndir</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-xl">Ürün, kategori, bayi, kullanıcı, sipariş, ödeme, cari hareket, iade ve fiyat listeleri tek bir Excel dosyasında. Şifreler ve API anahtarları dahil edilmez.</p>
        </div>
        <button onClick={exportAll} disabled={exporting} className="btn-gradient disabled:opacity-50"><Download className="h-4 w-4 mr-2" /> {exporting ? 'Hazırlanıyor...' : 'Excel İndir'}</button>
      </div>

      <div className="card-premium p-6 space-y-4 border-red-100">
        <h3 className="font-black text-red-600 flex items-center"><AlertOctagon className="h-5 w-5 mr-2" /> Hesabı Kapat</h3>
        <p className="text-xs text-gray-600 max-w-2xl leading-relaxed">
          Aboneliğiniz iptal edilir, siz ve bayileriniz portala giremezsiniz. Verileriniz <b>30 gün</b> saklanır; bu sürede destek ekibine başvurarak hesabı geri açtırabilirsiniz. Süre sonunda tüm veriler kalıcı olarak silinir. Kapatmadan önce verilerinizi indirmeniz önerilir.
        </p>
        {!user?.isOwner ? (
          <p className="text-xs font-bold text-gray-400">Hesabı yalnızca firma sahibi kapatabilir.</p>
        ) : !close ? (
          <button onClick={() => setClose({ password: '', confirm: '', reason: '' })} className="px-5 py-3 rounded-2xl bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest">Hesabı kapatmak istiyorum</button>
        ) : (
          <form onSubmit={submitClose} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div><label className="premium-label">Onay: “{tenant?.slug}” yazın</label><input required className="premium-input" value={close.confirm} onChange={(e) => setClose({ ...close, confirm: e.target.value })} /></div>
            <div><label className="premium-label">Şifreniz</label><input type="password" required className="premium-input" value={close.password} onChange={(e) => setClose({ ...close, password: e.target.value })} /></div>
            <div><label className="premium-label">Neden ayrılıyorsunuz? (isteğe bağlı)</label><input className="premium-input" value={close.reason} onChange={(e) => setClose({ ...close, reason: e.target.value })} /></div>
            <div className="md:col-span-3 flex gap-3">
              <button className="px-5 py-3 rounded-2xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest">Hesabı Kalıcı Olarak Kapat</button>
              <button type="button" onClick={() => setClose(null)} className="text-xs font-black text-gray-400">Vazgeç</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default DataSettings;
