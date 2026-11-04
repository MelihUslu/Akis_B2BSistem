import { useEffect, useMemo, useState } from 'react';
import { IdCard, Plus, Search, Pencil, Mail, Phone, CalendarDays, UserRound, Link2, UserCog, Palmtree, KeyRound, Wallet } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import Modal from '../shared/Modal';
import EmptyState from '../shared/EmptyState';
import FilterTabs from '../shared/FilterTabs';
import { Field } from '../form/FormKit';
import { formatDate, formatTRY } from '../../utils/format';
import { days } from './hrMeta';
import { ListCard, Row } from './HrUi';

const ROLE = { ADMIN: 'Yönetici paneli', PLASIYER: 'Plasiyer', PERSONEL: 'Personel girişi' };
const EMPTY = { name: '', email: '', phone: '', department: '', title: '', hireDate: '', userId: '', isActive: true, managerId: '', annualLeaveDays: '', leaveCarryDate: '', leaveCarryDays: '' };
const ymd = (v) => (v ? String(v).slice(0, 10) : '');

// Personel kartı ekleme / düzenleme. Hesap bağlanırsa personel kendi taleplerini açar ve görür.
const EmployeeModal = ({ initial, departments, employees, onClose, onSaved, showAlert }) => {
  const [form, setForm] = useState(() => ({
    ...EMPTY, ...initial,
    hireDate: ymd(initial?.hireDate), leaveCarryDate: ymd(initial?.leaveCarryDate),
    userId: initial?.userId ?? '', managerId: initial?.managerId ?? '', annualLeaveDays: initial?.annualLeaveDays ?? '', leaveCarryDays: initial?.leaveCarryDays ?? ''
  }));
  const [applyToDept, setApplyToDept] = useState(false);
  const managers = employees.filter((e) => e.id !== initial?.id && e.isActive && e.userId);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    api.get('/hr/linkable-users', { params: { include: initial?.userId || undefined } }).then((r) => setUsers(r.data)).catch(() => {});
  }, [initial?.userId]);

  // Hesap seçilince boş alanlar hesaptan doldurulur
  const pickUser = (e) => {
    const u = users.find((x) => String(x.id) === e.target.value);
    setForm({ ...form, userId: e.target.value, name: form.name || u?.name || '', email: form.email || u?.email || '' });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...form, applyManagerToDepartment: applyToDept };
      const res = form.id ? await api.put(`/hr/employees/${form.id}`, body) : await api.post('/hr/employees', body);
      onSaved(res.data.message);
    } catch (err) {
      showAlert({ type: 'error', title: 'Kaydedilemedi', message: errorMessage(err, 'Personel kaydedilemedi.') });
    } finally {
      setBusy(false);
    }
  };

  // Hesabı olmayan personele yalnızca Personel Alanım'a giren "personel girişi" (yönetici sayısına dahil değil)
  const openAccount = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/hr/employees/${form.id}/account`, { email: form.email });
      onSaved(res.data.password ? `${res.data.message} Geçici şifre: ${res.data.password}` : res.data.message);
    } catch (err) {
      showAlert({ type: 'error', title: 'Hesap açılamadı', message: errorMessage(err, 'Giriş hesabı açılamadı.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal as="form" onSubmit={submit} icon={IdCard} size="max-w-2xl" title={form.id ? 'Personel kartı' : 'Yeni personel'} subtitle="Bordro ve SGK bilgileri bu kartta tutulmaz." onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button><button disabled={busy} className="btn-gradient disabled:opacity-50">{busy ? 'Kaydediliyor...' : 'Kaydet'}</button></>}>
      <Field label="Kullanıcı hesabı" icon={Link2} hint="Bağlanırsa personel kendi izin, masraf ve avans taleplerini açar; hedef ve primlerini görür. Bayi hesapları bağlanamaz.">
        <select className="premium-input" value={form.userId} onChange={pickUser} aria-label="Kullanıcı hesabı">
          <option value="">Hesap yok (yalnızca kart)</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email} · {ROLE[u.role] || u.role}{u.isActive ? '' : ' (pasif)'}</option>)}
        </select>
      </Field>
      {form.id && !form.userId && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl bg-brand-50/60 ring-1 ring-brand-100 p-4">
          <KeyRound className="h-5 w-5 text-brand-600 shrink-0" />
          <p className="flex-1 text-xs text-gray-600"><b className="text-gray-900">Hesabı yok mu?</b> Yalnızca Personel Alanım'a giren bir giriş açın (izin, masraf, avans talepleri). Paketteki yönetici sayısına dahil değildir; geçici şifre e-postayla gider.</p>
          <button type="button" onClick={openAccount} disabled={busy || !form.email} title={form.email ? '' : 'Önce e-posta yazın'} className="h-10 px-4 rounded-xl bg-navy-900 text-white text-xs font-bold whitespace-nowrap disabled:opacity-50">Personel girişi aç</button>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Ad soyad" required><input required minLength={2} maxLength={120} className="premium-input" value={form.name} onChange={set('name')} aria-label="Ad soyad" /></Field>
        <Field label="İşe giriş tarihi"><input type="date" className="premium-input" value={form.hireDate} onChange={set('hireDate')} aria-label="İşe giriş tarihi" /></Field>
        <Field label="Departman" hint="Duyurular departmana göre gönderilebilir">
          <input list="hr-departments" maxLength={60} className="premium-input" value={form.department || ''} onChange={set('department')} placeholder="Satış, Depo, Muhasebe…" aria-label="Departman" />
          <datalist id="hr-departments">{departments.map((d) => <option key={d} value={d} />)}</datalist>
        </Field>
        <Field label="Görev"><input maxLength={80} className="premium-input" value={form.title || ''} onChange={set('title')} placeholder="Plasiyer, depo sorumlusu…" aria-label="Görev" /></Field>
        <Field label="E-posta"><input type="email" maxLength={160} className="premium-input" value={form.email || ''} onChange={set('email')} aria-label="E-posta" /></Field>
        <Field label="Telefon"><input type="tel" maxLength={30} className="premium-input" value={form.phone || ''} onChange={set('phone')} aria-label="Telefon" /></Field>
      </div>
      <Field label="Yöneticisi" icon={UserCog} hint="Yönetici, Personel yetkisi olmadan da bu kişinin izin, masraf ve avans taleplerine karar verir (Personel Alanım → Ekibim). Yalnızca hesabı olan personel seçilebilir.">
        <select className="premium-input" value={form.managerId} onChange={set('managerId')} aria-label="Yöneticisi">
          <option value="">Yok (Personel yetkilisi karar verir)</option>
          {managers.map((m) => <option key={m.id} value={m.id}>{m.name}{m.department ? ` · ${m.department}` : ''}</option>)}
        </select>
        {form.managerId && form.department && (
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={applyToDept} onChange={(e) => setApplyToDept(e.target.checked)} />
            "{form.department}" departmanındaki diğer personele de bu yöneticiyi ata
          </label>
        )}
      </Field>
      <div className="rounded-2xl ring-1 ring-gray-100 p-4 space-y-3">
        <p className="flex items-center gap-2 text-sm font-black text-gray-900"><Palmtree className="h-4 w-4 text-brand-500" /> Yıllık izin</p>
        <p className="text-xs text-gray-500">Hak, işe giriş tarihinin her yıl dönümünde eklenir: 1–5 yıl 14 gün, 5–15 yıl 20 gün, 15 yıl ve üstü 26 gün (İş Kanunu md. 53). Kullanılmayan izin devreder.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Firmanın verdiği (gün / yıl)" hint="Boş: yasal süre; yasal sürenin altı sayılmaz">
            <input type="number" min="0" max="60" className="premium-input" value={form.annualLeaveDays} onChange={set('annualLeaveDays')} placeholder="Yasal" aria-label="Yıllık izin günü" />
          </Field>
          <Field label="Devir tarihi" hint="Sisteme geçiş günü">
            <input type="date" className="premium-input" value={form.leaveCarryDate} onChange={set('leaveCarryDate')} aria-label="Devir tarihi" />
          </Field>
          <Field label="O gün kalan izin (gün)" hint="Önceki kayıtlardan">
            <input type="number" step="0.5" className="premium-input" value={form.leaveCarryDays} onChange={set('leaveCarryDays')} aria-label="Devreden izin günü" />
          </Field>
        </div>
      </div>
      <label className="flex items-center gap-3 rounded-2xl ring-1 ring-gray-100 p-4 cursor-pointer">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
        <span className="text-sm"><b className="font-bold text-gray-900">Aktif</b> <span className="text-gray-500">— pasif personel yeni talep açamaz; geçmiş kayıtları korunur.</span></span>
      </label>
    </Modal>
  );
};

const EmployeesTab = ({ showAlert, onChanged }) => {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('active');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const load = () => api.get('/hr/employees').then((r) => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const departments = useMemo(() => [...new Set((rows || []).map((r) => r.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')), [rows]);
  const list = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('tr');
    return (rows || [])
      .filter((r) => (status === 'all' ? true : status === 'active' ? r.isActive : !r.isActive))
      .filter((r) => !term || [r.name, r.department, r.title, r.email, r.phone].some((v) => (v || '').toLocaleLowerCase('tr').includes(term)));
  }, [rows, status, q]);
  const count = (fn) => (rows || []).filter(fn).length;

  return (
    <div className="space-y-4">
      {editing && <EmployeeModal initial={editing} departments={departments} employees={rows || []} showAlert={showAlert} onClose={() => setEditing(null)}
        onSaved={(msg) => { setEditing(null); load(); onChanged?.(); showAlert({ type: 'success', title: 'Kaydedildi', message: msg }); }} />}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <FilterTabs value={status} onChange={setStatus} tabs={[
          { id: 'active', label: 'Aktif', tone: 'emerald', count: count((r) => r.isActive) },
          { id: 'passive', label: 'Pasif', tone: 'gray', count: count((r) => !r.isActive) },
          { id: 'all', label: 'Tümü', count: rows?.length ?? 0 }
        ]} />
        <div className="flex-1 flex items-center gap-2 bg-white rounded-2xl ring-1 ring-gray-100 px-3 h-12 min-w-0">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, departman, görev, telefon…" className="flex-1 min-w-0 bg-transparent outline-none text-sm font-semibold" aria-label="Personel ara" />
        </div>
        <button type="button" onClick={() => setEditing({})} className="btn-gradient shrink-0"><Plus className="h-4 w-4 mr-1.5" /> Yeni personel</button>
      </div>

      {rows && list.length === 0 ? (
        <EmptyState icon={IdCard}>{rows.length === 0 ? 'Henüz personel kartı yok. "Yeni personel" ile ekleyin; isterseniz ekip üyesinin ya da plasiyerin hesabını bağlayın.' : 'Aramaya uyan personel yok.'}</EmptyState>
      ) : (
        <ListCard>
          {list.map((e) => (
            <Row key={e.id} className={e.isActive ? '' : 'opacity-60'}>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-10 w-10 shrink-0 rounded-xl bg-navy-900 text-white text-xs font-black flex items-center justify-center">{e.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr')}</span>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">{e.name}{!e.isActive && <span className="ml-2 text-[11px] font-black text-gray-500">Pasif</span>}</p>
                    <p className="text-xs text-gray-500 truncate">{[e.title, e.department].filter(Boolean).join(' · ') || 'Görev / departman yok'}</p>
                  </div>
                </div>
                <div className="text-xs text-gray-600 space-y-0.5 min-w-0">
                  {e.phone && <p className="truncate"><Phone className="inline h-3.5 w-3.5 mr-1 text-gray-400" />{e.phone}</p>}
                  {e.email && <p className="truncate"><Mail className="inline h-3.5 w-3.5 mr-1 text-gray-400" />{e.email}</p>}
                  {e.hireDate && <p><CalendarDays className="inline h-3.5 w-3.5 mr-1 text-gray-400" />İşe giriş {formatDate(e.hireDate)}</p>}
                </div>
                <div className="text-xs min-w-0">
                  {e.user ? (
                    <p className="text-gray-700 truncate"><UserRound className="inline h-3.5 w-3.5 mr-1 text-emerald-500" />{ROLE[e.user.role] || e.user.role} hesabı{e.user.isActive ? '' : ' (pasif)'}</p>
                  ) : <p className="text-gray-400">Hesap bağlı değil</p>}
                  {e.manager && <p className="text-gray-500 truncate"><UserCog className="inline h-3.5 w-3.5 mr-1 text-gray-400" />Yöneticisi {e.manager.name}</p>}
                  {e.leaveBalance && <p className="text-gray-600"><Palmtree className="inline h-3.5 w-3.5 mr-1 text-gray-400" />Kalan izin <b className={e.leaveBalance.remaining < 0 ? 'text-red-600' : 'text-gray-900'}>{days(e.leaveBalance.remaining)}</b></p>}
                  {e.openAdvance > 0 && <p className="text-violet-700"><Wallet className="inline h-3.5 w-3.5 mr-1" />Açık avans {formatTRY(e.openAdvance)}</p>}
                  {e.pending > 0 && <p className="mt-1 font-bold text-amber-700">{e.pending} bekleyen talep</p>}
                </div>
                <button type="button" onClick={() => setEditing(e)} className="h-10 px-4 rounded-xl ring-1 ring-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5 justify-self-start md:justify-self-end">
                  <Pencil className="h-4 w-4" /> Düzenle
                </button>
              </div>
            </Row>
          ))}
        </ListCard>
      )}
    </div>
  );
};

export default EmployeesTab;
