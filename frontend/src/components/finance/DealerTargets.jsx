import { useEffect, useState } from 'react';
import { Target, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import Modal from '../shared/Modal';
import { Field, Segmented } from '../form/FormKit';
import { formatTRY, formatDate } from '../../utils/format';
import TargetProgress from './TargetProgress';

/**
 * Bayi hedefleri ve ciro primi (yönetici). Gerçekleşen: dönemde onaylanan siparişlerin KDV hariç tutarı eksi iadeler.
 * Dönem kapatılınca hedef tutmuşsa prim bayinin carisine alacak yazılır.
 */
const STATUS = {
  OPEN: { label: 'Sürüyor', className: 'bg-brand-50 text-brand-700' },
  PAID: { label: 'Prim yazıldı', className: 'bg-emerald-50 text-emerald-700' },
  CLOSED: { label: 'Kapandı', className: 'bg-gray-100 text-gray-500' }
};

// Dönem seçenekleri: bu ay / bu çeyrek / bu yıl (firma saatiyle)
const ymd = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const period = (kind) => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (kind === 'month') return [new Date(y, m, 1), new Date(y, m + 1, 0)];
  if (kind === 'quarter') { const q = Math.floor(m / 3) * 3; return [new Date(y, q, 1), new Date(y, q + 3, 0)]; }
  return [new Date(y, 0, 1), new Date(y, 11, 31)];
};
const periodName = (kind) => {
  const now = new Date();
  if (kind === 'month') return now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  if (kind === 'quarter') return `${now.getFullYear()} ${Math.floor(now.getMonth() / 3) + 1}. çeyrek`;
  return `${now.getFullYear()} yılı`;
};

const NewTarget = ({ onClose, onSaved }) => {
  const [dealers, setDealers] = useState([]);
  const [kind, setKind] = useState('quarter');
  const [form, setForm] = useState(() => {
    const [a, b] = period('quarter');
    return { companyId: '', name: periodName('quarter'), periodStart: ymd(a), periodEnd: ymd(b), targetAmount: '', bonusRate: '3' };
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    api.get('/companies', { params: { status: 'ACTIVE', limit: 200, page: 1 } }).then((r) => setDealers(r.data.data || [])).catch(() => {});
  }, []);

  const pick = (k) => {
    setKind(k);
    if (k === 'custom') return;
    const [a, b] = period(k);
    setForm({ ...form, name: periodName(k), periodStart: ymd(a), periodEnd: ymd(b) });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/targets', form);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Hedef kaydedilemedi.'));
    } finally {
      setBusy(false);
    }
  };

  const bonus = (parseFloat(form.targetAmount) || 0) * (parseFloat(form.bonusRate) || 0) / 100;
  return (
    <Modal as="form" onSubmit={submit} icon={Target} title="Yeni bayi hedefi" subtitle="Hedefe ulaşan bayiye satışının belirli yüzdesi ciro primi olarak carisine yazılır." onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button><button disabled={busy} className="btn-gradient disabled:opacity-50">Kaydet</button></>}>
      <Field label="Bayi" required>
        <select required className="premium-input" value={form.companyId} onChange={set('companyId')} aria-label="Bayi">
          <option value="">Bayi seçin</option>
          {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="Dönem">
        <Segmented size="sm" value={kind} onChange={pick} options={[{ value: 'month', label: 'Bu ay' }, { value: 'quarter', label: 'Bu çeyrek' }, { value: 'year', label: 'Bu yıl' }, { value: 'custom', label: 'Özel' }]} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Başlangıç"><input type="date" required className="premium-input" value={form.periodStart} onChange={(e) => { setKind('custom'); set('periodStart')(e); }} aria-label="Dönem başlangıcı" /></Field>
        <Field label="Bitiş"><input type="date" required className="premium-input" value={form.periodEnd} min={form.periodStart} onChange={(e) => { setKind('custom'); set('periodEnd')(e); }} aria-label="Dönem bitişi" /></Field>
      </div>
      <Field label="Hedef adı"><input className="premium-input" value={form.name} onChange={set('name')} maxLength={80} aria-label="Hedef adı" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hedef ciro (KDV hariç ₺)" required><input type="number" min="1" step="1" required className="premium-input" value={form.targetAmount} onChange={set('targetAmount')} aria-label="Hedef ciro" /></Field>
        <Field label="Ciro primi (%)" required><input type="number" min="0.1" max="50" step="0.1" required className="premium-input" value={form.bonusRate} onChange={set('bonusRate')} aria-label="Ciro primi yüzdesi" /></Field>
      </div>
      {bonus > 0 && <p className="text-xs font-bold text-emerald-700 bg-emerald-50 rounded-xl p-3">Hedef tam tutarsa en az {formatTRY(bonus)} prim cariye yazılır (hedefi aşan satışın da yüzdesi eklenir).</p>}
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </Modal>
  );
};

