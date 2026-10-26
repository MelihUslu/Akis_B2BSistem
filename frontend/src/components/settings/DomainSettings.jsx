import React, { useEffect, useState } from 'react';
import { Globe, CheckCircle2, Copy, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../services/api';

const Row = ({ type, name, value }) => (
  <tr className="border-b border-gray-50">
    <td className="py-3 pr-4 text-xs font-black text-gray-500">{type}</td>
    <td className="py-3 pr-4 font-mono text-xs text-gray-800 break-all">{name}</td>
    <td className="py-3 pr-4 font-mono text-xs text-gray-800 break-all">{value}</td>
    <td className="py-3"><button onClick={() => navigator.clipboard?.writeText(value)} className="text-gray-400 hover:text-indigo-600" title="Kopyala"><Copy className="h-4 w-4" /></button></td>
  </tr>
);

// Portalın firmanın kendi alan adında (b2b.firmasi.com) açılması: TXT ile sahiplik doğrulama + CNAME yönlendirme
const DomainSettings = ({ showAlert, confirm }) => {
  const [info, setInfo] = useState(null);
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/account/domain').then((r) => { setInfo(r.data); setDomain(r.data.domain || ''); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const run = async (fn, okTitle) => {
    setBusy(true);
    try {
      const res = await fn();
      setInfo(res.data);
      setDomain(res.data.domain || '');
      showAlert({ type: 'success', title: okTitle, message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Olmadı', message: errorMessage(err, 'İşlem yapılamadı.') });
    } finally {
      setBusy(false);
    }
  };

  if (!info) return null;

  if (!info.allowed) {
    return (
      <div className="card-premium p-8 text-center space-y-3">
        <Globe className="h-10 w-10 mx-auto text-gray-300" />
        <p className="font-black text-gray-800">Özel alan adı paketinizde yok</p>
        <p className="text-sm text-gray-500">Portalınızı <b>b2b.firmaniz.com</b> gibi kendi adresinizde açmak için paketinizi yükseltin.</p>
        <Link to="/admin/subscription" className="btn-gradient inline-flex">Paketleri Gör</Link>
      </div>
    );
  }

  const remove = async () => {
    if (await confirm({ type: 'warning', title: 'Alan adı kaldırılsın mı?', message: 'Portal yalnızca alt alan adınızdan açılır.', confirmText: 'Kaldır' })) {
      run(() => api.delete('/account/domain'), 'Kaldırıldı');
    }
  };

  return (
    <div className="card-premium p-6 space-y-6">
      <div>
        <h3 className="font-black text-gray-900 flex items-center"><Globe className="h-5 w-5 mr-2 text-indigo-500" /> Özel Alan Adı</h3>
        <p className="text-xs text-gray-500 mt-1">Bayileriniz portala kendi alan adınızdan girer. Mevcut alt alan adınız da çalışmaya devam eder.</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); run(() => api.put('/account/domain', { domain }), 'Kaydedildi'); }} className="flex flex-wrap gap-3">
        <input className="premium-input max-w-md" placeholder="b2b.firmaniz.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
        <button disabled={busy || !domain || domain === info.domain} className="btn-gradient disabled:opacity-50">Kaydet</button>
        {info.domain && <button type="button" onClick={remove} className="flex items-center text-xs font-black text-red-500"><Trash2 className="h-4 w-4 mr-1" /> Kaldır</button>}
      </form>

      {info.domain && (
        <>
          {info.verified ? (
            <p className="flex items-center text-sm font-bold text-emerald-600"><CheckCircle2 className="h-5 w-5 mr-2" /> {info.domain} doğrulandı. CNAME kaydı yayıldığında portalınız <a className="underline ml-1" href={`https://${info.domain}`} target="_blank" rel="noreferrer">https://{info.domain}</a> adresinde açılır.</p>
          ) : (
            <p className="text-sm text-amber-700 font-semibold">Alan adınızın DNS yönetim panelinde (Cloudflare, GoDaddy, Natro…) aşağıdaki iki kaydı ekleyip “Doğrula”ya basın.</p>
          )}
          <table className="w-full text-left">
            <thead><tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100"><th className="py-2">Tür</th><th>Ad</th><th>Değer</th><th /></tr></thead>
            <tbody>
              <Row type="CNAME" name={info.domain} value={info.cnameTarget} />
              {!info.verified && <Row type="TXT" name={info.txtName} value={info.txtValue} />}
            </tbody>
          </table>
          {!info.verified && <button disabled={busy} onClick={() => run(() => api.post('/account/domain/verify'), 'Doğrulandı')} className="btn-gradient disabled:opacity-50">{busy ? 'Kontrol ediliyor...' : 'Doğrula'}</button>}
          <p className="text-[11px] text-gray-400">DNS değişikliklerinin yayılması birkaç dakika ile birkaç saat sürebilir. SSL sertifikası ilk ziyarette otomatik alınır.</p>
        </>
      )}
    </div>
  );
};

export default DomainSettings;
