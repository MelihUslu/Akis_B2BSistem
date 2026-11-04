import { useState } from 'react';
import { Ban, Banknote, CheckCircle2, Clock, Paperclip, Undo2, Wallet } from 'lucide-react';
import Modal from '../shared/Modal';
import { Field, Segmented } from '../form/FormKit';
import { formatDate, formatTRY } from '../../utils/format';
import { downloadFile } from '../../utils/download';
import { STATUS, METHODS, PAYMENT_KINDS, today } from './hrMeta';

/**
 * Personel ekranlarının ortak parçaları: durum etiketi, karar / ödeme bilgisi, ret ve ödeme pencereleri.
 */
export const StatusPill = ({ status, className = '' }) => {
  const s = STATUS[status] || STATUS.PENDING;
  return <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-black ring-1 whitespace-nowrap ${s.className} ${className}`}>{s.label}</span>;
};

// Kim, ne zaman karar verdi (ret gerekçesiyle)
export const DecisionNote = ({ item }) => {
  if (!item.decidedAt) return null;
  const rejected = item.status === 'REJECTED';
  return (
    <p className={`text-xs ${rejected ? 'text-red-600' : 'text-gray-500'}`}>
      {rejected ? <Ban className="inline h-3.5 w-3.5 mr-1 -mt-0.5" /> : <CheckCircle2 className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-emerald-500" />}
      {rejected ? 'Reddeden' : 'Onaylayan'}: <b className="font-semibold">{item.decidedByName || '—'}</b> · {formatDate(item.decidedAt, true)}
      {rejected && item.rejectReason && <> · Gerekçe: {item.rejectReason}</>}
    </p>
  );
};

// Ödeme / mahsup kayıtları (kim, ne zaman, nasıl); Finans yetkilisi yanlış girilen kaydı geri alır
export const Payments = ({ payments, onUndo, label }) => (payments?.length ? (
  <ul className="space-y-0.5">
    {label && <li className="text-[11px] font-bold text-gray-400">{label}</li>}
    {payments.map((p) => (
      <li key={p.id} className={`flex flex-wrap items-center gap-x-1.5 text-xs ${p.kind === 'PAYOUT' ? 'text-emerald-700' : 'text-sky-700'}`}>
        {p.kind === 'PAYOUT' ? <Banknote className="h-3.5 w-3.5" /> : <Wallet className="h-3.5 w-3.5" />}
        <b className="font-semibold tabular-nums">{formatTRY(p.amount)}</b>
        <span>{p.kind === 'PAYOUT' ? METHODS[p.method] || p.method : PAYMENT_KINDS[p.kind]}{p.kind === 'REFUND' && p.method ? ` (${METHODS[p.method]})` : ''} · {p.createdByName || '—'} · {formatDate(p.date)}</span>
        {onUndo && <button type="button" onClick={() => onUndo(p)} className="ml-1 inline-flex items-center gap-0.5 text-gray-400 hover:text-red-600" title="Yanlış girildiyse geri al"><Undo2 className="h-3 w-3" /> Geri al</button>}
      </li>
    ))}
  </ul>
) : null);

export const FileLink = ({ claim }) => (claim.hasFile ? (
  <button type="button" onClick={() => downloadFile(`/hr/claims/${claim.id}/file`, null, claim.fileName)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline min-w-0">
    <Paperclip className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{claim.fileName || 'Fiş / fatura'}</span>
  </button>
) : null);

export const Pending = ({ children }) => <p className="text-xs text-amber-700"><Clock className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />{children}</p>;

// Gerekçeli ret
export const RejectModal = ({ title, subtitle, onClose, onSubmit }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await onSubmit(reason.trim()); } finally { setBusy(false); }
  };
  return (
    <Modal as="form" onSubmit={submit} icon={Ban} title={title} subtitle={subtitle} onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button><button disabled={busy || reason.trim().length < 3} className="h-12 px-5 rounded-2xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50">Reddet</button></>}>
      <Field label="Ret gerekçesi" required hint="Personele bildirimle iletilir">
        <textarea required autoFocus minLength={3} maxLength={500} rows={3} className="premium-input" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Ret gerekçesi" />
      </Field>
    </Modal>
  );
};

// Ödeme kaydı: tutar (kısmi olabilir), tarih ve şekil. Nakit / banka / kart gelir-gidere gider olarak yazılır;
// "avanstan mahsup" personelin açık avansından düşer (nakit çıkmaz)
export const PayModal = ({ title, amount, category, openAdvance = 0, onClose, onSubmit }) => {
  const [form, setForm] = useState({ date: today(), method: 'BANK', amount: String(amount).replace('.', ',') });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await onSubmit(form); } finally { setBusy(false); }
  };
  return (
    <Modal as="form" onSubmit={submit} icon={Banknote} title={title} subtitle={`Kalan ${formatTRY(amount)}. Nakit / banka / kart ödemesi Gelir-Gider'e "${category}" gideri olarak eklenir.`} onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button><button disabled={busy} className="btn-gradient disabled:opacity-50">Ödemeyi kaydet</button></>}>
      <Field label="Ödeme şekli" required>
        <Segmented value={form.method} onChange={(method) => setForm({ ...form, method })} options={[
          ...Object.entries(METHODS).map(([value, label]) => ({ value, label })),
          ...(openAdvance > 0 ? [{ value: 'ADVANCE', label: 'Avanstan mahsup' }] : [])
        ]} />
      </Field>
      {form.method === 'ADVANCE' && <p className="text-xs font-semibold text-sky-700 bg-sky-50 rounded-xl p-3">Personelin açık avansı {formatTRY(openAdvance)}. Tutar avanstan düşülür; nakit çıkmaz, gelir-gidere yeni gider yazılmaz.</p>}
      <Field label="Tutar (₺)" required hint="Kısmi ödeme için kalandan az yazın">
        <input required inputMode="decimal" className="premium-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} aria-label="Ödeme tutarı" />
      </Field>
      <Field label="Ödeme tarihi" required>
        <input type="date" required max={today()} className="premium-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Ödeme tarihi" />
      </Field>
    </Modal>
  );
};

