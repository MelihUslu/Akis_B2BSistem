import { useState } from 'react';
import { Printer, Copy, Mail } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import Modal from '../shared/Modal';
import { Field, Segmented, Toggle } from '../form/FormKit';
import { PAYMENT_METHODS, transactionTypes } from '../../utils/partner';
import { formatMoney } from '../../utils/format';

const today = () => new Date().toISOString().slice(0, 10);
const cancelBtn = (onClose) => <button type="button" onClick={onClose} className="px-4 h-11 rounded-xl text-sm font-black text-gray-600 bg-gray-100 hover:bg-gray-200">Vazgeç</button>;

/**
 * Tahsilat (cariden para girişi) veya ödeme (cariye para çıkışı). Kayıttan sonra makbuz yazdırılabilir.
 */
export const PaymentModal = ({ partner, direction: initial, onClose, onSaved }) => {
  const account = partner.currency || 'TRY';
  const [form, setForm] = useState({ direction: initial, method: 'CASH', amount: '', date: today(), bankName: '', reference: '', dueDate: '', note: '', currency: account, rate: partner.summary?.fx?.rate || '' });
  // Dövizli caride ödeme TL veya cari dövizinde alınabilir; cariye kurla çevrilerek işlenir
  const r = parseFloat(String(form.rate).replace(',', '.')) || 0;
  const amt = parseFloat(form.amount) || 0;
  const posted = account === 'TRY' ? null : form.currency === 'TRY' ? (r ? amt / r : null) : amt;
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const inbound = form.direction === 'IN';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/partners/${partner.id}/payments`, form);
      setSaved(res.data);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Kaydedilemedi.'));
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <Modal title={inbound ? 'Tahsilat kaydedildi' : 'Ödeme kaydedildi'} onClose={onClose}
        footer={<>
          {cancelBtn(onClose)}
          <a href={`/print/receipt/${saved.payment.id}`} target="_blank" rel="noreferrer" className="btn-gradient"><Printer className="h-4 w-4 mr-2" /> Makbuzu Yazdır</a>
        </>}>
        <p className="text-sm text-gray-700">{saved.message}</p>
      </Modal>
    );
  }

  return (
    <Modal as="form" onSubmit={submit} title={`${inbound ? 'Tahsilat al' : 'Ödeme yap'} · ${partner.name}`} onClose={onClose}
      footer={<>{cancelBtn(onClose)}<button disabled={busy} className="btn-gradient disabled:opacity-50">Kaydet</button></>}>
      <Segmented size="sm" value={form.direction} onChange={(direction) => setForm({ ...form, direction })}
        options={[{ value: 'IN', label: 'Tahsilat (para girişi)' }, { value: 'OUT', label: 'Ödeme (para çıkışı)' }]} />
      {account !== 'TRY' && (
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-indigo-50/60 p-3">
          <Field label="Ödenen para">
            <Segmented size="sm" value={form.currency} onChange={(currency) => setForm({ ...form, currency })} options={[{ value: account, label: account }, { value: 'TRY', label: 'TL' }]} />
          </Field>
          <Field label={`Kur (1 ${account} = ? TL)`} hint="Varsayılan: güncel TCMB satış kuru">
            <input type="number" min="0" step="0.0001" className="premium-input !bg-white" value={form.rate} onChange={set('rate')} />
          </Field>
          {posted !== null && amt > 0 && <p className="col-span-2 text-xs font-bold text-indigo-800">Cariye işlenecek: {formatMoney(posted, account)}{form.currency === account && r ? ` (TL karşılığı ${formatMoney(amt * r, 'TRY')})` : ''}</p>}
        </div>
      )}
      <Field label="Yöntem">
        <Segmented size="sm" value={form.method} onChange={(method) => setForm({ ...form, method })}
          options={['CASH', 'WIRE_TRANSFER', 'CARD', 'CHECK', 'NOTE'].map((m) => ({ value: m, label: PAYMENT_METHODS[m] }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Tutar (${form.currency === 'TRY' ? '₺' : form.currency})`} required><input required autoFocus type="number" min="0.01" step="0.01" className="premium-input" value={form.amount} onChange={set('amount')} /></Field>
        <Field label="Tarih"><input type="date" max={today()} className="premium-input" value={form.date} onChange={set('date')} /></Field>
        {['WIRE_TRANSFER', 'CHECK', 'CARD'].includes(form.method) && <Field label="Banka"><input className="premium-input" value={form.bankName} onChange={set('bankName')} /></Field>}
        <Field label={['CHECK', 'NOTE'].includes(form.method) ? 'Çek / senet no' : 'Belge / dekont no'}><input className="premium-input" value={form.reference} onChange={set('reference')} /></Field>
        {['CHECK', 'NOTE'].includes(form.method) && <Field label="Vade tarihi" required><input required type="date" className="premium-input" value={form.dueDate} onChange={set('dueDate')} /></Field>}
      </div>
      <Field label="Açıklama"><input className="premium-input" value={form.note} onChange={set('note')} placeholder="İsteğe bağlı" /></Field>
      <p className="text-[11px] text-gray-400">{inbound ? 'Tahsilat cariyi alacaklandırır (borcu düşer).' : 'Ödeme cariyi borçlandırır (tedarikçiye olan borcumuz düşer).'} Yanlış kayıt, hareketler sekmesinden ters kayıtla düzeltilir.</p>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </Modal>
  );
};

