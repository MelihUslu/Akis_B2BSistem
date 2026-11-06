import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import api from '../../services/api';
import { formatDate, formatMoney } from '../../utils/format';
import { phoneText, reachable } from './shared';

/**
 * Toplu SMS ve toplu e-postanın alıcı seçimi: bayiler, bayi olmayan müşteri carileri ve müşteri adayları; süzgeçler ve
 * seçim (kaynak sekmeleri arasında korunur). channel: 'sms' satırda cep numaralarını, 'email' adresleri gösterir;
 * numarası / kullanılabilir adresi olmayan satır seçilemez.
 */
const SOURCE_TABS = [['DEALER', 'Bayiler'], ['CUSTOMER', 'Müşteriler'], ['LEAD', 'Müşteri adayları']];
const NO_ORDER = [['', 'Sipariş durumu: hepsi'], ['30', '30 gündür sipariş yok'], ['60', '60 gündür sipariş yok'], ['90', '90 gündür sipariş yok']];
const SELECT = 'premium-input !w-auto !py-2 text-sm';
const EMPTY_FILTERS = { q: '', tag: '', group: '', plasiyerId: '', debtOnly: false, noOrderDays: '', status: '', leadSource: '', city: '' };

const RecipientPicker = ({ meta, endpoint, channel, selected, setSelected }) => {
  const [source, setSource] = useState('DEALER');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [list, setList] = useState(null);

  // Süzgeç değişince liste yeniden (yazarken biraz beklenir)
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      const params = Object.fromEntries(Object.entries({ source, ...filters }).filter(([, v]) => v !== '' && v !== false));
      api.get(endpoint, { params }).then((r) => { if (alive) setList(r.data); }).catch(() => { if (alive) setList({ rows: [] }); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [endpoint, source, filters]);

  const selectable = useMemo(() => (list?.rows || []).filter((r) => reachable(r, channel).length), [list, channel]);
  const allOnPage = selectable.length > 0 && selectable.every((r) => selected[r.key]);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toggle = (row) => setSelected((prev) => {
    const next = { ...prev };
    if (next[row.key]) delete next[row.key]; else next[row.key] = row;
    return next;
  });
  const toggleAll = () => setSelected((prev) => {
    const next = { ...prev };
    if (allOnPage) selectable.forEach((r) => delete next[r.key]);
    else selectable.forEach((r) => { next[r.key] = r; });
    return next;
  });
  const isLead = source === 'LEAD';
  const sms = channel === 'sms';

  const contactCell = (r) => {
    const list = reachable(r, channel);
    if (!list.length) {
      if (!sms && r.optedOut?.length) return <span className="text-amber-700">Abonelikten çıktı</span>;
      return sms ? 'Cep yok' : 'E-posta yok';
    }
    return (
      <>
        <span className={sms ? '' : 'block max-w-[14rem] truncate'}>{sms ? phoneText(list[0]) : list[0]}</span>
        {list.length > 1 && <span className="block text-[11px] text-gray-400">+{list.length - 1} {sms ? 'numara' : 'adres'}</span>}
        {!sms && r.optedOut?.length > 0 && <span className="block text-[11px] text-amber-700">{r.optedOut.length} adres abonelikten çıktı</span>}
      </>
    );
  };

  return (
    <div className="card-premium p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex p-1 rounded-xl bg-gray-100">
          {SOURCE_TABS.map(([id, label]) => (
            <button key={id} onClick={() => { setSource(id); setFilters(EMPTY_FILTERS); setList(null); }} className={`px-3 py-1.5 text-xs font-black rounded-lg ${source === id ? 'bg-white shadow-sm text-brand-600' : 'text-gray-500'}`}>{label}</button>
          ))}
        </div>
        <span className="text-xs font-bold text-gray-500">{Object.keys(selected).length} alıcı seçili</span>
      </div>

      <div className="space-y-2">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input className="premium-input !pl-9" placeholder={isLead ? `Ad${sms ? ' ya da telefon' : ', telefon ya da e-posta'} ara` : 'Firma adı ara'} value={filters.q} onChange={set('q')} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {isLead ? (
            <>
              <select className={SELECT} value={filters.status} onChange={set('status')} aria-label="Durum"><option value="">Durum: hepsi</option>{Object.entries(meta.leadStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <select className={SELECT} value={filters.leadSource} onChange={set('leadSource')} aria-label="Kaynak"><option value="">Kaynak: hepsi</option>{Object.entries(meta.leadSources).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input className="premium-input !w-40 !py-2 text-sm" placeholder="Şehir" value={filters.city} onChange={set('city')} />
            </>
          ) : (
            <>
              {meta.tags.length > 0 && <select className={SELECT} value={filters.tag} onChange={set('tag')} aria-label="Etiket"><option value="">Etiket: hepsi</option>{meta.tags.map((t) => <option key={t}>{t}</option>)}</select>}
              {source === 'DEALER' && <select className={SELECT} value={filters.group} onChange={set('group')} aria-label="Bayi grubu"><option value="">Bayi grubu: hepsi</option>{meta.groups.map((g) => <option key={g}>{g}</option>)}</select>}
              {meta.plasiyers.length > 0 && <select className={SELECT} value={filters.plasiyerId} onChange={set('plasiyerId')} aria-label="Plasiyer"><option value="">Plasiyer: hepsi</option>{meta.plasiyers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
              <select className={SELECT} value={filters.noOrderDays} onChange={set('noOrderDays')} aria-label="Sipariş durumu">{NO_ORDER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 px-1 whitespace-nowrap"><input type="checkbox" checked={filters.debtOnly} onChange={set('debtOnly')} className="h-4 w-4 accent-brand-600" /> Yalnızca borcu olanlar</label>
            </>
          )}
        </div>
      </div>

      {!list ? <p className="py-10 text-center text-sm text-gray-400">Yükleniyor…</p> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <label className="flex items-center gap-2 font-bold text-gray-700 cursor-pointer">
              <input type="checkbox" checked={allOnPage} onChange={toggleAll} disabled={!selectable.length} className="h-4 w-4 accent-brand-600" /> Listedekilerin hepsini seç
            </label>
            <span>{list.rows.length} kayıt · {selectable.length} tanesinde {sms ? 'cep telefonu' : 'e-posta adresi'} var{list.rows.length - selectable.length > 0 ? ` (${sms ? 'numarası' : 'adresi'} olmayanlar seçilemez)` : ''}</span>
          </div>
          <ul className="divide-y divide-gray-100 rounded-xl ring-1 ring-gray-100 max-h-[32rem] overflow-y-auto">
            {list.rows.length === 0 && <li className="py-10 text-center text-sm text-gray-500">Bu süzgeçte kayıt yok.</li>}
            {list.rows.map((r) => {
              const ok = reachable(r, channel).length > 0;
              return (
                <li key={r.key}>
                  <label className={`flex items-start gap-3 px-4 py-3 ${ok ? 'cursor-pointer hover:bg-gray-50' : 'opacity-50'}`}>
                    <input type="checkbox" checked={Boolean(selected[r.key])} disabled={!ok} onChange={() => toggle(r)} className="mt-1 h-4 w-4 accent-brand-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-gray-900 truncate">{r.name}</span>
                      <span className="block text-xs text-gray-500 truncate">
                        {[r.contact && r.contact !== r.name ? r.contact : null, r.group, r.plasiyer && `Plasiyer: ${r.plasiyer}`, r.city, r.tags?.length ? r.tags.join(', ') : null,
                          r.balance < 0 ? `${formatMoney(-r.balance, r.currency)} borç` : null,
                          !isLead ? (r.lastOrderAt ? `Son sipariş ${formatDate(r.lastOrderAt)}` : 'Sipariş yok') : meta.leadStatuses[r.status]].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap text-right">{contactCell(r)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};

export default RecipientPicker;
