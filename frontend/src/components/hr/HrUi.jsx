import { useState } from 'react';
import { Ban, Banknote, CheckCircle2, Clock, Paperclip } from 'lucide-react';
import Modal from '../shared/Modal';
import { Field, Segmented } from '../form/FormKit';
import { formatDate, formatTRY } from '../../utils/format';
import { downloadFile } from '../../utils/download';
import { STATUS, METHODS, today } from './hrMeta';

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

// Ödeme bilgisi (ödeyen, tarih, şekil)
export const PaymentNote = ({ item, amount }) => (item.paidAt ? (
  <p className="text-xs text-emerald-700">
    <Banknote className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
    {amount !== undefined ? <><b className="font-semibold">{formatTRY(amount)}</b> ödendi</> : 'Ödendi'} · {METHODS[item.paymentMethod] || item.paymentMethod} · {item.paidByName || '—'} · {formatDate(item.paidAt, true)}
  </p>
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

// Ödeme kaydı: tarih ve ödeme şekli; gelir-gidere gider olarak yazılır
export const PayModal = ({ title, amount, category, onClose, onSubmit }) => {
  const [form, setForm] = useState({ date: today(), method: 'BANK' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await onSubmit(form); } finally { setBusy(false); }
  };
  return (
    <Modal as="form" onSubmit={submit} icon={Banknote} title={title} subtitle={`${formatTRY(amount)} · Gelir-Gider'e "${category}" gideri olarak eklenir.`} onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button><button disabled={busy} className="btn-gradient disabled:opacity-50">Ödemeyi kaydet</button></>}>
      <Field label="Ödeme şekli" required>
        <Segmented value={form.method} onChange={(method) => setForm({ ...form, method })} options={Object.entries(METHODS).map(([value, label]) => ({ value, label }))} />
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