// Manuel borç / alacak (fatura, masraf, alış faturası…)
export const TransactionModal = ({ partner, onClose, onSaved }) => {
  const types = transactionTypes(partner.kind);
  const account = partner.currency || 'TRY';
  const [form, setForm] = useState({ type: types[0].id, amount: '', description: '', rate: partner.summary?.fx?.rate || '' });
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/finance/transaction', { companyId: partner.id, ...form });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Hareket kaydedilemedi.'));
    }
  };
  return (
    <Modal as="form" onSubmit={submit} title={`Borç / alacak kaydı · ${partner.name}`} onClose={onClose} size="max-w-md"
      footer={<>{cancelBtn(onClose)}<button className="btn-gradient">Kaydet</button></>}>
      <div className="grid grid-cols-2 gap-2">
        {types.map((t) => (
          <button type="button" key={t.id} onClick={() => setForm({ ...form, type: t.id })}
            className={`text-left rounded-xl p-3 ring-1 ${form.type === t.id ? 'ring-2 ring-indigo-400 bg-indigo-50/60' : 'ring-gray-100'}`}>
            <span className="block text-xs font-black text-gray-900">{t.label}</span>
            <span className="block text-[10px] text-gray-400">{t.desc}</span>
          </button>
        ))}
      </div>
      <div className={account === 'TRY' ? '' : 'grid grid-cols-2 gap-3'}>
        <Field label={`Tutar (${account === 'TRY' ? '₺' : account})`} required><input required type="number" min="0.01" step="0.01" className="premium-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
        {account !== 'TRY' && <Field label={`Kur (1 ${account} = ? TL)`} hint="TL karşılığı için"><input type="number" min="0" step="0.0001" className="premium-input" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></Field>}
      </div>
      <Field label="Açıklama"><input className="premium-input" placeholder="Örn: 2026/154 nolu fatura" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <p className="text-[11px] text-gray-400">Para girişi / çıkışı için “Tahsilat al” veya “Ödeme yap” kullanın (makbuz kesilir).</p>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </Modal>
  );
};

