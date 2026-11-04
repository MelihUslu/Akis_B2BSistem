import { useEffect, useState } from 'react';
import { Target, Plus, ChevronLeft, ChevronRight, Lock, Banknote, Trash2, Pencil, Undo2, Info } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import Modal from '../shared/Modal';
import EmptyState from '../shared/EmptyState';
import { Field, Segmented } from '../form/FormKit';
import { formatTRY, formatDate } from '../../utils/format';
import { BASES, monthLabel, thisMonth, shiftMonth } from './hrMeta';
import { StatusPill, PaymentNote, PayModal, ListCard, Row } from './HrUi';

// Hedef tanımı / düzenleme. Gerçekleşen, siparişlerden (ya da tahsilattan) otomatik hesaplanır.
const TargetModal = ({ initial, period, onClose, onSaved, showAlert }) => {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(() => ({ employeeId: '', period, targetAmount: '', bonusRate: '3', basis: 'SALES', ...initial }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  useEffect(() => {
    if (!initial?.id) api.get('/hr/employees', { params: { status: 'active' } }).then((r) => setEmployees(r.data.filter((e) => e.userId))).catch(() => {});
  }, [initial?.id]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = form.id ? await api.put(`/hr/targets/${form.id}`, form) : await api.post('/hr/targets', form);
      onSaved(res.data.message);
    } catch (err) {
      showAlert({ type: 'error', title: 'Kaydedilemedi', message: errorMessage(err, 'Hedef kaydedilemedi.') });
    } finally {
      setBusy(false);
    }
  };
  const bonus = (parseFloat(form.targetAmount) || 0) * (parseFloat(form.bonusRate) || 0) / 100;
  return (
    <Modal as="form" onSubmit={submit} icon={Target} title={form.id ? 'Hedefi düzenle' : 'Yeni satış hedefi'} subtitle={monthLabel(form.period)} onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button><button disabled={busy} className="btn-gradient disabled:opacity-50">Kaydet</button></>}>
      {form.id ? <p className="text-sm font-bold text-gray-900">{initial.employee?.name}</p> : (
        <Field label="Personel" required hint="Yalnızca kullanıcı hesabı bağlı personel: satışlar hesabın sorumlu olduğu bayilerden ve bayi adına girdiği siparişlerden hesaplanır.">
          <select required className="premium-input" value={form.employeeId} onChange={set('employeeId')} aria-label="Personel">
            <option value="">Personel seçin</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.department ? ` · ${e.department}` : ''}</option>)}
          </select>
        </Field>
      )}
      {!form.id && (
        <Field label="Ay" required>
          <input type="month" required min={thisMonth()} className="premium-input" value={form.period} onChange={set('period')} aria-label="Ay" />
        </Field>
      )}
      <Field label="Prim neye bağlı?" required hint={BASES[form.basis]?.hint}>
        <Segmented value={form.basis} onChange={(basis) => setForm({ ...form, basis })} options={Object.entries(BASES).map(([value, b]) => ({ value, label: b.label }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Hedef (${form.basis === 'SALES' ? 'KDV hariç ' : ''}₺)`} required><input type="number" min="1" step="1" required className="premium-input" value={form.targetAmount} onChange={set('targetAmount')} aria-label="Hedef tutarı" /></Field>
        <Field label="Prim oranı (%)" required><input type="number" min="0.1" max="50" step="0.1" required className="premium-input" value={form.bonusRate} onChange={set('bonusRate')} aria-label="Prim oranı" /></Field>
      </div>
      {bonus > 0 && <p className="text-xs font-bold text-emerald-700 bg-emerald-50 rounded-xl p-3">Hedef tam tutarsa en az {formatTRY(bonus)} prim hesaplanır (hedefi aşan tutarın da yüzdesi eklenir). Hedefin altında prim yoktur.</p>}
    </Modal>
  );
};

const Progress = ({ percent }) => (
  <div className="h-2 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={Math.min(100, percent)} aria-valuemin={0} aria-valuemax={100}>
    <div className={`h-full rounded-full ${percent >= 100 ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, percent)}%` }} />
  </div>
);

/**
 * Aylık satış hedefi ve prim. Ay bitince dönem kapatılır (prim sabitlenir); ödeme Finans yetkisiyle ayrıca kaydedilir.
 * Hesaplanan ve ödenen prim ayrı sütunlardadır.
 */
const TargetsTab = ({ showAlert, confirm, onChanged, me }) => {
  const [period, setPeriod] = useState(thisMonth);
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const load = () => api.get('/hr/targets', { params: { period } }).then((r) => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => { load(); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (msg) => { load(); onChanged?.(); showAlert({ type: 'success', title: 'Kaydedildi', message: msg }); };
  const fail = (title, fallback) => (err) => showAlert({ type: 'error', title, message: errorMessage(err, fallback) });

  const close = async (t) => {
    const ok = await confirm({
      type: t.calculatedBonus > 0 ? 'info' : 'warning',
      title: 'Dönem kapatılsın mı?',
      message: `${t.employee.name} · ${monthLabel(t.period)}: gerçekleşen ${formatTRY(t.achieved)} / hedef ${formatTRY(t.targetAmount)}. ${t.calculatedBonus > 0 ? `Hesaplanan prim ${formatTRY(t.calculatedBonus)} sabitlenir; ödeme ayrıca kaydedilir.` : 'Hedef tutmadı; prim hesaplanmaz.'} Kapandıktan sonra gelen iadeler bu ayı değiştirmez.`,
      confirmText: 'Dönemi kapat'
    });
    if (ok) api.post(`/hr/targets/${t.id}/close`).then((r) => done(r.data.message)).catch(fail('Kapatılamadı', 'Dönem kapatılamadı.'));
  };
  const remove = async (t) => {
    if (await confirm({ title: 'Hedef silinsin mi?', message: `${t.employee.name} · ${monthLabel(t.period)}`, confirmText: 'Sil' })) {
      api.delete(`/hr/targets/${t.id}`).then((r) => done(r.data.message)).catch(fail('Silinemedi', 'Hedef silinemedi.'));
    }
  };
  const pay = (form) => api.post(`/hr/targets/${paying.id}/pay`, form).then((r) => { setPaying(null); done(r.data.message); }).catch(fail('Ödeme kaydedilemedi', 'Prim ödemesi kaydedilemedi.'));
  const unpay = async (t) => {
    if (await confirm({ title: 'Prim ödemesi geri alınsın mı?', message: `${t.employee.name}: ${formatTRY(t.paidBonus)}. Gelir-Gider'deki kayıt silinir.`, confirmText: 'Geri al' })) {
      api.post(`/hr/targets/${t.id}/unpay`).then((r) => done(r.data.message)).catch(fail('Geri alınamadı', 'Ödeme geri alınamadı.'));
    }
  };

  const total = (k) => (rows || []).reduce((s, t) => s + (t[k] || 0), 0);
  return (
    <div className="space-y-4">
      {editing && <TargetModal initial={editing} period={period} showAlert={showAlert} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); done(m); }} />}
      {paying && <PayModal title={`Prim ödemesi · ${paying.employee.name}`} amount={paying.calculatedBonus} category="Personel primi" onClose={() => setPaying(null)} onSubmit={pay} />}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="inline-flex items-center gap-1 bg-white rounded-2xl ring-1 ring-gray-100 p-1 self-start">
          <button type="button" onClick={() => setPeriod(shiftMonth(period, -1))} className="h-10 w-10 rounded-xl hover:bg-gray-50 flex items-center justify-center" aria-label="Önceki ay"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[9rem] text-center text-sm font-black text-gray-900 capitalize">{monthLabel(period)}</span>
          <button type="button" onClick={() => setPeriod(shiftMonth(period, 1))} className="h-10 w-10 rounded-xl hover:bg-gray-50 flex items-center justify-center" aria-label="Sonraki ay"><ChevronRight className="h-4 w-4" /></button>
        </div>
        {rows?.length > 0 && <p className="text-sm text-gray-600">Hesaplanan <b className="text-gray-900 tabular-nums">{formatTRY(total('calculatedBonus'))}</b> · Ödenen <b className="text-emerald-700 tabular-nums">{formatTRY(total('paidBonus'))}</b></p>}
        {me?.canManage && period >= thisMonth() && <button type="button" onClick={() => setEditing({})} className="btn-gradient sm:ml-auto"><Plus className="h-4 w-4 mr-1.5" /> Yeni hedef</button>}
      </div>
      <p className="text-xs text-gray-500 flex items-start gap-1.5"><Info className="h-4 w-4 shrink-0 text-gray-400" /> Satış: ayda onaylanan siparişler (KDV hariç, kupon düşülmüş, kargo hariç), iptaller sayılmaz, iadeler düşülür. Tahsilat: sorumlu olunan bayilerden ayda alınan ödemeler. Ay bitince dönem kapatılır, prim sabitlenir; ödeme ayrıca kaydedilir. Sipariş başına plasiyer primi (Ayarlar) bundan ayrıdır.</p>
      {rows && rows.length === 0 ? (
        <EmptyState icon={Target}>{monthLabel(period)} için hedef yok.</EmptyState>
      ) : (
        <ListCard>
          {(rows || []).map((t) => (
            <Row key={t.id}>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{t.employee.name}</p>
                  <p className="text-xs text-gray-500">{BASES[t.basis]?.label} · %{t.bonusRate} prim · hedef {formatTRY(t.targetAmount)}</p>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex justify-between text-xs font-bold"><span className="text-gray-600 tabular-nums">{formatTRY(t.achieved)}</span><span className={t.percent >= 100 ? 'text-emerald-600' : 'text-gray-500'}>%{t.percent}</span></div>
                  <Progress percent={t.percent} />
                </div>
                <div className="text-xs space-y-0.5">
                  <p className="text-gray-600">Hesaplanan prim: <b className="text-gray-900 tabular-nums">{formatTRY(t.calculatedBonus)}</b>{t.status === 'OPEN' && <span className="text-gray-400"> (anlık)</span>}</p>
                  <p className="text-gray-600">Ödenen prim: <b className={`tabular-nums ${t.paidBonus ? 'text-emerald-700' : 'text-gray-400'}`}>{formatTRY(t.paidBonus)}</b></p>
                  {t.closedAt && <p className="text-gray-400">Kapatan: {t.closedByName} · {formatDate(t.closedAt)}</p>}
                  <PaymentNote item={t} />
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <StatusPill status={t.paidAt ? 'PAID' : t.status} />
                  {t.status === 'OPEN' && me?.canManage && <>
                    <button type="button" onClick={() => setEditing(t)} className="h-9 w-9 rounded-xl ring-1 ring-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center" aria-label="Hedefi düzenle" title="Düzenle"><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => remove(t)} className="h-9 w-9 rounded-xl ring-1 ring-gray-200 text-gray-500 hover:text-red-600 hover:bg-red-50 flex items-center justify-center" aria-label="Hedefi sil" title="Sil"><Trash2 className="h-4 w-4" /></button>
                    {t.ended && <button type="button" onClick={() => close(t)} className="h-9 px-3 rounded-xl bg-navy-900 text-white text-xs font-bold inline-flex items-center gap-1 hover:bg-navy-950"><Lock className="h-4 w-4" /> Dönemi kapat</button>}
                  </>}
                  {t.status === 'CLOSED' && !t.paidAt && t.calculatedBonus > 0 && me?.canPay && (
                    <button type="button" onClick={() => setPaying(t)} className="h-9 px-3 rounded-xl bg-navy-900 text-white text-xs font-bold inline-flex items-center gap-1 hover:bg-navy-950"><Banknote className="h-4 w-4" /> Primi öde</button>
                  )}
                  {t.paidAt && me?.canPay && (
                    <button type="button" onClick={() => unpay(t)} className="h-9 px-3 rounded-xl ring-1 ring-gray-200 text-gray-600 text-xs font-bold inline-flex items-center gap-1 hover:bg-gray-50"><Undo2 className="h-4 w-4" /> Geri al</button>
                  )}
                </div>
              </div>
            </Row>
          ))}
        </ListCard>
      )}
    </div>
  );
};

export default TargetsTab;
