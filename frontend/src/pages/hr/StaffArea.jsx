import { useEffect, useMemo, useState } from 'react';
import { UserRound, CalendarDays, Receipt, Target, Megaphone, Plus, X, CalendarPlus, Camera, Clock, Wallet } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import PageHeader from '../../components/shared/PageHeader';
import FilterTabs from '../../components/shared/FilterTabs';
import EmptyState from '../../components/shared/EmptyState';
import Modal from '../../components/shared/Modal';
import { Field, Segmented } from '../../components/form/FormKit';
import { formatDate, formatTRY } from '../../utils/format';
import { LEAVE_TYPES, CLAIM_TYPES, BASES, claimState, monthLabel, today } from '../../components/hr/hrMeta';
import { StatusPill, DecisionNote, PaymentNote, FileLink, Pending, ListCard, Row } from '../../components/hr/HrUi';

// İki gün arası iş günü (hafta sonu hariç); sunucu da aynı kuralla hesaplar
const workdays = (a, b) => {
  if (!a || !b || b < a) return 0;
  let n = 0;
  for (let d = new Date(`${a}T00:00:00`); d <= new Date(`${b}T00:00:00`); d.setDate(d.getDate() + 1)) if (d.getDay() % 6 !== 0) n++;
  return n;
};

const LeaveModal = ({ onClose, onSaved, showAlert }) => {
  const [form, setForm] = useState({ type: 'ANNUAL', startDate: today(), endDate: today(), note: '' });
  const [busy, setBusy] = useState(false);
  const days = workdays(form.startDate, form.endDate);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onSaved((await api.post('/hr/me/leaves', form)).data.message);
    } catch (err) {
      showAlert({ type: 'error', title: 'Talep iletilemedi', message: errorMessage(err, 'İzin talebi oluşturulamadı.') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal as="form" onSubmit={submit} icon={CalendarPlus} title="İzin talebi" subtitle="Yetkili onaylayınca ya da reddedince bildirim alırsınız." onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button><button disabled={busy || days === 0} className="btn-gradient disabled:opacity-50">Talep gönder</button></>}>
      <Field label="İzin türü" required>
        <Segmented size="sm" value={form.type} onChange={(type) => setForm({ ...form, type })} options={Object.entries(LEAVE_TYPES).map(([value, label]) => ({ value, label }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Başlangıç" required><input type="date" required className="premium-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })} aria-label="Başlangıç" /></Field>
        <Field label="Bitiş" required><input type="date" required min={form.startDate} className="premium-input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} aria-label="Bitiş" /></Field>
      </div>
      <p className={`text-xs font-bold rounded-xl p-3 ${days ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'}`}>{days ? `${days} iş günü (hafta sonları sayılmaz; resmî tatiller ayrıca düşülmez)` : 'Seçilen aralıkta iş günü yok.'}</p>
      <Field label="Açıklama"><textarea maxLength={500} rows={2} className="premium-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="İsteğe bağlı" aria-label="Açıklama" /></Field>
    </Modal>
  );
};