// Ekstre bağlantısı: e-postayla gönderme veya bağlantıyı kopyalama; cari mutabakat verir ya da itiraz eder
export const StatementLinkModal = ({ partner, onClose, onSaved }) => {
  const [form, setForm] = useState({ send: Boolean(partner.email || partner.contacts?.some((c) => c.email)), to: '', message: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/partners/${partner.id}/statement-link`, form);
      setResult(res.data);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Oluşturulamadı.'));
    } finally {
      setBusy(false);
    }
  };
  const defaults = [partner.email, ...(partner.contacts || []).map((c) => c.email)].filter(Boolean);

  if (result) {
    return (
      <Modal title="Ekstre bağlantısı" onClose={onClose} footer={cancelBtn(onClose)}>
        <p className={`text-sm font-bold ${result.total && result.delivered < result.total ? 'text-amber-700' : 'text-emerald-700'}`}>{result.message}</p>
        <div className="flex gap-2">
          <input readOnly className="premium-input font-mono text-xs" value={result.url} onFocus={(e) => e.target.select()} />
          <button type="button" onClick={() => navigator.clipboard?.writeText(result.url)} className="flex items-center px-3 rounded-xl text-xs font-black text-indigo-700 bg-indigo-50 shrink-0"><Copy className="h-4 w-4 mr-1" /> Kopyala</button>
        </div>
        <p className="text-[11px] text-gray-400">Cari bu bağlantıdan ekstresini görür; “Mutabıkız” derse mutabakat kaydı oluşur, itiraz ederse size bildirim gelir. Bağlantı 30 gün geçerlidir.</p>
      </Modal>
    );
  }

  return (
    <Modal as="form" onSubmit={submit} title={`Ekstre ve mutabakat isteği · ${partner.name}`} onClose={onClose}
      footer={<>{cancelBtn(onClose)}<button disabled={busy} className="btn-gradient disabled:opacity-50"><Mail className="h-4 w-4 mr-2" /> {form.send ? 'Gönder' : 'Bağlantı oluştur'}</button></>}>
      <label className="flex items-center gap-3 text-sm font-bold text-gray-700"><Toggle checked={form.send} onChange={(send) => setForm({ ...form, send })} /> E-postayla gönder</label>
      {form.send && (
        <>
          <Field label="Alıcılar" hint={defaults.length ? `Boş bırakılırsa: ${defaults.slice(0, 3).join(', ')}` : 'Carinin kayıtlı e-postası yok; adres yazın.'}>
            <input className="premium-input" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="ornek@firma.com, muhasebe@firma.com" />
          </Field>
          <Field label="Mesaj (isteğe bağlı)"><textarea className="premium-input h-20 resize-none" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
        </>
      )}
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </Modal>
  );
};

// Portal dışı müşteriyi bayiye dönüştürme (portal girişi açılır)
export const ConvertModal = ({ partner, onClose, onSaved }) => {
  const [form, setForm] = useState({ email: partner.email || partner.contacts?.find((c) => c.email)?.email || '', name: partner.contacts?.[0]?.name || '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post(`/partners/${partner.id}/convert-to-dealer`, form);
      onSaved(res.data.message);
    } catch (err) {
      setError(errorMessage(err, 'Dönüştürülemedi.'));
      setBusy(false);
    }
  };
  return (
    <Modal as="form" onSubmit={submit} title={`Bayiye dönüştür · ${partner.name}`} onClose={onClose}
      footer={<>{cancelBtn(onClose)}<button disabled={busy} className="btn-gradient disabled:opacity-50">Bayiye Dönüştür</button></>}>
      <p className="text-xs text-gray-500">Müşteri portala giriş yapabilen bayi olur. Bakiye, hareketler, teklifler ve siparişler aynen korunur. Bayi paket limitinize sayılır; iskonto ve risk ayarlarını sonra Bayi Yönetimi'nden yapabilirsiniz.</p>
      <Field label="Portal giriş e-postası" required><input required type="email" className="premium-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      <Field label="Kullanıcı adı soyadı"><input className="premium-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={partner.name} /></Field>
      <Field label="Şifre" hint="Boş bırakılırsa güçlü bir şifre üretilip e-postayla gönderilir."><input type="password" minLength={8} className="premium-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </Modal>
  );
};
