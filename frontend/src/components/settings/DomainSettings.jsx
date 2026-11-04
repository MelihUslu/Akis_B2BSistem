import { useEffect, useState } from 'react';
import { Globe, CheckCircle2, Copy, Trash2, AlertTriangle, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../services/api';

const MODES = {
  subdomain: {
    title: 'Alt alan adı',
    tag: 'Önerilen',
    example: 'b2b.firmaniz.com',
    text: 'Ana adresiniz (firmaniz.com) tanıtım siteniz için boş kalır; portal b2b. ya da bayi. ile başlayan adreste açılır.'
  },
  root: {
    title: 'Alan adının tamamı',
    example: 'firmaniz.com',
    text: 'firmaniz.com ve www.firmaniz.com doğrudan portalı açar. Bu adreste ayrıca bir tanıtım sitesi yayınlayamazsınız.'
  }
};

const Copyable = ({ value }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="font-mono text-xs text-gray-800 break-all">{value}</span>
    <button type="button" onClick={() => navigator.clipboard?.writeText(value)} className="text-gray-400 hover:text-brand-600 shrink-0" title="Kopyala"><Copy className="h-3.5 w-3.5" /></button>
  </span>
);

const RECORD_NOTE = {
  A: 'Ana adres (@ / boş) sunucumuza gider',
  CNAME: 'Yönlendirme',
  TXT: 'Sahiplik doğrulaması; doğrulandıktan sonra silebilirsiniz'
};

// Sağlayıcıya göre kısa ipuçları
const TIPS = [
  ['GoDaddy', 'Alan adlarım → alan adı → DNS → Kayıt ekle. "Ad" kutusuna tablodaki "Ad" sütununu yazın.'],
  ['Natro / İsimtescil', 'Alan adı yönetimi → DNS yönetimi (ya da "DNS kayıtları"). Kendi DNS sunucuları kullanılmıyorsa önce sağlayıcının DNS sunucularına geçin.'],
  ['Cloudflare', 'DNS → Add record. Kayıtlarda turuncu bulutu kapatın (DNS only); açık kalırsa SSL sertifikası alınamaz.']
];

// Portalın firmanın kendi alan adında açılması: alt alan adı (CNAME) ya da alan adının tamamı (A + www CNAME), TXT ile sahiplik doğrulama
const DomainSettings = ({ showAlert, confirm }) => {
  const [info, setInfo] = useState(null);
  const [domain, setDomain] = useState('');
  const [mode, setMode] = useState('subdomain');
  const [busy, setBusy] = useState(false);

  const apply = (data) => { setInfo(data); setDomain(data.domain || ''); if (data.domain) setMode(data.mode); };
  useEffect(() => { api.get('/account/domain').then((r) => apply(r.data)).catch(() => {}); }, []);

  const run = async (fn, okTitle) => {
    setBusy(true);
    try {
      const res = await fn();
      apply(res.data);
      showAlert({ type: res.data.routed === false ? 'warning' : 'success', title: okTitle, message: res.data.message });
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
        <p className="text-sm text-gray-500">Portalınızı <b>b2b.firmaniz.com</b> ya da <b>firmaniz.com</b> gibi kendi adresinizde açmak için paketinizi yükseltin.</p>
        <Link to="/admin/subscription" className="btn-gradient inline-flex">Paketleri Gör</Link>
      </div>
    );
  }

  const remove = async () => {
    if (await confirm({ type: 'warning', title: 'Alan adı kaldırılsın mı?', message: 'Portal yalnızca alt alan adınızdan açılır.', confirmText: 'Kaldır' })) {
      run(() => api.delete('/account/domain'), 'Kaldırıldı');
    }
  };

  const changed = domain !== (info.domain || '') || (info.domain && mode !== info.mode);
  const saved = Boolean(info.domain);
  const apex = info.mode === 'root';
  const missingIp = apex && info.records.some((r) => r.type === 'A' && !r.value);

  return (
    <div className="card-premium p-6 space-y-6">
      <div>
        <h3 className="font-black text-gray-900 flex items-center"><Globe className="h-5 w-5 mr-2 text-brand-500" /> Özel Alan Adı</h3>
        <p className="text-xs text-gray-500 mt-1">Bayileriniz portala kendi alan adınızdan girer. Mevcut alt alan adınız da çalışmaya devam eder.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {Object.entries(MODES).map(([key, m]) => (
          <button key={key} type="button" onClick={() => setMode(key)}
            className={`text-left rounded-2xl border-2 p-4 transition-colors ${mode === key ? 'border-brand-500 bg-brand-50/50' : 'border-gray-100 hover:border-gray-200'}`}>
            <div className="flex items-center gap-2">
              <span className={`h-4 w-4 rounded-full border-2 ${mode === key ? 'border-brand-500 bg-brand-500 ring-2 ring-inset ring-white' : 'border-gray-300'}`} />
              <span className="font-black text-sm text-gray-900">{m.title}</span>
              {m.tag && <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{m.tag}</span>}
            </div>
            <p className="font-mono text-xs text-brand-600 mt-2">{m.example}</p>
            <p className="text-xs text-gray-500 mt-1">{m.text}</p>
          </button>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); run(() => api.put('/account/domain', { domain, mode }), 'Kaydedildi'); }} className="flex flex-wrap gap-3">
        <input className="premium-input max-w-md" placeholder={MODES[mode].example} value={domain} onChange={(e) => setDomain(e.target.value)} />
        <button disabled={busy || !domain || !changed} className="btn-gradient disabled:opacity-50">Kaydet</button>
        {saved && <button type="button" onClick={remove} className="flex items-center text-xs font-black text-red-500"><Trash2 className="h-4 w-4 mr-1" /> Kaldır</button>}
      </form>
      {saved && changed && <p className="text-xs text-amber-700 -mt-3">Kaydederseniz yeni DNS kayıtları oluşur ve alan adı yeniden doğrulanır.</p>}

      {saved && (
        <>
          {info.verified && info.routed !== false && (
            <p className="flex items-center text-sm font-bold text-emerald-600"><CheckCircle2 className="h-5 w-5 mr-2 shrink-0" /> <span>{info.domain} bağlı. Portalınız <a className="underline" href={`https://${info.domain}`} target="_blank" rel="noreferrer">https://{info.domain}</a> adresinde açılır{apex && <> (www.{info.domain} de buraya yönlenir)</>}.</span></p>
          )}
          {info.verified && info.routed === false && (
            <p className="flex items-start text-sm font-semibold text-amber-700"><AlertTriangle className="h-5 w-5 mr-2 shrink-0" /> Alan adı doğrulandı ama {apex ? 'A' : 'CNAME'} kaydı henüz sunucumuza yönlenmiyor. Aşağıdaki kaydı kontrol edin; yeni eklediyseniz yayılmasını bekleyin.</p>
          )}

          <div>
            <p className="text-sm font-black text-gray-900 mb-2">{info.verified ? 'DNS kayıtlarınız' : 'Alan adı sağlayıcınızda eklemeniz gereken kayıtlar'}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[560px]">
                <thead><tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100"><th className="py-2 pr-4">Tür</th><th className="pr-4">Ad (Host)</th><th className="pr-4">Değer</th><th>Açıklama</th></tr></thead>
                <tbody>
                  {info.records.map((r) => (
                    <tr key={r.type + r.host} className="border-b border-gray-50 align-top">
                      <td className="py-3 pr-4 text-xs font-black text-gray-500">{r.type}</td>
                      <td className="py-3 pr-4"><Copyable value={r.host} /><p className="text-[10px] text-gray-400 mt-0.5 break-all">{r.name}</p></td>
                      <td className="py-3 pr-4">{r.value ? <Copyable value={r.value} /> : <span className="text-xs text-red-600 font-semibold">Sunucu IP'si tanımlı değil</span>}</td>
                      <td className="py-3 text-[11px] text-gray-500">{RECORD_NOTE[r.type]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {missingIp && <p className="text-xs text-red-600 mt-2">A kaydı için sunucu IP'si henüz tanımlanmamış. Platform destek ekibine yazın ya da şimdilik "Alt alan adı" seçeneğini kullanın.</p>}
          </div>

          {!info.verified && <button disabled={busy} onClick={() => run(() => api.post('/account/domain/verify'), 'Doğrulandı')} className="btn-gradient disabled:opacity-50">{busy ? 'Kontrol ediliyor...' : 'Doğrula'}</button>}
        </>
      )}

      <details className="rounded-2xl bg-gray-50 p-4 group" open={!saved || !info.verified}>
        <summary className="cursor-pointer text-sm font-black text-gray-800 flex items-center gap-2"><Info className="h-4 w-4 text-brand-500" /> Nasıl yapılır? ({MODES[mode].title})</summary>
        <ol className="mt-3 space-y-2 text-sm text-gray-600 list-decimal pl-5">
          {mode === 'root' ? (
            <>
              <li>Yukarıya alan adınızı <b>başında ek olmadan</b> yazın (örn. <span className="font-mono">firmaniz.com</span>) ve <b>Kaydet</b>'e basın.</li>
              <li>Alan adını aldığınız firmanın paneline girin (GoDaddy, Natro, İsimtescil, Cloudflare…) ve <b>DNS yönetimi</b> bölümünü açın.</li>
              <li>Ana adrese ait mevcut <b>A</b>, <b>AAAA</b> ya da <b>CNAME</b> kaydı varsa (çoğu zaman sağlayıcının park sayfası) silin; <b>www</b> için olan eski kaydı da silin.</li>
              <li>Tablodaki üç kaydı ekleyin. <b>A</b> kaydında "Ad" kutusuna <span className="font-mono">@</span> yazın (bazı panellerde boş bırakılır). <b>www</b> kaydı, ziyaretçiyi ana adrese yönlendirir.</li>
              <li>5–30 dakika bekleyip <b>Doğrula</b>'ya basın. Yayılma bazen birkaç saat sürebilir.</li>
              <li>Doğrulandıktan sonra <span className="font-mono">https://firmaniz.com</span> portalınızı açar; SSL sertifikası ilk ziyarette kendiliğinden alınır.</li>
            </>
          ) : (
            <>
              <li>Yukarıya portalın açılacağı adresi yazın (örn. <span className="font-mono">b2b.firmaniz.com</span> ya da <span className="font-mono">bayi.firmaniz.com</span>) ve <b>Kaydet</b>'e basın.</li>
              <li>Alan adını aldığınız firmanın paneline girin (GoDaddy, Natro, İsimtescil, Cloudflare…) ve <b>DNS yönetimi</b> bölümünü açın.</li>
              <li>Tablodaki iki kaydı ekleyin. Çoğu panel alan adını kendisi ekler; "Ad" kutusuna yalnızca tablodaki kısa adı yazın (örn. <span className="font-mono">b2b</span>).</li>
              <li>5–30 dakika bekleyip <b>Doğrula</b>'ya basın. Yayılma bazen birkaç saat sürebilir.</li>
              <li>Doğrulandıktan sonra portal bu adreste açılır; SSL sertifikası ilk ziyarette kendiliğinden alınır. Ana adresiniz (tanıtım siteniz, e-postanız) etkilenmez.</li>
            </>
          )}
        </ol>
        <div className="mt-4 grid sm:grid-cols-3 gap-3">
          {TIPS.map(([name, tip]) => (
            <div key={name} className="rounded-xl bg-white border border-gray-100 p-3">
              <p className="text-xs font-black text-gray-800">{name}</p>
              <p className="text-[11px] text-gray-500 mt-1">{tip}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-3">E-postanız (MX kayıtları) bu değişiklikten etkilenmez; MX kayıtlarına dokunmayın.</p>
      </details>
    </div>
  );
};

export default DomainSettings;