const ClaimModal = ({ onClose, onSaved, showAlert }) => {
  const [form, setForm] = useState({ type: 'EXPENSE', amount: '', date: today(), description: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('file', file);
      onSaved((await api.post('/hr/me/claims', fd)).data.message);
    } catch (err) {
      showAlert({ type: 'error', title: 'Talep iletilemedi', message: errorMessage(err, 'Talep oluşturulamadı.') });
    } finally {
      setBusy(false);
    }
  };
  const expense = form.type === 'EXPENSE';
  return (
    <Modal as="form" onSubmit={submit} icon={Receipt} title="Masraf / avans talebi" subtitle="Onay ile ödeme ayrıdır: onaylanan talep, ödeme yapılınca ödendi olur." onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button><button disabled={busy} className="btn-gradient disabled:opacity-50">{busy ? 'Gönderiliyor...' : 'Talep gönder'}</button></>}>
      <Field label="Tür" required>
        <Segmented value={form.type} onChange={(type) => setForm({ ...form, type })} options={[{ value: 'EXPENSE', label: 'Masraf' }, { value: 'ADVANCE', label: 'Avans' }]} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tutar (₺)" required><input required inputMode="decimal" className="premium-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" aria-label="Tutar" /></Field>
        <Field label={expense ? 'Masraf tarihi' : 'Tarih'} required><input type="date" required max={expense ? today() : undefined} className="premium-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Tarih" /></Field>
      </div>
      <Field label="Açıklama" required><textarea required minLength={3} maxLength={500} rows={2} className="premium-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={expense ? 'Yakıt, yemek, konaklama…' : 'Avansın amacı'} aria-label="Açıklama" /></Field>
      {expense && (
        <Field label="Fiş / fatura" hint="PDF ya da fotoğraf (en fazla 10 MB). Telefonda kamerayla çekebilirsiniz.">
          <label className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 p-3 cursor-pointer hover:bg-gray-50">
            <Camera className="h-5 w-5 text-gray-400 shrink-0" />
            <span className="text-sm font-semibold text-gray-600 truncate flex-1">{file ? file.name : 'Dosya seç ya da fotoğraf çek'}</span>
            {file && <button type="button" onClick={(e) => { e.preventDefault(); setFile(null); }} className="text-gray-400 hover:text-red-600" aria-label="Dosyayı kaldır"><X className="h-4 w-4" /></button>}
            <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} aria-label="Fiş / fatura" />
          </label>
        </Field>
      )}
    </Modal>
  );
};

