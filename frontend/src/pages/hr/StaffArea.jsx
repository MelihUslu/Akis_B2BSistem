import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserRound, CalendarDays, Receipt, Target, Megaphone, Plus, X, CalendarPlus, Camera, Clock, Wallet, Palmtree, Users } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import PageHeader from '../../components/shared/PageHeader';
import FilterTabs from '../../components/shared/FilterTabs';
import EmptyState from '../../components/shared/EmptyState';
import Modal from '../../components/shared/Modal';
import { Field, Segmented } from '../../components/form/FormKit';
import { formatDate, formatTRY } from '../../utils/format';
import { LEAVE_TYPES, CLAIM_TYPES, BASES, HALF, days as dayText, claimState, targetState, monthLabel, today } from '../../components/hr/hrMeta';
import { StatusPill, DecisionNote, Payments, FileLink, Pending, ListCard, Row } from '../../components/hr/HrUi';
import TeamPanel from '../../components/hr/TeamPanel';

// İzin talebi: gün sayısı sunucuda firmanın kurallarıyla (Cumartesi, resmî ve firma tatilleri, yarım gün) hesaplanır
const LeaveModal = ({ onClose, onSaved, showAlert }) => {
  const [form, setForm] = useState({ type: 'ANNUAL', startDate: today(), endDate: today(), half: '', note: '' });
  const [preview, setPreview] = useState(null); // { key, days, holidays, balance, exceeds, allowNegative }
  const [busy, setBusy] = useState(false);
  const single = form.startDate === form.endDate;
  const query = { type: form.type, startDate: form.startDate, endDate: form.endDate, ...(single && form.half && { half: form.half }) };
  const key = JSON.stringify(query);
  useEffect(() => {
    if (!form.startDate || !form.endDate || form.endDate < form.startDate) return undefined;
    const t = setTimeout(() => {
      api.get('/hr/me/leave-preview', { params: query }).then((r) => setPreview({ key, ...r.data })).catch(() => setPreview({ key, error: true }));
    }, 250);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = preview?.key === key ? preview : null;
  const blocked = !p || p.error || p.days === 0 || (p.exceeds && !p.allowNegative);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onSaved((await api.post('/hr/me/leaves', { ...query, note: form.note })).data.message);
    } catch (err) {
      showAlert({ type: 'error', title: 'Talep iletilemedi', message: errorMessage(err, 'İzin talebi oluşturulamadı.') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal as="form" onSubmit={submit} icon={CalendarPlus} title="İzin talebi" subtitle="Yetkili onaylayınca ya da reddedince bildirim alırsınız." onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button><button disabled={busy || blocked} className="btn-gradient disabled:opacity-50">Talep gönder</button></>}>
      <Field label="İzin türü" required>
        <Segmented size="sm" value={form.type} onChange={(type) => setForm({ ...form, type })} options={Object.entries(LEAVE_TYPES).map(([value, label]) => ({ value, label }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Başlangıç" required><input type="date" required className="premium-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })} aria-label="Başlangıç" /></Field>
        <Field label="Bitiş" required><input type="date" required min={form.startDate} className="premium-input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} aria-label="Bitiş" /></Field>
      </div>
      {single && (
        <Field label="Süre">
          <Segmented size="sm" value={form.half} onChange={(half) => setForm({ ...form, half })} options={[{ value: '', label: 'Tam gün' }, { value: 'AM', label: 'Sabah' }, { value: 'PM', label: 'Öğleden sonra' }]} />
        </Field>
      )}
      {p && !p.error && (
        <div className={`text-xs font-semibold rounded-xl p-3 space-y-1 ${p.days === 0 || (p.exceeds && !p.allowNegative) ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-brand-800'}`}>
          <p className="font-black">{p.days === 0 ? 'Seçilen aralıkta iş günü yok.' : `${dayText(p.days)} izin sayılır`}</p>
          {p.holidays.length > 0 && <p>Aradaki tatiller sayılmaz: {p.holidays.map((h) => `${formatDate(`${h.date}T12:00:00`)} ${h.name}${h.half ? ' (yarım gün)' : ''}`).join(', ')}</p>}
          {p.balance && <p>Kalan yıllık izniniz {dayText(p.balance.available)}{p.balance.pending ? ` (onay bekleyen ${dayText(p.balance.pending)} düşüldü)` : ''}; talepten sonra {dayText(Math.round((p.balance.available - p.days) * 10) / 10)}.</p>}
          {p.exceeds && <p className="font-black">{p.allowNegative ? 'Kalan gününüzü aşıyor; avans izin olarak işlenir.' : 'Kalan yıllık izninizi aşıyor; daha kısa bir aralık seçin.'}</p>}
        </div>
      )}
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
  const [params, setParams] = useSearchParams();
  const [me, setMe] = useState(null);
  const [noCard, setNoCard] = useState(false);
  const tab = params.get('tab') || 'leaves';
  const setTab = (id) => setParams({ tab: id }, { replace: true });
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

  const e = me?.employee;
  const balance = me?.leaveBalance;
  const tabs = [
    ...(me?.reports > 0 ? [{ id: 'team', label: 'Ekibim', icon: Users, tone: 'orange' }] : []),
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
                <p className="text-xs text-gray-500 truncate">{[e.title, e.department].filter(Boolean).join(' · ') || '—'}{e.hireDate ? ` · İşe giriş ${formatDate(e.hireDate)}` : ''}{e.manager ? ` · Yöneticisi ${e.manager.name}` : ''}</p>
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
            <Stat icon={Palmtree} label="Kalan yıllık izin" value={balance ? dayText(balance.remaining) : '—'}
              sub={balance ? (balance.next ? `${formatDate(balance.next.date)}: +${balance.next.days} gün` : '') + (balance.pending ? ` · ${dayText(balance.pending)} onay bekliyor` : '') : 'İşe giriş tarihi girilmemiş'} />
            <Stat icon={Clock} label="Bekleyen talep" value={me.pending.leaves + me.pending.claims} sub={`${me.pending.leaves} izin · ${me.pending.claims} masraf / avans`} />
            <Stat icon={Wallet} label="Ödeme bekleyen" value={formatTRY(me.awaitingPayment)} sub="Onaylı, ödenmemiş" />
            {me.openAdvance > 0
              ? <Stat icon={Wallet} label="Açık avans" value={formatTRY(me.openAdvance)} sub="Masraf / iade ile kapanır" />
              : <Stat icon={Target} label="Bu ay hedef" value={targets[0] && targets[0].status === 'OPEN' ? `%${targets[0].percent}` : '—'} sub={targets[0] && targets[0].status === 'OPEN' ? monthLabel(targets[0].period) : 'Açık hedef yok'} />}
          </div>

          <FilterTabs value={tab} onChange={setTab} tabs={tabs} />

          {tab === 'team' && me.reports > 0 && <TeamPanel showAlert={showAlert} confirm={confirm} onChanged={load} />}

          {tab === 'leaves' && (leaves.length === 0 ? <EmptyState icon={CalendarDays}>Henüz izin talebiniz yok.</EmptyState> : (
            <ListCard>
              {leaves.map((l) => (
                <Row key={l.id}>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-bold text-gray-900">{LEAVE_TYPES[l.type]} · {dayText(l.days)}{l.half && <span className="font-semibold text-gray-500"> · {HALF[l.half]}</span>}</p>
                      <p className="text-xs text-gray-600">{l.half ? formatDate(l.startDate) : `${formatDate(l.startDate)} – ${formatDate(l.endDate)}`}</p>
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
                        {state === 'PARTIAL' && <Pending>Ödenen {formatTRY(c.paidAmount)} · kalan {formatTRY(c.remaining)}</Pending>}
                        <Payments payments={c.payments} />
                        {c.type === 'ADVANCE' && c.paidAmount > 0 && (
                          <div className="rounded-xl bg-violet-50/60 px-3 py-2 space-y-0.5">
                            <p className="text-xs font-bold text-violet-700">{c.open > 0 ? `Açık avans ${formatTRY(c.open)}: masraflarınızdan düşülür ya da iade edilir` : 'Avans kapandı'}</p>
                            <Payments payments={c.settlements} />
                          </div>
                        )}
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
                      <div className="flex items-center gap-2"><StatusPill status={targetState(t)} /></div>
                      <p className="text-gray-600">Hesaplanan: <b className="text-gray-900 tabular-nums">{formatTRY(t.calculatedBonus)}</b>{t.status === 'OPEN' && <span className="text-gray-400"> (ay sonunda kesinleşir)</span>}</p>
                      <p className="text-gray-600">Ödenen: <b className={`tabular-nums ${t.paidBonus ? 'text-emerald-700' : 'text-gray-400'}`}>{formatTRY(t.paidBonus)}</b></p>
                      <Payments payments={t.payments} />
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
