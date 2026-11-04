import { useEffect, useState } from 'react';
import { KeyRound, Webhook, Copy, Trash2, Plus, Send, BookOpen } from 'lucide-react';
import WebhookDeliveries from './WebhookDeliveries';
import api, { errorMessage } from '../../services/api';
import { formatDate } from '../../utils/format';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5001/api') + '/v1';

const copy = (text) => navigator.clipboard?.writeText(text);

const ENDPOINTS = [
  ['GET', '/products?updatedSince=2026-01-01&page=1', 'Ürün ve varyant listesi'],
  ['PUT', '/products/stock', '[{ "sku": "MTK-18V", "stock": 42 }]'],
  ['PUT', '/products/prices', '[{ "sku": "MTK-18V", "price": 4500, "currency": "TRY" }]'],
  ['POST', '/products/upsert', '[{ "sku", "name", "price", "currency", "vatRate", "stock", "unit", "brand", "barcode", "category" }]'],
  ['POST', '/companies/upsert', '[{ "externalCode": "120.01.001", "taxNumber", "name", "riskLimit", "dealerGroup", "netDiscount" }]'],
  ['PUT', '/companies/balances', '[{ "externalCode": "120.01.001", "balance": -15000 }]  (eksi = borç)'],
  ['GET', '/orders?exported=false', 'ERP\'ye aktarılmamış siparişler'],
  ['POST', '/orders/:id/exported', 'Siparişi "aktarıldı" işaretle (tekrar gelmez)'],
  ['PATCH', '/orders/:id/status', '{ "status": "SHIPPED", "cargoCompany": "YURTICI", "trackingNumber": "123" }'],
];

