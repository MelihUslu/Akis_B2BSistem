import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BookUser, Plus, Search, Layers, X, Phone, Mail, MapPin, Landmark, Hash, Pencil, FileText, FileSignature, Wallet, Star, Trash2,
  ExternalLink, FileSpreadsheet, Upload, ArrowDownLeft, ArrowUpRight, Send, Store, Bell, UserCog, Tag, SlidersHorizontal
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import FilterTabs from '../../components/shared/FilterTabs';
import PartnerForm from '../../components/partners/PartnerForm';
import ImportModal from '../../components/partners/ImportModal';
import { PaymentModal, TransactionModal, StatementLinkModal, ConvertModal } from '../../components/partners/PartnerModals';
import { LedgerTab, NotesTab, DocumentsTab } from '../../components/partners/PartnerTabs';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { downloadFile } from '../../utils/download';
import { formatTRY, formatDate, formatMoney } from '../../utils/format';
import { PARTNER_KINDS, balanceText, PAYMENT_METHODS, AGING_LABELS, AGING_TONE, agingSentence } from '../../utils/partner';

const Badge = ({ kind }) => {
  const k = PARTNER_KINDS[kind] || PARTNER_KINDS.DEALER;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${k.className}`}><k.icon className="h-3 w-3" />{k.label}</span>;
};

const Stat = ({ label, value, sub }) => (
  <div className="rounded-xl bg-gray-50 p-3">
    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{label}</p>
    <p className="text-sm font-black text-gray-900 tabular-nums mt-0.5">{value}</p>
    {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
  </div>
);

const SummaryTab = ({ p }) => {
  const s = p.summary;
  const supplier = p.kind === 'SUPPLIER';
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {supplier ? <>
          <Stat label="Son 12 ay alış" value={formatMoney(s.purchases12m, p.currency)} />
          <Stat label="Son ödeme" value={s.lastPaymentOut ? formatMoney(s.lastPaymentOut.amount, s.lastPaymentOut.currency) : '—'} sub={s.lastPaymentOut && `${formatDate(s.lastPaymentOut.paymentDate)} · ${PAYMENT_METHODS[s.lastPaymentOut.method] || ''}`} />
        </> : <>
          <Stat label="Son 12 ay satış" value={formatTRY(s.sales12m)} sub={`${s.orders12m} sipariş`} />
          <Stat label="Ortalama sipariş" value={s.orders12m ? formatTRY(s.avgOrder) : '—'} />
          <Stat label="Son sipariş" value={s.lastOrder ? formatDate(s.lastOrder.createdAt) : '—'} sub={s.lastOrder && `#AK-${s.lastOrder.id} · ${formatTRY(s.lastOrder.totalAmount)}`} />
          <Stat label="Son tahsilat" value={s.lastPaymentIn ? formatMoney(s.lastPaymentIn.amount, s.lastPaymentIn.currency) : '—'} sub={s.lastPaymentIn && `${formatDate(s.lastPaymentIn.paymentDate)} · ${PAYMENT_METHODS[s.lastPaymentIn.method] || ''}`} />
          <Stat label="Açık teklif" value={s.openQuotes} />
        </>}
      </div>

      {s.fx && (
        <div className="rounded-xl bg-indigo-50/60 p-3 text-xs text-indigo-900 space-y-1">
          <p className="font-black">{p.currency} cari · güncel kur {s.fx.rate ? `1 ${p.currency} = ${s.fx.rate.toLocaleString('tr-TR')} TL` : 'alınamadı'}</p>
          {s.fx.balanceTRY !== null && <p>Bakiyenin güncel TL karşılığı: <b>{formatTRY(Math.abs(s.fx.balanceTRY))}</b> {p.currentBalance < 0 ? '(borç)' : p.currentBalance > 0 ? '(alacak)' : ''}</p>}
          {s.fx.difference !== null && Math.abs(s.fx.difference) >= 1 && ( // 1 TL altı kuruş yuvarlamasıdır
            <p>Kur farkı (bilgi): <b className={s.fx.difference < 0 ? 'text-emerald-700' : 'text-red-600'}>{formatTRY(Math.abs(s.fx.difference))} {s.fx.difference < 0 ? 'lehimize' : 'aleyhimize'}</b> — hareketlerin işlendiği kurlara göre. Kur farkı faturası muhasebe programınızda düzenlenir.</p>
          )}
        </div>
      )}

      {s.aging && (() => {
        const sentence = agingSentence(s.aging);
        return (
          <div>
            <p className="text-sm font-black text-gray-900">Borç ne kadar süredir ödenmiyor?</p>
            {sentence && <p className={`text-xs font-bold mb-2 ${sentence.tone}`}>{sentence.text}</p>}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {AGING_LABELS.filter(([k]) => s.aging[k] > 0).map(([k, label]) => (
                <div key={k} className={`rounded-lg p-2 ${AGING_TONE[k]}`}>
                  <p className="text-[10px] font-bold leading-tight">{label}</p>
                  <p className="text-sm font-black tabular-nums">{formatMoney(s.aging[k], p.currency)}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        {[
          [Phone, p.phone], [Mail, p.email], [Landmark, [p.taxOffice, p.taxNumber].filter(Boolean).join(' / ')],
          [Hash, p.kind === 'DEALER' ? `${p._count.users} portal kullanıcısı` : 'Portal erişimi yok'], [UserCog, p.owner ? `Sorumlu: ${p.owner.name}` : null],
          [MapPin, p.address]
        ].filter(([, v]) => v).map(([Icon, v], i) => (
          <p key={i} className={`flex items-start gap-2 text-gray-700 ${Icon === MapPin ? 'sm:col-span-2' : ''}`}><Icon className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" /><span className="break-words">{v}</span></p>
        ))}
      </div>
      {p.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{p.tags.map((t) => <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-teal-50 text-teal-700"><Tag className="h-3 w-3 mr-1" />{t}</span>)}</div>}

      <div className="space-y-2">
        <p className="text-sm font-black text-gray-900">Yetkili kişiler</p>
        {p.contacts.length === 0 ? <p className="text-xs text-gray-400">Kayıtlı yetkili yok.</p> : p.contacts.map((c) => (
          <div key={c.id} className="rounded-xl ring-1 ring-gray-100 p-3 text-xs">
            <p className="font-bold text-gray-900 flex items-center">{c.isPrimary && <Star className="h-3.5 w-3.5 mr-1 text-amber-500" fill="currentColor" />}{c.name}{c.title && <span className="font-semibold text-gray-400 ml-1.5">· {c.title}</span>}</p>
            <p className="text-gray-500 mt-0.5">{[c.phone, c.email].filter(Boolean).join(' · ') || '—'}</p>
          </div>
        ))}
      </div>

      {p.notes && <div><p className="text-sm font-black text-gray-900">İç not</p><p className="text-xs text-gray-600 whitespace-pre-line mt-1">{p.notes}</p></div>}

      {p.statementLinks.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-black text-gray-900">Ekstre / mutabakat istekleri</p>
          {p.statementLinks.map((l) => (
            <p key={l.id} className="text-xs text-gray-600">
              {formatDate(l.createdAt)} · {formatMoney(l.balance, p.currency)} · {l.emailed ? `e-posta: ${l.sentTo}` : 'bağlantı'} ·{' '}
              {l.response === 'AGREED' ? <b className="text-emerald-600">Mutabık ({l.responderName})</b>
                : l.response === 'DISPUTED' ? <b className="text-red-600">İtiraz ({l.responderName}): {l.responseNote}</b>
                  : new Date(l.expiresAt) < new Date() ? <span className="text-gray-400">süresi doldu</span> : <span className="text-amber-600 font-bold">yanıt bekleniyor</span>}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

const PartnerDrawer = ({ id, meta, onClose, onChanged, showAlert, confirm }) => {
  const { user } = useAuth();
  const [partner, setPartner] = useState(null);
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState('summary');
  const [modal, setModal] = useState(null); // edit | in | out | tx | statement | convert

  useEffect(() => { api.get(`/partners/${id}`).then((r) => setPartner(r.data)).catch(() => setPartner(null)); }, [id, version]);
  const reload = () => { setVersion((v) => v + 1); onChanged(); };

  const remove = async () => {
    const ok = await confirm({ title: 'Cari silinsin mi?', message: 'Geçmiş hareketi veya belgesi olan cari silinmez, pasife alınır.', confirmText: 'Sil' });
    if (!ok) return;
    try {
      const res = await api.delete(`/partners/${id}`);
      showAlert({ type: res.data.archived ? 'info' : 'success', title: res.data.archived ? 'Pasife Alındı' : 'Silindi', message: res.data.message });
      onChanged();
      if (!res.data.archived) onClose(); else setVersion((v) => v + 1);
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Silinemedi.') });
    }
  };

  const p = partner && partner.id === id ? partner : null;
  const bal = p && balanceText(p.kind, p.currentBalance);
  const finance = can(user, 'FINANCE');
  const openReminders = p ? p.partnerNotes.filter((n) => !n.doneAt && n.remindAt && new Date(n.remindAt) <= new Date()).length : 0;
  const TABS = [['summary', 'Özet'], ...(finance ? [['ledger', 'Hareketler']] : []), ['notes', `Notlar${p?.partnerNotes.length ? ` (${p.partnerNotes.length})` : ''}`], ['docs', `Belgeler${p?.documents.length ? ` (${p.documents.length})` : ''}`]];
  const btn = 'flex items-center px-3 h-9 rounded-xl text-xs font-black';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative h-full w-full max-w-2xl bg-white shadow-2xl overflow-y-auto animate-slide-in">
        {!p ? <p className="p-10 text-center text-gray-400">Yükleniyor...</p> : (
          <div className="p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><Badge kind={p.kind} />{p.currency !== 'TRY' && <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-50 text-indigo-700">{p.currency} cari</span>}{p.status === 'PASSIVE' && <span className="text-[10px] font-black uppercase text-gray-400">Pasif</span>}</div>
                <h2 className="text-xl font-black text-gray-900 mt-1 break-words">{p.name}</h2>
                {p.externalCode && <p className="text-xs font-mono text-gray-400">Cari {p.externalCode}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className={`text-2xl font-black tabular-nums ${bal.className}`}>{formatMoney(Math.abs(p.currentBalance), p.currency)}</p>
                <p className={`text-[11px] font-bold ${bal.className}`}>{bal.label}</p>
                {p.kind === 'CUSTOMER' && p.riskLimit > 0 && <p className="text-[10px] text-gray-400">Limit {formatMoney(p.riskLimit, p.currency)}</p>}
                {p.paymentTermDays > 0 && <p className="text-[10px] text-gray-400">Vade {p.paymentTermDays} gün</p>}
              </div>
              <button onClick={onClose} className="p-2 -mr-2 rounded-lg text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex flex-wrap gap-2">
              {finance && p.kind !== 'SUPPLIER' && <button onClick={() => setModal('in')} className={`${btn} text-white bg-emerald-500 hover:bg-emerald-600`}><ArrowDownLeft className="h-3.5 w-3.5 mr-1.5" /> Tahsilat al</button>}
              {finance && <button onClick={() => setModal('out')} className={`${btn} ${p.kind === 'SUPPLIER' ? 'text-white bg-amber-500 hover:bg-amber-600' : 'text-gray-700 bg-gray-100 hover:bg-gray-200'}`}><ArrowUpRight className="h-3.5 w-3.5 mr-1.5" /> Ödeme yap</button>}
              {finance && <button onClick={() => setModal('tx')} className={`${btn} text-gray-700 bg-gray-100 hover:bg-gray-200`}><Wallet className="h-3.5 w-3.5 mr-1.5" /> {p.kind === 'SUPPLIER' ? 'Alış faturası / borç-alacak' : 'Borç / alacak'}</button>}
              {finance && <a href={`/print/statement/${p.id}`} target="_blank" rel="noreferrer" className={`${btn} text-gray-700 bg-gray-100 hover:bg-gray-200`}><FileText className="h-3.5 w-3.5 mr-1.5" /> Ekstre</a>}
              {finance && <button onClick={() => setModal('statement')} className={`${btn} text-indigo-700 bg-indigo-50 hover:bg-indigo-100`}><Send className="h-3.5 w-3.5 mr-1.5" /> Ekstre gönder / mutabakat</button>}
              {p.kind !== 'SUPPLIER' && p.status === 'ACTIVE' && can(user, 'QUOTES') && <Link to={`/admin/quotes/new?companyId=${p.id}`} className={`${btn} text-violet-700 bg-violet-50`}><FileSignature className="h-3.5 w-3.5 mr-1.5" /> Teklif hazırla</Link>}
              <button onClick={() => setModal('edit')} className={`${btn} text-gray-700 bg-gray-100 hover:bg-gray-200`}><Pencil className="h-3.5 w-3.5 mr-1.5" /> {p.kind === 'DEALER' ? 'Yetkililer / etiket / not' : 'Kartı düzenle'}</button>
              {p.kind === 'DEALER' && can(user, 'DEALERS') && <Link to={`/admin/dealers?search=${encodeURIComponent(p.name)}`} className={`${btn} text-indigo-700 bg-indigo-50`}><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Bayi kartı</Link>}
              {p.kind === 'CUSTOMER' && can(user, 'DEALERS') && <button onClick={() => setModal('convert')} className={`${btn} text-indigo-700 bg-indigo-50`}><Store className="h-3.5 w-3.5 mr-1.5" /> Bayiye dönüştür</button>}
              {p.kind !== 'DEALER' && <button onClick={remove} className={`${btn} text-red-600 hover:bg-red-50 ml-auto`}><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Sil</button>}
            </div>

            <div className="flex gap-1 border-b border-gray-100">
              {TABS.map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-xs font-black border-b-2 -mb-px ${tab === k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-700'}`}>
                  {label}{k === 'notes' && openReminders > 0 && <span className="ml-1 inline-flex items-center text-amber-600"><Bell className="h-3 w-3" />{openReminders}</span>}
                </button>
              ))}
            </div>

            {tab === 'summary' && <SummaryTab p={p} />}
            {tab === 'ledger' && finance && <LedgerTab partner={p} version={version} onChanged={reload} showAlert={showAlert} />}
            {tab === 'notes' && <NotesTab partner={p} notes={p.partnerNotes} currentUserId={user?.id} onChanged={reload} showAlert={showAlert} />}
            {tab === 'docs' && <DocumentsTab partner={p} documents={p.documents} onChanged={reload} showAlert={showAlert} confirm={confirm} />}
          </div>
        )}
      </aside>
      {p && modal === 'edit' && <PartnerForm partner={p} meta={meta} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {p && ['in', 'out'].includes(modal) && <PaymentModal partner={p} direction={modal === 'in' ? 'IN' : 'OUT'} onClose={() => setModal(null)} onSaved={reload} />}
      {p && modal === 'tx' && <TransactionModal partner={p} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {p && modal === 'statement' && <StatementLinkModal partner={p} onClose={() => setModal(null)} onSaved={reload} />}
      {p && modal === 'convert' && <ConvertModal partner={p} onClose={() => setModal(null)} onSaved={(message) => { setModal(null); reload(); showAlert({ type: 'success', title: 'Bayiye Dönüştürüldü', message }); }} />}
    </div>
  );
};

const KIND_TABS = (counts) => [
  { id: '', label: 'Tümü', icon: Layers, tone: 'slate', count: counts.ALL },
  { id: 'DEALER', label: 'Bayiler', icon: PARTNER_KINDS.DEALER.icon, tone: 'blue', count: counts.DEALER || 0 },
  { id: 'CUSTOMER', label: 'Müşteriler', icon: PARTNER_KINDS.CUSTOMER.icon, tone: 'emerald', count: counts.CUSTOMER || 0 },
  { id: 'SUPPLIER', label: 'Tedarikçiler', icon: PARTNER_KINDS.SUPPLIER.icon, tone: 'orange', count: counts.SUPPLIER || 0 },
];
const EMPTY = { kind: '', q: '', balance: '', status: 'ACTIVE', tag: '', ownerId: '', reminder: '', sort: 'name' };

/**
 * Cari Hesaplar: bayiler, portal dışı müşteriler ve tedarikçiler. Bayi yönetimi ayrı ekranda kalır;
 * bu ekran tüm carileri arama, bakiye, tahsilat, hareket, not ve belge takibi için toplar.
 */
const PartnerManagement = () => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState(EMPTY);
  const [query, setQuery] = useState(filter);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [meta, setMeta] = useState({ tags: [], staff: [] });
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(null); // 'CUSTOMER' | 'SUPPLIER'
  const [importing, setImporting] = useState(false);
  const [moreFilters, setMoreFilters] = useState(false);
  const openId = parseInt(params.get('id')) || null;
  const { alertElement, showAlert, confirm } = useAlert();

  useEffect(() => { api.get('/partners/meta').then((r) => setMeta(r.data)).catch(() => {}); }, [version]);
  useEffect(() => {
    const t = setTimeout(() => { setQuery(filter); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [filter]);
  const activeParams = Object.fromEntries(Object.entries(query).filter(([, v]) => v));
  useEffect(() => {
    api.get('/partners', { params: { ...Object.fromEntries(Object.entries(query).filter(([, v]) => v)), page, limit: 50 } })
      .then((r) => setResult(r.data)).catch(() => setResult({ data: [], counts: {}, pagination: {} }));
  }, [query, page, version]);

  const open = (id) => setParams(id ? { id: String(id) } : {});
  const refresh = () => setVersion((v) => v + 1);
  const set = (k) => (e) => setFilter({ ...filter, [k]: e.target.value });
  const extraCount = ['status', 'tag', 'ownerId', 'reminder'].filter((k) => filter[k] && !(k === 'status' && filter[k] === 'ACTIVE')).length;

  return (
    <div className="space-y-6">
      {alertElement}
      <div className="flex flex-col xl:flex-row justify-between xl:items-end gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-teal-500 to-teal-700 p-3.5 rounded-2xl shadow-lg shadow-teal-500/25 shrink-0"><BookUser className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Cari Hesaplar</h1>
            <p className="text-gray-500 text-sm mt-1">Bayiler, portal kullanmayan müşteriler ve tedarikçiler: bakiye, tahsilat, hareket, not ve belgeler. Portala giren bayiler <Link to="/admin/dealers" className="text-indigo-600 font-bold hover:underline">Bayi Yönetimi</Link>'nden eklenir.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button onClick={() => setCreating('CUSTOMER')} className="btn-gradient"><Plus className="h-4 w-4 mr-2" /> Yeni Müşteri</button>
          <button onClick={() => setCreating('SUPPLIER')} className="flex items-center px-4 h-11 rounded-xl text-sm font-black text-amber-800 bg-amber-50 hover:bg-amber-100"><Plus className="h-4 w-4 mr-2" /> Yeni Tedarikçi</button>
          <button onClick={() => downloadFile('/partners/export', activeParams, 'cariler.xlsx')} className="flex items-center px-4 h-11 rounded-xl text-sm font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100"><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel'e Aktar</button>
          <button onClick={() => setImporting(true)} className="flex items-center px-4 h-11 rounded-xl text-sm font-black text-gray-700 bg-gray-100 hover:bg-gray-200"><Upload className="h-4 w-4 mr-2" /> Excel'den Yükle</button>
        </div>
      </div>

      <FilterTabs tabs={KIND_TABS(result?.counts || {})} value={filter.kind} onChange={(kind) => setFilter({ ...filter, kind })} />

      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_12rem_12rem_auto] gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input className="premium-input !pl-10" placeholder="Unvan, vergi no, cari kodu, telefon, e-posta veya yetkili ara" value={filter.q} onChange={set('q')} />
          </div>
          <select className="premium-input" value={filter.balance} onChange={set('balance')}>
            <option value="">Tüm bakiyeler</option><option value="debtor">Borçlu olanlar</option><option value="creditor">Alacaklı olanlar</option><option value="zero">Bakiyesi sıfır</option>
          </select>
          <select className="premium-input" value={filter.sort} onChange={set('sort')}>
            <option value="name">Ada göre</option><option value="balance">En borçlu önce</option><option value="newest">En yeni kayıt</option>
          </select>
          <button onClick={() => setMoreFilters(!moreFilters)} className={`flex items-center justify-center px-4 h-11 rounded-xl text-sm font-black ${moreFilters || extraCount ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
            <SlidersHorizontal className="h-4 w-4 mr-2" /> Filtreler{extraCount > 0 && ` (${extraCount})`}
          </button>
        </div>
        {moreFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 rounded-2xl bg-gray-50 p-3">
            <select className="premium-input !bg-white" value={filter.status} onChange={set('status')}>
              <option value="ACTIVE">Aktif cariler</option><option value="PASSIVE">Pasif cariler</option><option value="">Aktif + pasif</option>
            </select>
            <select className="premium-input !bg-white" value={filter.tag} onChange={set('tag')}>
              <option value="">Tüm etiketler</option>
              {meta.tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="premium-input !bg-white" value={filter.ownerId} onChange={set('ownerId')}>
              <option value="">Tüm sorumlular</option>
              <option value={user?.id}>Bana atananlar</option>
              <option value="none">Sorumlusu atanmamış</option>
              {meta.staff.filter((u) => u.id !== user?.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setFilter({ ...filter, reminder: filter.reminder ? '' : 'mine' })} className={`flex-1 flex items-center justify-center px-3 h-11 rounded-xl text-xs font-black ${filter.reminder ? 'bg-amber-500 text-white' : 'bg-white text-amber-700 ring-1 ring-amber-200'}`}><Bell className="h-4 w-4 mr-1.5" /> Hatırlatmalarım</button>
              <button onClick={() => setFilter({ ...EMPTY, kind: filter.kind })} className="px-3 h-11 rounded-xl text-xs font-black text-gray-500 bg-white ring-1 ring-gray-200">Temizle</button>
            </div>
          </div>
        )}
      </div>

      {!result ? <div className="text-center py-12 text-gray-400">Yükleniyor...</div> : result.data.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400">Bu filtrede cari yok.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="hidden lg:grid grid-cols-[minmax(14rem,1fr)_7rem_9rem_10rem_8rem_10rem] gap-4 px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
            <span>Cari</span><span>Tür</span><span>Vergi no</span><span>İletişim</span><span>Sorumlu</span><span className="text-right">Bakiye</span>
          </div>
          {result.data.map((p) => {
            const bal = balanceText(p.kind, p.currentBalance);
            const contact = p.contacts[0];
            return (
              <button key={p.id} onClick={() => open(p.id)} className={`w-full text-left grid grid-cols-2 lg:grid-cols-[minmax(14rem,1fr)_7rem_9rem_10rem_8rem_10rem] gap-x-4 gap-y-1 px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-teal-50/40 items-center ${p.status === 'PASSIVE' ? 'opacity-60' : ''}`}>
                <span className="min-w-0 col-span-2 lg:col-span-1">
                  <span className="block font-bold text-gray-900 truncate">{p.name}</span>
                  <span className="flex flex-wrap items-center gap-1 text-xs text-gray-400">
                    <span className="truncate">{[p.externalCode && `Cari ${p.externalCode}`, contact?.name || p.authorizedPerson, p.status === 'PASSIVE' && 'Pasif', p.status === 'PENDING' && 'Başvuru'].filter(Boolean).join(' · ') || '—'}</span>
                    {p.tags.slice(0, 3).map((t) => <span key={t} className="px-1.5 rounded bg-teal-50 text-teal-700 text-[10px] font-bold">{t}</span>)}
                  </span>
                </span>
                <span><Badge kind={p.kind} /></span>
                <span className="text-xs text-gray-500 font-mono">{p.taxNumber || '—'}</span>
                <span className="text-xs text-gray-500 truncate">{p.phone || contact?.phone || p.email || '—'}</span>
                <span className="text-xs text-gray-500 truncate">{p.owner?.name || '—'}</span>
                <span className="lg:text-right">
                  <span className={`block text-sm font-black tabular-nums ${bal.className}`}>{p.currentBalance ? formatMoney(Math.abs(p.currentBalance), p.currency) : '—'}</span>
                  {p.currentBalance !== 0 && <span className={`block text-[10px] font-bold ${bal.className}`}>{bal.label}</span>}
                </span>
              </button>
            );
          })}
          {result.pagination.pages > 1 && (
            <div className="flex justify-center items-center gap-3 p-4">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-4 h-9 rounded-xl text-xs font-black bg-gray-100 disabled:opacity-40">Önceki</button>
              <span className="text-xs font-bold text-gray-500">{page} / {result.pagination.pages} · {result.pagination.total} cari</span>
              <button disabled={page >= result.pagination.pages} onClick={() => setPage(page + 1)} className="px-4 h-9 rounded-xl text-xs font-black bg-gray-100 disabled:opacity-40">Sonraki</button>
            </div>
          )}
        </div>
      )}

      {openId && <PartnerDrawer id={openId} meta={meta} onClose={() => open(null)} onChanged={refresh} showAlert={showAlert} confirm={confirm} />}
      {creating && <PartnerForm initialKind={creating} meta={meta} onClose={() => setCreating(null)} onSaved={(p) => { setCreating(null); refresh(); open(p.id); }} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={refresh} />}
    </div>
  );
};

export default PartnerManagement;