// Kart görünümlü liste satırı (telefonda alt alta, geniş ekranda yan yana)
export const Row = ({ children, className = '' }) => <li className={`p-4 md:p-5 ${className}`}>{children}</li>;
export const ListCard = ({ children }) => <ul className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">{children}</ul>;

// Açık avansın kapanması: nakit iade (gelir kaydı) ya da maaştan kesinti (nakit kaydı açılmaz)
export const SettleModal = ({ advance, onClose, onSubmit }) => {
  const [form, setForm] = useState({ kind: 'REFUND', method: 'CASH', date: today(), amount: String(advance.open).replace('.', ',') });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await onSubmit(form); } finally { setBusy(false); }
  };
  return (
    <Modal as="form" onSubmit={submit} icon={Wallet} title={`Avansı kapat · ${advance.employee?.name || ''}`} subtitle={`Açık avans ${formatTRY(advance.open)}. Masraflar ve primler ödeme penceresinde "avanstan mahsup" ile düşülür.`} onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button><button disabled={busy} className="btn-gradient disabled:opacity-50">Kaydet</button></>}>
      <Field label="Kapanış" required hint={form.kind === 'REFUND' ? 'Personelin geri verdiği tutar Gelir-Gider\'e "Personel avans iadesi" geliri olarak eklenir' : 'Bordro sistem dışında; yalnızca avans kapanır, nakit kaydı açılmaz'}>
        <Segmented value={form.kind} onChange={(kind) => setForm({ ...form, kind })} options={[{ value: 'REFUND', label: 'Nakit iade' }, { value: 'PAYROLL', label: 'Maaştan kesinti' }]} />
      </Field>
      {form.kind === 'REFUND' && (
        <Field label="İade nasıl alındı" required>
          <Segmented size="sm" value={form.method} onChange={(method) => setForm({ ...form, method })} options={Object.entries(METHODS).map(([value, label]) => ({ value, label }))} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tutar (₺)" required><input required inputMode="decimal" className="premium-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} aria-label="Kapanış tutarı" /></Field>
        <Field label="Tarih" required><input type="date" required max={today()} className="premium-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Kapanış tarihi" /></Field>
      </div>
    </Modal>
  );
};