const DealerTargets = ({ showAlert, confirm }) => {
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = () => api.get('/targets').then((r) => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const close = async (t) => {
    const reached = t.achieved >= t.targetAmount;
    const ok = await confirm({
      type: reached ? 'info' : 'warning',
      title: reached ? 'Dönem kapatılsın, prim yazılsın mı?' : 'Hedef tutmadı; dönem kapatılsın mı?',
      message: reached ? `${t.company.name}: ${formatTRY(t.bonus)} ciro primi carisine alacak olarak yazılacak.` : `${t.company.name}: gerçekleşen ${formatTRY(t.achieved)} (%${t.percent}). Prim yazılmaz.`,
      confirmText: reached ? 'Primi yaz ve kapat' : 'Kapat'
    });
    if (!ok) return;
    try {
      const res = await api.post(`/targets/${t.id}/close`, {});
      showAlert({ type: 'success', title: 'Hedef kapatıldı', message: res.data.message });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Hedef kapatılamadı.') });
    }
  };

  const remove = async (t) => {
    if (!(await confirm({ title: 'Hedef silinsin mi?', message: `${t.company.name} · ${t.name || 'dönem hedefi'}`, confirmText: 'Sil' }))) return;
    try {
      await api.delete(`/targets/${t.id}`);
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Hedef silinemedi.') });
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {adding && <NewTarget onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); showAlert({ type: 'success', title: 'Hedef kaydedildi', message: 'Bayiye bildirim gönderildi; ilerlemeyi Finansal Durum sayfasında görür.' }); }} />}
      <div className="p-5 border-b border-gray-50 flex flex-wrap items-center gap-3">
        <Target className="h-5 w-5 text-brand-500" />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900">Bayi hedefleri ve ciro primi</h3>
          <p className="text-xs text-gray-500">Dönemde onaylanan satış (KDV hariç, iadeler düşülür). Kapatınca hedef tuttuysa prim cariye alacak yazılır.</p>
        </div>
        <button type="button" onClick={() => setAdding(true)} className="h-10 px-4 rounded-xl bg-navy-900 text-white text-sm font-bold flex items-center gap-1.5 hover:bg-navy-950"><Plus className="h-4 w-4" /> Yeni hedef</button>
      </div>
      {rows && rows.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">Henüz hedef yok.</p>}
      <ul className="divide-y divide-gray-50">
        {(rows || []).map((t) => (
          <li key={t.id} className="p-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)_auto] md:items-center">
            <div className="min-w-0">
              <p className="font-bold text-gray-900 truncate">{t.company.name}</p>
              <p className="text-xs text-gray-500">{t.name || 'Dönem hedefi'} · {formatDate(t.periodStart)} – {formatDate(t.periodEnd)} · %{t.bonusRate} prim</p>
              <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold ${STATUS[t.status]?.className}`}>{STATUS[t.status]?.label}{t.status === 'PAID' && ` · ${formatTRY(t.paidAmount)}`}{t.status === 'OPEN' && t.ended && ' · dönem bitti'}</span>
            </div>
            <TargetProgress t={t} />
            {t.status === 'OPEN' ? (
              <div className="flex gap-2 md:justify-end">
                <button type="button" onClick={() => close(t)} className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-700"><CheckCircle2 className="h-4 w-4" /> Dönemi kapat</button>
                <button type="button" onClick={() => remove(t)} className="h-9 w-9 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center" aria-label="Hedefi sil"><Trash2 className="h-4 w-4" /></button>
              </div>
            ) : <span />}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DealerTargets;