const IntegrationSettings = ({ showAlert, confirm }) => {
  const [logOf, setLogOf] = useState(null); // gönderim kaydı açık olan webhook
  const [data, setData] = useState(null);
  const [newKey, setNewKey] = useState(null);
  const [keyName, setKeyName] = useState('');
  const [keyIsTest, setKeyIsTest] = useState(false); // test anahtarı: yazmalar kaydedilmez
  const [hook, setHook] = useState(null);

  const load = () => api.get('/integrations').then((r) => setData(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const createKey = async () => {
    try {
      const res = await api.post('/integrations/keys', { name: keyName || 'ERP', isTest: keyIsTest });
      setNewKey(res.data.key);
      setKeyName('');
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Anahtar oluşturulamadı.') });
    }
  };

  const revoke = async (k) => {
    if (!(await confirm({ title: `"${k.name}" iptal edilsin mi?`, message: 'Bu anahtarı kullanan sistemler hemen erişimini kaybeder.', confirmText: 'İptal Et' }))) return;
    await api.delete(`/integrations/keys/${k.id}`);
    load();
  };

  const saveHook = async (e) => {
    e.preventDefault();
    try {
      await api.post('/integrations/webhooks', hook);
      setHook(null);
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Webhook eklenemedi.') });
    }
  };

  const testHook = async (h) => {
    const res = await api.post(`/integrations/webhooks/${h.id}/test`);
    showAlert({ type: res.data.ok ? 'success' : 'error', title: 'Webhook Testi', message: res.data.message });
    load();
  };

  if (!data) return <p className="text-center text-gray-400 py-10">Yükleniyor...</p>;

  return (
    <div className="space-y-6">
      <div className="card-premium p-6 space-y-3 bg-gradient-to-br from-brand-50/60 to-white">
        <h3 className="font-black text-gray-900 flex items-center"><BookOpen className="h-5 w-5 mr-2 text-brand-500" /> ERP / Muhasebe Entegrasyonu Nasıl Çalışır?</h3>
        <a href="/developer" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:underline">API dokümanını aç (yazılımcınızla paylaşın) ↗</a>
        <ol className="text-sm text-gray-600 space-y-1 list-decimal ml-5">
          <li>Aşağıdan bir <b>API anahtarı</b> oluşturun ve ERP danışmanınıza / entegratörünüze verin.</li>
          <li>ERP; stok, fiyat, ürün ve cari bakiyelerini bu API ile gönderir (Logo, Mikro, Netsis, Paraşüt... hepsi uyumlu).</li>
          <li>Yeni siparişleri <code className="text-xs bg-white px-1 rounded">GET /orders?exported=false</code> ile çeker, aldıktan sonra "aktarıldı" işaretler.</li>
          <li>Anında haberdar olmak için <b>webhook</b> ekleyin: sipariş geldiğinde ERP'nize bildirim gider.</li>
        </ol>
        <p className="text-xs text-gray-500">Adres: <code className="bg-white px-1.5 py-0.5 rounded font-mono">{API_BASE}</code> · Başlık: <code className="bg-white px-1.5 py-0.5 rounded font-mono">Authorization: Bearer akb2b_…</code> · Dakikada 600 istek</p>
        <details className="text-xs">
          <summary className="cursor-pointer font-black text-brand-600">Uç noktaları göster</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full">
              <tbody className="divide-y divide-gray-100">
                {ENDPOINTS.map(([m, path, desc]) => (
                  <tr key={m + path}><td className="py-1.5 pr-3 font-black text-brand-600">{m}</td><td className="py-1.5 pr-3 font-mono">{path}</td><td className="py-1.5 text-gray-500 font-mono">{desc}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-gray-500">Toplu isteklerde en fazla 1000 kayıt. Cariler önce cari kodu, bulunamazsa vergi no ile eşleşir. Webhook gövdesi <code>X-Webhook-Signature</code> başlığıyla (HMAC-SHA256, gizli anahtarınızla) imzalanır.</p>
          </div>
        </details>
      </div>

      <div className="card-premium p-6 space-y-4">
        <h3 className="font-black text-gray-900 flex items-center"><KeyRound className="h-5 w-5 mr-2 text-brand-500" /> API Anahtarları</h3>
        <p className="text-xs text-gray-500"><b>Test anahtarı</b> entegrasyonu kurarken kullanılır: gerçek veriyi okur, yazma isteklerini doğrulayıp sonucu döndürür ama hiçbir şeyi kaydetmez (yanıtta <code className="font-mono">dryRun: true</code>).</p>
        {newKey && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-black text-amber-800">Bu anahtar bir daha gösterilmeyecek. Şimdi kopyalayın:</p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 bg-white px-3 py-2 rounded-xl text-xs font-mono break-all">{newKey}</code>
              <button onClick={() => copy(newKey)} className="p-2.5 rounded-xl bg-white text-gray-600 hover:text-brand-600"><Copy className="h-4 w-4" /></button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <input className="premium-input flex-1 min-w-[12rem]" placeholder="Anahtar adı (örn. Logo Tiger)" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
          <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-bold">
            <button type="button" onClick={() => setKeyIsTest(false)} className={`px-3 rounded-lg ${!keyIsTest ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-500'}`}>Canlı</button>
            <button type="button" onClick={() => setKeyIsTest(true)} className={`px-3 rounded-lg ${keyIsTest ? 'bg-white shadow-sm text-amber-700' : 'text-gray-500'}`}>Test</button>
          </div>
          <button onClick={createKey} className="btn-gradient whitespace-nowrap"><Plus className="h-4 w-4 mr-1" /> Anahtar Oluştur</button>
        </div>
        <div className="divide-y divide-gray-50">
          {data.keys.length === 0 && <p className="text-sm text-gray-400 py-4">Henüz anahtar yok.</p>}
          {data.keys.map(k => (
            <div key={k.id} className="py-3 flex items-center justify-between">
              <div><p className="text-sm font-bold text-gray-800">{k.name} <code className="text-xs text-gray-400 font-mono">{k.prefix}…</code>
                {k.isTest && <span className="ml-2 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-bold">TEST · yazmaz</span>}</p>
                <p className="text-[11px] text-gray-400">Oluşturma: {formatDate(k.createdAt)} · Son kullanım: {k.lastUsedAt ? formatDate(k.lastUsedAt, true) : 'hiç'}</p></div>
              <button onClick={() => revoke(k)} className="p-2 text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="card-premium p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-black text-gray-900 flex items-center"><Webhook className="h-5 w-5 mr-2 text-brand-500" /> Webhook'lar</h3>
          <button onClick={() => setHook({ url: '', events: ['order.created', 'order.updated'] })} className="btn-gradient"><Plus className="h-4 w-4 mr-1" /> Webhook Ekle</button>
        </div>
        {hook && (
          <form onSubmit={saveHook} className="bg-brand-50/40 rounded-2xl p-4 space-y-3">
            <input required className="premium-input !bg-white" placeholder="https://erp.firmaniz.com/b2b-bildirim" value={hook.url} onChange={(e) => setHook({ ...hook, url: e.target.value })} />
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.events).map(([ev, label]) => {
                const on = hook.events.includes(ev);
                return (
                  <button type="button" key={ev} onClick={() => setHook({ ...hook, events: on ? hook.events.filter(x => x !== ev) : [...hook.events, ev] })}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border ${on ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-500'}`} title={label}>{ev}</button>
                );
              })}
            </div>
            <div className="flex gap-2"><button type="submit" className="btn-gradient">Kaydet</button><button type="button" onClick={() => setHook(null)} className="px-4 rounded-xl text-sm font-bold text-gray-500">Vazgeç</button></div>
          </form>
        )}
        <div className="divide-y divide-gray-50">
          {data.webhooks.length === 0 && <p className="text-sm text-gray-400 py-4">Henüz webhook yok.</p>}
          {data.webhooks.map(h => (
            <div key={h.id} className="py-3 space-y-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-gray-800 font-mono truncate">{h.url}</p>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => testHook(h)} className="p-2 text-gray-400 hover:text-brand-600" title="Test gönder"><Send className="h-4 w-4" /></button>
                  <button onClick={async () => { await api.delete(`/integrations/webhooks/${h.id}`); load(); }} className="p-2 text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <p className="text-[11px] text-gray-500">{h.events.join(', ')}</p>
              <p className="text-[11px] text-gray-400">
                Gizli anahtar: <code className="font-mono">{h.secret.slice(0, 12)}…</code> <button onClick={() => copy(h.secret)} className="text-brand-500 font-bold">kopyala</button>
                {h.lastAt && <> · Son gönderim {formatDate(h.lastAt, true)}: <span className={h.lastError ? 'text-red-500 font-bold' : 'text-emerald-600 font-bold'}>{h.lastError || `HTTP ${h.lastStatus}`}</span></>}
              </p>
              <button onClick={() => setLogOf(logOf === h.id ? null : h.id)} className="text-[11px] font-bold text-brand-600 hover:underline">{logOf === h.id ? 'Gönderim kaydını gizle' : 'Gönderim kaydı'}</button>
              {logOf === h.id && <WebhookDeliveries hookId={h.id} showAlert={showAlert} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default IntegrationSettings;
