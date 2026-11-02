import { useCallback, useEffect, useState } from 'react';
import { Inbox, Plus, Save, X, Trash2, FileSpreadsheet, Search, Phone, MessageCircle, Link2, Copy, Check, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { formatDate } from '../../utils/format';
import { downloadFile } from '../../utils/download';

const SOURCES = {
  INSTAGRAM: { label: 'Instagram', cls: 'bg-pink-50 text-pink-700' },
  WHATSAPP: { label: 'WhatsApp', cls: 'bg-emerald-50 text-emerald-700' },
  FACEBOOK: { label: 'Facebook', cls: 'bg-blue-50 text-blue-700' },
  FORM: { label: 'Talep formu', cls: 'bg-indigo-50 text-indigo-700' },
  PHONE: { label: 'Telefon', cls: 'bg-amber-50 text-amber-700' },
  OTHER: { label: 'Diğer', cls: 'bg-slate-100 text-slate-600' },
};
const STATUSES = {
  NEW: { label: 'Yeni', cls: 'bg-sky-100 text-sky-700' },
  CONTACTED: { label: 'Görüşüldü', cls: 'bg-amber-100 text-amber-700' },
  ORDERED: { label: 'Sipariş verdi', cls: 'bg-emerald-100 text-emerald-700' },
  LOST: { label: 'Olumsuz', cls: 'bg-gray-200 text-gray-500' },
};
const EMPTY = { name: '', phone: '', email: '', city: '', source: 'INSTAGRAM', campaign: '', request: '', status: 'NEW', note: '' };
const NO_FILTER = { status: '', source: '', campaign: '', q: '', from: '', to: '' };

// 0532… → 90532… (wa.me ve tel: bağlantıları için)
const intl = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) return `90${d.slice(1)}`;
  return d;
};
const prettyPhone = (p) => (/^0\d{10}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7, 9)} ${p.slice(9)}` : p);

// Talep formu bağlantıları: Instagram bio'ya, WhatsApp karşılama mesajına, reklamın bağlantısına konur
const FormLinks = () => {
  const [campaign, setCampaign] = useState('');
  const [copied, setCopied] = useState('');
  const base = `${window.location.origin}/talep`;
  const link = (k) => {
    const p = new URLSearchParams();
    if (k) p.set('k', k);
    if (campaign.trim()) p.set('kampanya', campaign.trim());
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const copy = async (key, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500); } catch { /* izin yok */ }
  };
  const rows = [
    ['instagram', 'Instagram', 'Bio bağlantısına ve reklamın "Daha fazla bilgi" düğmesine'],
    ['whatsapp', 'WhatsApp', 'WhatsApp Business karşılama / hızlı yanıt mesajına'],
    ['facebook', 'Facebook', 'Facebook sayfası ve reklamlarına'],
    ['', 'Genel', 'Web sitesi, SMS, kartvizit…'],
  ];
  return (
    <div className="card-premium p-5 md:p-6">
      <div className="flex flex-col md:flex-row md:items-end gap-4 justify-between">
        <div className="flex items-start gap-3">
          <span className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 shrink-0"><Link2 className="h-5 w-5" /></span>
          <div>
            <h2 className="font-black text-gray-900">Talep formu bağlantıları</h2>
            <p className="text-sm text-gray-500 mt-0.5">Reklamdan yazan kişiye bu bağlantıyı gönderin; adını, telefonunu ve ne istediğini yazar, buraya kendiliğinden düşer. Hangi kanaldan geldiği de kaydedilir.</p>
          </div>
        </div>
        <div className="md:w-64 shrink-0">
          <label className="premium-label">Kampanya / reklam adı (isteğe bağlı)</label>
          <input className="premium-input" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Örn: Kasım indirimi" />
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {rows.map(([k, label, hint]) => {
          const url = link(k);
          return (
            <div key={label} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-800">{label} <span className="font-medium text-gray-400 text-xs">· {hint}</span></p>
                <p className="text-xs font-mono text-gray-500 truncate">{url}</p>
              </div>
              <a href={url} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-indigo-600" title="Formu aç"><ExternalLink className="h-4 w-4" /></a>
              <button type="button" onClick={() => copy(label, url)} className={`h-9 px-3 rounded-lg text-xs font-black flex items-center gap-1.5 ${copied === label ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:border-indigo-300'}`}>
                {copied === label ? <><Check className="h-3.5 w-3.5" /> Kopyalandı</> : <><Copy className="h-3.5 w-3.5" /> Kopyala</>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Müşteri adayları: Instagram / WhatsApp reklamlarından yazan kişiler tek listede.
 * Talep formundan kendiliğinden gelir ya da DM'den görülen kişi elle eklenir; durum, not ve Excel.
 */
const LeadManagement = () => {
  const [data, setData] = useState({ items: [], total: 0, counts: {}, campaigns: [], page: 1, pageSize: 50 });
  const [filter, setFilter] = useState(NO_FILTER);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const { alertElement, showAlert, confirm } = useAlert();

  const params = Object.fromEntries(Object.entries({ ...filter, page }).filter(([, v]) => v));
  const paramsKey = JSON.stringify(params);
  const load = useCallback(() => api.get('/customer-leads', { params: JSON.parse(paramsKey) }).then((r) => setData(r.data)).catch(() => {}), [paramsKey]);
  useEffect(() => { load(); }, [load]);

  // Arama kutusu yazmayı bitirince uygulanır
  useEffect(() => {
    const t = setTimeout(() => { setFilter((f) => (f.q === search ? f : { ...f, q: search })); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const setF = (k) => (e) => { setFilter({ ...filter, [k]: e.target.value }); setPage(1); };
  const set = (k) => (e) => setEditing({ ...editing, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = editing.id ? await api.patch(`/customer-leads/${editing.id}`, editing) : await api.post('/customer-leads', editing);
      setEditing(null);
      load();
      if (res.data.duplicateOf) showAlert({ type: 'info', title: 'Kaydedildi', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Kaydedilemedi.') });
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (lead, status) => {
    setData((d) => ({ ...d, items: d.items.map((l) => (l.id === lead.id ? { ...l, status } : l)) }));
    try { await api.patch(`/customer-leads/${lead.id}`, { status }); load(); } catch (err) { showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Durum değiştirilemedi.') }); load(); }
  };

  const remove = async (lead) => {
    if (!await confirm({ title: `${lead.name} silinsin mi?`, message: 'Bu kişi listeden kalıcı olarak silinir.', confirmText: 'Sil' })) return;
    await api.delete(`/customer-leads/${lead.id}`);
    setEditing(null);
    load();
  };

  const exportExcel = () => downloadFile('/customer-leads/export', Object.fromEntries(Object.entries(filter).filter(([, v]) => v)), 'musteri-adaylari.xlsx')
    .catch((err) => showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Excel oluşturulamadı.') }));

  const allCount = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const filtered = Object.entries(filter).some(([k, v]) => k !== 'status' && v);

  return (
    <div className="space-y-6">
      {alertElement}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop" onClick={() => setEditing(null)} />
          <form onSubmit={save} className="modal-panel w-full max-w-lg max-h-[92vh] flex flex-col">
            <div className="modal-header items-center">
              <h3 className="modal-title">{editing.id ? 'Kişiyi Düzenle' : 'Kişi Ekle'}</h3>
              <button type="button" onClick={() => setEditing(null)} className="modal-close" aria-label="Kapat"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {editing.viaForm && <p className="text-xs font-bold text-indigo-700 bg-indigo-50 rounded-xl px-3 py-2">Bu kişi talep formunu kendisi doldurdu · {formatDate(editing.createdAt, true)}</p>}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="premium-label">Ad Soyad / kullanıcı adı</label><input required autoFocus className="premium-input" value={editing.name} onChange={set('name')} placeholder="Ayşe Yılmaz ya da @ayse.yilmaz" /></div>
                <div><label className="premium-label">Telefon</label><input className="premium-input" inputMode="tel" value={editing.phone} onChange={set('phone')} placeholder="05xx xxx xx xx" /></div>
                <div><label className="premium-label">Şehir</label><input className="premium-input" value={editing.city} onChange={set('city')} /></div>
                <div><label className="premium-label">Nereden yazdı</label>
                  <select className="premium-input" value={editing.source} onChange={set('source')}>{Object.entries(SOURCES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</select>
                </div>
                <div><label className="premium-label">Kampanya / reklam</label>
                  <input className="premium-input" list="lead-campaigns" value={editing.campaign} onChange={set('campaign')} placeholder="Örn: Kasım indirimi" />
                  <datalist id="lead-campaigns">{data.campaigns.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
                <div className="col-span-2"><label className="premium-label">Ne istedi</label><textarea className="premium-input h-24 resize-none" value={editing.request} onChange={set('request')} placeholder="Ürün, adet, fiyat sorusu…" /></div>
                <div><label className="premium-label">Durum</label>
                  <select className="premium-input" value={editing.status} onChange={set('status')}>{Object.entries(STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</select>
                </div>
                <div><label className="premium-label">E-posta</label><input type="email" className="premium-input" value={editing.email} onChange={set('email')} /></div>
                <div className="col-span-2"><label className="premium-label">Not</label><textarea className="premium-input h-20 resize-none" value={editing.note} onChange={set('note')} placeholder="Görüşme notu, sonraki adım…" /></div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              {editing.id
                ? <button type="button" onClick={() => remove(editing)} className="p-3 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200" aria-label="Sil"><Trash2 className="h-5 w-5" /></button>
                : <button type="button" onClick={() => setEditing(null)} className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50">Vazgeç</button>}
              <button type="submit" disabled={saving} className="flex-1 btn-gradient disabled:opacity-60"><Save className="h-4 w-4 mr-2" /> Kaydet</button>
            </div>
          </form>
        </div>
      )}

      <div className="flex flex-col xl:flex-row justify-between xl:items-end gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="bg-gradient-to-br from-fuchsia-500 to-pink-600 p-3.5 rounded-2xl shadow-lg shadow-pink-500/25 shrink-0"><Inbox className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Müşteri Adayları</h1>
            <p className="text-gray-500 text-sm mt-1">Instagram ve WhatsApp reklamlarından yazan kişiler tek listede. Arayın, durumunu işaretleyin, Excel'e alın.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button onClick={() => setShowLinks(!showLinks)} className={`flex items-center px-4 h-11 rounded-xl text-sm font-black ${showLinks ? 'bg-indigo-600 text-white' : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100'}`}><Link2 className="h-4 w-4 mr-2" /> Form bağlantısı</button>
          <button onClick={exportExcel} className="flex items-center px-4 h-11 rounded-xl text-sm font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100"><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel'e Aktar</button>
          <button onClick={() => setEditing({ ...EMPTY })} className="btn-gradient"><Plus className="h-4 w-4 mr-2" /> Kişi Ekle</button>
        </div>
      </div>

      {showLinks && <FormLinks />}

      {/* Durum sekmeleri */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[['', 'Tümü', allCount], ...Object.entries(STATUSES).map(([k, s]) => [k, s.label, data.counts[k] || 0])].map(([k, label, n]) => (
          <button key={label} onClick={() => { setFilter({ ...filter, status: k }); setPage(1); }}
            className={`h-10 px-4 rounded-xl text-sm font-black whitespace-nowrap flex items-center gap-2 transition-colors ${filter.status === k ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            {label} <span className={`text-[11px] px-1.5 rounded-md ${filter.status === k ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>{n}</span>
          </button>
        ))}
      </div>

      {/* Filtreler */}
      <div className="card-premium p-4 grid gap-3 grid-cols-2 lg:grid-cols-[1.6fr_1fr_1.3fr_1fr_1fr_auto] items-end">
        <div className="col-span-2 lg:col-span-1 relative">
          <Search className="h-4 w-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input className="premium-input !pl-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ad, telefon, talep, şehir ara…" />
        </div>
        <select className="premium-input" value={filter.source} onChange={setF('source')} aria-label="Kaynak">
          <option value="">Tüm kanallar</option>{Object.entries(SOURCES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
        <select className="premium-input" value={filter.campaign} onChange={setF('campaign')} aria-label="Kampanya">
          <option value="">Tüm kampanyalar</option>{data.campaigns.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" className="premium-input" value={filter.from} onChange={setF('from')} aria-label="Başlangıç tarihi" />
        <input type="date" className="premium-input" value={filter.to} onChange={setF('to')} aria-label="Bitiş tarihi" />
        {filtered
          ? <button onClick={() => { setFilter({ ...NO_FILTER, status: filter.status }); setSearch(''); setPage(1); }} className="h-11 px-3 text-sm font-bold text-gray-500 hover:text-gray-900">Temizle</button>
          : <span className="hidden lg:block w-16" />}
      </div>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="list-head">
            <tr className="text-left text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">
              <th className="px-5 py-4">Tarih</th><th className="px-5 py-4">Kişi</th><th className="px-5 py-4">Kanal</th>
              <th className="px-5 py-4">Ne istedi</th><th className="px-5 py-4">Durum</th><th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/70">
            {data.items.map((l) => (
              <tr key={l.id} className="align-top transition-colors hover:bg-slate-50/80 cursor-pointer" onClick={() => setEditing({ ...EMPTY, ...l })}>
                <td className="px-5 py-4 whitespace-nowrap text-gray-500 text-xs font-semibold">{formatDate(l.createdAt, true)}</td>
                <td className="px-5 py-4 min-w-[12rem]">
                  <p className="font-black text-gray-900">{l.name}</p>
                  {l.phone && <p className="text-xs font-semibold text-gray-500 tabular-nums">{prettyPhone(l.phone)}</p>}
                  {l.city && <p className="text-[11px] text-gray-400">{l.city}</p>}
                </td>
                <td className="px-5 py-4 whitespace-nowrap">
                  <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${SOURCES[l.source]?.cls || SOURCES.OTHER.cls}`}>{SOURCES[l.source]?.label || l.source}</span>
                  {l.campaign && <p className="mt-1.5 text-[11px] font-semibold text-gray-400 max-w-[10rem] truncate" title={l.campaign}>{l.campaign}</p>}
                </td>
                <td className="px-5 py-4 min-w-[14rem] max-w-md">
                  <p className="text-gray-700 line-clamp-2 whitespace-pre-line">{l.request || <span className="text-gray-300">—</span>}</p>
                  {l.note && <p className="mt-1 text-[11px] text-gray-400 line-clamp-1">Not: {l.note}</p>}
                </td>
                <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                  <select value={l.status} onChange={(e) => setStatus(l, e.target.value)} aria-label="Durum"
                    className={`h-8 pl-2.5 pr-7 rounded-lg text-[11px] font-black border-0 cursor-pointer ${STATUSES[l.status]?.cls}`}>
                    {Object.entries(STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                  </select>
                </td>
                <td className="px-5 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                  {l.phone && <>
                    <a href={`https://wa.me/${intl(l.phone)}`} target="_blank" rel="noreferrer" className="inline-flex p-2 rounded-lg text-emerald-600 hover:bg-emerald-50" title="WhatsApp'tan yaz"><MessageCircle className="h-4 w-4" /></a>
                    <a href={`tel:+${intl(l.phone)}`} className="inline-flex p-2 rounded-lg text-indigo-600 hover:bg-indigo-50" title="Ara"><Phone className="h-4 w-4" /></a>
                  </>}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr><td colSpan={6} className="text-center py-14 px-6">
                <p className="text-gray-400 font-bold">{filtered || filter.status ? 'Bu filtreye uyan kişi yok.' : 'Henüz müşteri adayı yok.'}</p>
                {!filtered && !filter.status && <p className="mt-2 text-sm text-gray-400">DM'den yazan kişiyi <b>Kişi Ekle</b> ile kaydedin ya da <button onClick={() => setShowLinks(true)} className="font-bold text-indigo-600 hover:underline">form bağlantısını</button> reklamınıza koyun.</p>}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-gray-500 font-semibold">{data.total} kişi · sayfa {page} / {pages}</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-10 w-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center disabled:opacity-40" aria-label="Önceki"><ChevronLeft className="h-4 w-4" /></button>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="h-10 w-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center disabled:opacity-40" aria-label="Sonraki"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadManagement;