const Stat = ({ icon: Icon, label, value, sub }) => (
  <div className="bg-white rounded-2xl border border-gray-100 p-4">
    <p className="flex items-center gap-1.5 text-xs font-bold text-gray-500"><Icon className="h-4 w-4 text-brand-500" /> {label}</p>
    <p className="mt-1.5 text-xl font-black text-gray-900 tabular-nums">{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
  </div>
);

/**
 * Personel Alanım: kendi kartı, izin ve masraf / avans talepleri, hedef ve primleri, şirket duyuruları.
 * Yönetim panelinde (/admin/personel-alanim) ve plasiyer panelinde (/plasiyer/personel) aynı ekran.
 */
const StaffArea = ({ header = true }) => {
  const { alertElement, showAlert, confirm } = useAlert();
  const [me, setMe] = useState(null);
  const [noCard, setNoCard] = useState(false);
  const [tab, setTab] = useState('leaves');
  const [leaves, setLeaves] = useState([]);
  const [claims, setClaims] = useState([]);
  const [targets, setTargets] = useState([]);
  const [news, setNews] = useState([]);
  const [modal, setModal] = useState(null);

  const load = () => {
    api.get('/hr/me/announcements').then((r) => setNews(r.data)).catch(() => {});
    api.get('/hr/me').then((r) => {
      setMe(r.data);
      return Promise.all([api.get('/hr/me/leaves'), api.get('/hr/me/claims'), api.get('/hr/me/targets')]);
    }).then(([l, c, t]) => { setLeaves(l.data); setClaims(c.data); setTargets(t.data); })
      .catch((err) => { if (err.response?.data?.code === 'NO_EMPLOYEE') setNoCard(true); });
  };
  useEffect(() => { load(); }, []);

  const saved = (msg) => { setModal(null); load(); showAlert({ type: 'success', title: 'Talebiniz iletildi', message: msg }); };
  const cancel = async (kind, item) => {
    if (!(await confirm({ title: 'Talep iptal edilsin mi?', message: kind === 'leaves' ? `${LEAVE_TYPES[item.type]}, ${formatDate(item.startDate)} – ${formatDate(item.endDate)}` : `${CLAIM_TYPES[item.type]} ${formatTRY(item.amount)}`, confirmText: 'İptal et' }))) return;
    api.post(`/hr/me/${kind}/${item.id}/cancel`).then(() => load()).catch((err) => showAlert({ type: 'error', title: 'İptal edilemedi', message: errorMessage(err, 'Talep iptal edilemedi.') }));
  };

  const usedDays = useMemo(() => Object.values(me?.leaveDays?.byType || {}).reduce((s, n) => s + n, 0), [me]);
  const e = me?.employee;
  const tabs = [
    { id: 'leaves', label: 'İzinlerim', icon: CalendarDays, count: leaves.length },
    { id: 'claims', label: 'Masraf ve avans', icon: Receipt, count: claims.length },
    { id: 'targets', label: 'Hedef ve prim', icon: Target, count: targets.length },
    { id: 'news', label: 'Duyurular', icon: Megaphone, count: news.length }
  ];

  const announcements = news.length === 0 ? <EmptyState icon={Megaphone}>Duyuru yok.</EmptyState> : (
    <ListCard>
      {news.map((a) => (
        <Row key={a.id}>
          <p className="font-bold text-gray-900">{a.title}</p>
          <p className="text-sm text-gray-600 whitespace-pre-line break-words mt-1">{a.body}</p>
          <p className="text-xs text-gray-400 mt-2">{a.departments.length ? a.departments.join(', ') : 'Tüm personel'} · {a.createdByName} · {formatDate(a.createdAt, true)}</p>
        </Row>
      ))}
    </ListCard>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {alertElement}
      {modal === 'leave' && <LeaveModal showAlert={showAlert} onClose={() => setModal(null)} onSaved={saved} />}
      {modal === 'claim' && <ClaimModal showAlert={showAlert} onClose={() => setModal(null)} onSaved={saved} />}
      {header && <PageHeader icon={UserRound} title="Personel Alanım" subtitle="İzin, masraf ve avans taleplerin, hedef ve primlerin, şirket duyuruları." />}

      {noCard ? (
        <>
          <EmptyState icon={UserRound}>Personel kartınız yok. İzin ve masraf talebi açabilmeniz için personel yetkilisinin sizin için kart açıp hesabınızı bağlaması gerekir.</EmptyState>
          {news.length > 0 && <><h2 className="text-sm font-black text-gray-900">Duyurular</h2>{announcements}</>}
        </>
      ) : e && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="h-12 w-12 shrink-0 rounded-2xl bg-navy-900 text-white text-sm font-black flex items-center justify-center">{e.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr')}</span>
              <div className="min-w-0">
                <p className="font-black text-gray-900 truncate">{e.name}{!e.isActive && <span className="ml-2 text-xs font-bold text-gray-500">Pasif</span>}</p>
                <p className="text-xs text-gray-500 truncate">{[e.title, e.department].filter(Boolean).join(' · ') || '—'}{e.hireDate ? ` · İşe giriş ${formatDate(e.hireDate)}` : ''}</p>
              </div>
            </div>
            {e.isActive && (
              <div className="grid grid-cols-2 sm:flex gap-2">
                <button type="button" onClick={() => setModal('leave')} className="h-11 px-4 rounded-xl ring-1 ring-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 inline-flex items-center justify-center gap-1.5"><CalendarPlus className="h-4 w-4" /> İzin talebi</button>
                <button type="button" onClick={() => setModal('claim')} className="btn-gradient !py-0 !px-4 h-11 whitespace-nowrap"><Plus className="h-4 w-4 mr-1 shrink-0" /> Masraf / avans</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat icon={CalendarDays} label={`${me.leaveDays.year} izin`} value={`${usedDays} gün`} sub={Object.entries(me.leaveDays.byType).map(([k, v]) => `${LEAVE_TYPES[k]} ${v}`).join(' · ') || 'Onaylı izin yok'} />
            <Stat icon={Clock} label="Bekleyen talep" value={me.pending.leaves + me.pending.claims} sub={`${me.pending.leaves} izin · ${me.pending.claims} masraf / avans`} />
            <Stat icon={Wallet} label="Ödeme bekleyen" value={formatTRY(me.awaitingPayment)} sub="Onaylı, ödenmemiş" />
            <Stat icon={Target} label="Bu ay hedef" value={targets[0] && targets[0].status === 'OPEN' ? `%${targets[0].percent}` : '—'} sub={targets[0] && targets[0].status === 'OPEN' ? monthLabel(targets[0].period) : 'Açık hedef yok'} />
          </div>

          <FilterTabs value={tab} onChange={setTab} tabs={tabs} />

          {tab === 'leaves' && (leaves.length === 0 ? <EmptyState icon={CalendarDays}>Henüz izin talebiniz yok.</EmptyState> : (
            <ListCard>
              {leaves.map((l) => (
                <Row key={l.id}>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-bold text-gray-900">{LEAVE_TYPES[l.type]} · {l.days} iş günü</p>
                      <p className="text-xs text-gray-600">{formatDate(l.startDate)} – {formatDate(l.endDate)}</p>
                      {l.note && <p className="text-xs text-gray-500 break-words">“{l.note}”</p>}
                      {l.status === 'PENDING' ? <Pending>Yetkilinin kararı bekleniyor</Pending> : <DecisionNote item={l} />}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill status={l.status} />
                      {l.status === 'PENDING' && <button type="button" onClick={() => cancel('leaves', l)} className="h-8 px-3 rounded-lg ring-1 ring-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50">İptal et</button>}
                    </div>
                  </div>
                </Row>
              ))}
            </ListCard>
          ))}

          {tab === 'claims' && (claims.length === 0 ? <EmptyState icon={Receipt}>Henüz masraf ya da avans talebiniz yok.</EmptyState> : (
            <ListCard>
              {claims.map((c) => {
                const state = claimState(c);
                return (
                  <Row key={c.id}>
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="font-bold text-gray-900"><span className="text-gray-500 font-semibold">{CLAIM_TYPES[c.type]}</span> · <span className="tabular-nums">{formatTRY(c.amount)}</span></p>
                        <p className="text-xs text-gray-600 break-words">{formatDate(c.date)} · {c.description}</p>
                        <FileLink claim={c} />
                        {c.status === 'PENDING' ? <Pending>Onay bekleniyor</Pending> : <DecisionNote item={c} />}
                        {state === 'TO_PAY' && <Pending>Onaylandı, ödeme bekleniyor</Pending>}
                        <PaymentNote item={c} />
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill status={state} />
                        {c.status === 'PENDING' && <button type="button" onClick={() => cancel('claims', c)} className="h-8 px-3 rounded-lg ring-1 ring-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50">İptal et</button>}
                      </div>
                    </div>
                  </Row>
                );
              })}
            </ListCard>
          ))}

          {tab === 'targets' && (targets.length === 0 ? <EmptyState icon={Target}>Size tanımlı satış hedefi yok.</EmptyState> : (
            <ListCard>
              {targets.map((t) => (
                <Row key={t.id}>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] md:items-center">
                    <div>
                      <p className="font-bold text-gray-900 capitalize">{monthLabel(t.period)}</p>
                      <p className="text-xs text-gray-500">{BASES[t.basis]?.label} hedefi {formatTRY(t.targetAmount)} · %{t.bonusRate} prim</p>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold"><span className="text-gray-600 tabular-nums">{formatTRY(t.achieved)}</span><span className={t.percent >= 100 ? 'text-emerald-600' : 'text-gray-500'}>%{t.percent}</span></div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full rounded-full ${t.percent >= 100 ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, t.percent)}%` }} /></div>
                      {t.status === 'OPEN' && t.achieved < t.targetAmount && <p className="text-[11px] text-gray-400">Hedefe {formatTRY(t.targetAmount - t.achieved)} kaldı</p>}
                    </div>
                    <div className="text-xs space-y-0.5">
                      <div className="flex items-center gap-2"><StatusPill status={t.paidAt ? 'PAID' : t.status} /></div>
                      <p className="text-gray-600">Hesaplanan: <b className="text-gray-900 tabular-nums">{formatTRY(t.calculatedBonus)}</b>{t.status === 'OPEN' && <span className="text-gray-400"> (ay sonunda kesinleşir)</span>}</p>
                      <p className="text-gray-600">Ödenen: <b className={`tabular-nums ${t.paidBonus ? 'text-emerald-700' : 'text-gray-400'}`}>{formatTRY(t.paidBonus)}</b></p>
                    </div>
                  </div>
                </Row>
              ))}
            </ListCard>
          ))}

          {tab === 'news' && announcements}
        </>
      )}
    </div>
  );
};

export default StaffArea;
