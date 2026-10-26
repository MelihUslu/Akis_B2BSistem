import React, { useState, useEffect } from 'react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import DealerUsersModal from '../../components/admin/DealerUsersModal';
import FilterTabs from '../../components/shared/FilterTabs';
import AddressBook from '../../components/shared/AddressBook';
import { Section, Field, IconInput, TextArea, Segmented } from '../../components/form/FormKit';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Users, Plus, Search, MoreVertical, Shield, Mail, Phone, MapPin, Hash, DollarSign, Percent, Lock, Edit3, CheckCircle2, XCircle, Clock, FileText, UserCheck, ShieldCheck, X, Trash2, Eye, Building2, CreditCard, Activity, Landmark, Database, KeyRound, Ban, Wallet, Award, Crown, ShoppingCart, CalendarClock, Briefcase, Save
} from 'lucide-react';

const DealerManagement = () => {
  const [dealers, setDealers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [triedSave, setTriedSave] = useState(false); // kaydet'e basılınca eksik alanlar kırmızı gösterilir
  const [urlParams] = useSearchParams();
  const [search, setSearch] = useState(urlParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(urlParams.get('status') || '');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [pendingCount, setPendingCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState({});
  const [usersOf, setUsersOf] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState(null);

  const emptyForm = {
    name: '', taxNumber: '', taxOffice: '', authorizedPerson: '',
    phone: '', address: '', email: '', password: '',
    riskLimit: 0, dealerGroup: 'STANDART', netDiscount: 0, minOrderAmount: 0,
    paymentTermDays: 30, plasiyerId: '',
    status: 'ACTIVE'
  };
  const [formData, setFormData] = useState(emptyForm);
  const [plasiyers, setPlasiyers] = useState([]);
  const { alertElement, showAlert, confirm } = useAlert();

  useEffect(() => {
    api.get('/auth/users', { params: { role: 'PLASIYER' } }).then(res => setPlasiyers(res.data)).catch(() => {});
  }, []);

  const fetchDealers = async () => {
    try {
      const res = await api.get('/companies', { params: { search: search || undefined, status: statusFilter || undefined, page, limit: 20 } });
      setDealers(res.data.data);
      setPagination(res.data.pagination);
      setPendingCount(res.data.pendingCount);
      setStatusCounts(res.data.statusCounts || {});
    } catch (error) {
      console.error('Bayiler yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(fetchDealers, 250);
    return () => clearTimeout(t);
  }, [search, statusFilter, page]);

  // Başvuru kararı: onay → aktif (bayiye e-posta gider), red → pasif
  const decideApplication = async (dealer, approve) => {
    const ok = await confirm({
      type: approve ? 'info' : 'warning',
      title: approve ? 'Başvuru onaylansın mı?' : 'Başvuru reddedilsin mi?',
      message: approve ? `${dealer.name} aktif bayi olacak ve başvuruda belirlediği şifreyle giriş yapabilecek. Risk limiti, iskonto ve grup ayarlarını düzenlemeyi unutmayın.` : `${dealer.name} pasife alınacak, giriş yapamayacak.`,
      confirmText: approve ? 'Onayla' : 'Reddet'
    });
    if (!ok) return;
    try {
      await api.patch(`/companies/${dealer.id}`, { status: approve ? 'ACTIVE' : 'PASSIVE' });
      showAlert({ type: 'success', title: approve ? 'Bayi Onaylandı' : 'Başvuru Reddedildi', message: approve ? 'Bayiye onay e-postası gönderildi.' : 'Başvuru pasife alındı.' });
      fetchDealers();
    } catch (error) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(error, 'İşlem yapılamadı.') });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!String(formData.name || '').trim() || !String(formData.taxNumber || '').trim() || !String(formData.email || '').trim()) {
      setTriedSave(true);
      return;
    }
    try {
      if (selectedDealer) {
        await api.patch(`/companies/${selectedDealer.id}`, formData);
        showAlert({ type: 'success', title: 'Kaydedildi', message: 'Bayi bilgileri güncellendi.' });
      } else {
        const res = await api.post('/companies', formData);
        showAlert({ type: res.data.message?.includes('gönderilemedi') ? 'warning' : 'success', title: 'Bayi Oluşturuldu', message: res.data.message });
      }
      setIsDrawerOpen(false);
      fetchDealers();
    } catch (error) {
      showAlert({ type: 'error', title: 'İşlem Başarısız', message: errorMessage(error, 'İşlem başarısız') });
    }
  };

  const resetPassword = async (id) => {
    const ok = await confirm({ title: 'Şifre Sıfırlansın mı?', message: 'Bayinin şifresi sıfırlanacak ve yeni şifre e-posta ile gönderilecek. Eski şifre artık çalışmayacak.', confirmText: 'Sıfırla' });
    if (!ok) return;
    try {
      const res = await api.post(`/companies/${id}/reset-password`);
      showAlert({ type: res.data.message.includes('gönderilemedi') ? 'warning' : 'success', title: 'Şifre Sıfırlandı', message: res.data.message });
    } catch (error) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(error, 'Şifre sıfırlanamadı.') });
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 text-[10px] font-bold"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Aktif</span>;
      case 'PASSIVE': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 ring-1 ring-gray-200 text-[10px] font-bold"><span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> Pasif</span>;
      default: return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-100 text-[10px] font-bold"><span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" /> Onay bekliyor</span>;
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in duration-700">
      {alertElement}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div className="flex items-center gap-4 shrink-0">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-3.5 rounded-2xl shadow-lg shadow-blue-500/25">
            <Users className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight whitespace-nowrap">Bayi Ağı</h1>
            <p className="text-gray-500 text-sm mt-1 whitespace-nowrap">{pagination.total ?? dealers.length} bayi · başvuru, limit ve kullanıcı yönetimi</p>
          </div>
        </div>

        <div className="flex flex-wrap md:flex-nowrap items-center gap-3 w-full xl:w-auto">
          <div className="relative flex-1 min-w-[12rem] xl:w-80 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-600 transition-all" />
            <input 
              type="text" 
              placeholder="Unvan veya vergi no ara..." 
              className="w-full h-12 pl-11 pr-4 bg-white border border-gray-100 rounded-2xl text-sm font-semibold focus:ring-4 focus:ring-blue-100 focus:border-blue-200 shadow-sm outline-none transition-all placeholder:text-gray-400 placeholder:font-medium"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button 
            onClick={() => { setSelectedDealer(null); setFormData(emptyForm); setTriedSave(false); setIsDrawerOpen(true); }}
            className="btn-gradient h-12 px-5 py-0 whitespace-nowrap shrink-0"
          >
            <Plus className="mr-1.5 h-4 w-4" /> YENİ BAYİ
          </button>
        </div>
      </div>

      {usersOf && (
        <DealerUsersModal title={`${usersOf.name} · Kullanıcılar`} base={`/companies/${usersOf.id}/users`} isAdmin
          onClose={() => { setUsersOf(null); fetchDealers(); }} showAlert={showAlert} confirm={confirm} />
      )}

      <FilterTabs value={statusFilter} onChange={(id) => { setPage(1); setStatusFilter(id); }} tabs={[
        { id: '', label: 'Tümü', icon: Users, tone: 'slate', count: statusCounts.ALL },
        { id: 'PENDING', label: 'Başvurular', icon: Clock, tone: 'orange', count: statusCounts.PENDING || 0, alert: true },
        { id: 'ACTIVE', label: 'Aktif', icon: CheckCircle2, tone: 'emerald', count: statusCounts.ACTIVE || 0 },
        { id: 'PASSIVE', label: 'Pasif', icon: Ban, tone: 'gray', count: statusCounts.PASSIVE || 0 },
      ]} />

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-left">
          <thead className="list-head">
            <tr>
              <th className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">NO</th>
              <th className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">Kurumsal Kimlik</th>
              <th className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">Yetkili</th>
              <th className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">Finansal Limitler</th>
              <th className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">Grup & Durum</th>
              <th className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap text-right">Aksiyon</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/70">
            {isLoading ? (
              [0, 1, 2, 3].map((i) => (
                <tr key={i}><td colSpan="6" className="px-8 py-6">
                  <div className="flex items-center gap-6 animate-pulse">
                    <div className="h-3 w-6 bg-gray-100 rounded" />
                    <div className="space-y-2 flex-1"><div className="h-3.5 w-1/3 bg-gray-100 rounded" /><div className="h-2.5 w-1/5 bg-gray-100 rounded" /></div>
                  </div>
                </td></tr>
              ))
            ) : dealers.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-24">
                <Users className="h-12 w-12 mx-auto text-gray-200 mb-3" />
                <p className="text-sm font-bold text-gray-500">Bayi bulunamadı</p>
                <p className="text-xs text-gray-400 mt-1">{search ? 'Arama ifadesini değiştirmeyi deneyin.' : 'İlk bayinizi “Yeni Bayi” ile ekleyin.'}</p>
              </td></tr>
            ) : dealers.map((dealer, index) => (
              <tr key={dealer.id} className={`group relative transition-colors hover:bg-slate-50/80 hover:shadow-[inset_3px_0_0_0_#3b82f6] ${dealer.status === 'PENDING' ? 'bg-amber-50/30' : ''}`}>
                <td className="px-8 py-6">
                  <span className="text-[11px] font-bold text-gray-400 tabular-nums">{(page - 1) * 20 + index + 1}</span>
                </td>
                <td className="px-8 py-6">
                  <div className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors text-[15px] tracking-tight">{dealer.name}</div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="font-mono text-[10px] font-semibold text-gray-500 bg-gray-100/80 px-1.5 py-0.5 rounded-md">VKN {dealer.taxNumber || '—'}</span>
                    {dealer.externalCode && <span className="font-mono text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">Cari {dealer.externalCode}</span>}
                  </div>
                  {dealer.status === 'PENDING' && (
                    <div className="mt-3 space-y-2">
                      {dealer.applicationNote && <p className="text-xs text-gray-600 bg-orange-50 rounded-xl px-3 py-2 max-w-sm">"{dealer.applicationNote}"</p>}
                      <div className="flex gap-2">
                        <button onClick={() => decideApplication(dealer, true)} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[10px] font-black">ONAYLA</button>
                        <button onClick={() => decideApplication(dealer, false)} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[10px] font-black">REDDET</button>
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-8 py-6">
                  <div className="font-bold text-gray-700">{dealer.authorizedPerson || '-'}</div>
                  <div className="flex items-center text-[11px] text-gray-500 font-medium mt-1">
                    <Mail className="h-3 w-3 mr-1.5 text-gray-400" /> {(dealer.users?.find(u => u.isOwner) || dealer.users?.[0])?.email || '-'}
                  </div>
                  {dealer.users?.length > 1 && <div className="text-[10px] font-black text-indigo-500 mt-1">+{dealer.users.length - 1} kullanıcı</div>}
                </td>
                <td className="px-8 py-6">
                  <div className="flex items-baseline gap-1 tabular-nums">
                    <span className={`text-[15px] font-black ${dealer.currentBalance < 0 ? 'text-gray-900' : 'text-emerald-600'}`}>{(dealer.currentBalance || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-[10px] font-bold text-gray-400">₺</span>
                    <span className={`ml-1 text-[10px] font-bold ${dealer.currentBalance < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{dealer.currentBalance < 0 ? 'borç' : dealer.currentBalance > 0 ? 'alacak' : ''}</span>
                  </div>
                  {dealer.riskLimit > 0 && (() => {
                    // Eksi bakiye = bayinin borcu; limit doluluğu borca göre hesaplanır
                    const used = Math.min(100, Math.max(0, (-(dealer.currentBalance || 0) / dealer.riskLimit) * 100));
                    return (
                      <div className="mt-1.5 w-36" title={`Limitin %${used.toFixed(0)}'i kullanılıyor`}>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className={`h-full rounded-full ${used >= 90 ? 'bg-red-500' : used >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${used}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-400 font-semibold mt-1 tabular-nums">Limit {dealer.riskLimit.toLocaleString('tr-TR')} ₺</p>
                      </div>
                    );
                  })()}
                </td>
                <td className="px-8 py-6 space-y-2">
                  <span className="block w-fit px-2 py-0.5 rounded-md bg-blue-50/70 text-blue-700 text-[11px] font-semibold">
                    {dealer.dealerGroup}
                  </span>
                  {getStatusBadge(dealer.status)}
                </td>
                <td className="px-8 py-6 text-right">
                  <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white ring-1 ring-gray-100 shadow-sm">
                    <button 
                      onClick={() => { setSelectedDealer(dealer); setIsViewOpen(true); }}
                      title="Görüntüle"
                      className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button 
                      onClick={() => { setSelectedDealer(dealer); setFormData({...emptyForm, ...dealer, plasiyerId: dealer.plasiyerId || '', email: dealer.users?.[0]?.email || ''}); setTriedSave(false); setIsDrawerOpen(true); }}
                      title="Düzenle"
                      className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button onClick={() => setUsersOf(dealer)} title="Kullanıcılar" className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                      <Users className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-8 py-5 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
          <div className="flex items-center space-x-3 text-gray-400">
            <Users className="h-4 w-4" />
            <span className="text-[11px] font-black uppercase tracking-widest">Ağ Özeti</span>
          </div>
          <div className="flex items-center gap-3">
            {pagination.pages > 1 && (
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded-lg bg-white border border-gray-100 text-xs font-black disabled:opacity-30">‹</button>
                <span className="text-xs font-bold text-gray-500 px-2">{page} / {pagination.pages}</span>
                <button disabled={page >= pagination.pages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded-lg bg-white border border-gray-100 text-xs font-black disabled:opacity-30">›</button>
              </div>
            )}
            <div className="text-[11px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-4 py-2 rounded-xl">
              Toplam: {pagination.total}
            </div>
          </div>
        </div>
      </div>

      {/* Bayi görüntüleme */}
      {isViewOpen && selectedDealer && (() => {
        const d = selectedDealer;
        const balance = d.currentBalance || 0;
        const debt = Math.max(0, -balance); // eksi bakiye = bayinin borcu
        const used = d.riskLimit > 0 ? Math.min(100, (debt / d.riskLimit) * 100) : null;
        const owner = d.users?.find((u) => u.isOwner) || d.users?.[0];
        const lastRec = d.reconciliations?.[0];
        const fmt = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const initials = (d.name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toLocaleUpperCase('tr-TR');
        const infoRows = [
          { icon: UserCheck, label: 'Yetkili', value: d.authorizedPerson },
          { icon: Phone, label: 'Telefon', value: d.phone, href: d.phone && `tel:${d.phone.replace(/\s/g, '')}` },
          { icon: Mail, label: 'E-posta', value: owner?.email, href: owner?.email && `mailto:${owner.email}` },
          { icon: Landmark, label: 'Vergi', value: [d.taxOffice, d.taxNumber].filter(Boolean).join(' / ') },
          { icon: Briefcase, label: 'Plasiyer', value: d.plasiyer?.name },
          { icon: CalendarClock, label: 'Kayıt', value: d.createdAt && new Date(d.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) },
        ];
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop" onClick={() => setIsViewOpen(false)} />
          <div className="modal-panel w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Kimlik şeridi */}
            <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 px-7 pt-6 pb-7 text-white">
              <button onClick={() => setIsViewOpen(false)} className="absolute top-4 right-4 p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10" aria-label="Kapat"><X className="h-5 w-5" /></button>
              <div className="flex items-center gap-4 pr-10">
                <div className="h-14 w-14 rounded-2xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center text-lg font-black shrink-0">{initials}</div>
                <div className="min-w-0">
                  <h3 className="text-xl font-black tracking-tight truncate">{d.name}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {getStatusBadge(d.status)}
                    <span className="px-2 py-0.5 rounded-md bg-white/10 text-[11px] font-semibold">{d.dealerGroup} grubu</span>
                    {d.taxNumber && <span className="font-mono text-[11px] text-white/60">VKN {d.taxNumber}</span>}
                    {d.externalCode && <span className="font-mono text-[11px] text-white/60">· Cari {d.externalCode}</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
              {/* Finans özeti */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2 rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><Wallet className="h-3 w-3" /> Güncel bakiye</p>
                  <p className={`text-2xl font-black tabular-nums mt-1 ${balance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(Math.abs(balance))} ₺
                    <span className="ml-2 text-xs font-bold">{balance < 0 ? 'borç' : balance > 0 ? 'alacak' : ''}</span>
                  </p>
                  {used !== null && (
                    <div className="mt-2">
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full rounded-full ${used >= 90 ? 'bg-red-500' : used >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${used}%` }} />
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1 tabular-nums">Risk limitinin %{used.toFixed(0)}'i kullanılıyor · limit {fmt(d.riskLimit)} ₺</p>
                    </div>
                  )}
                </div>
                <div className="rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><Percent className="h-3 w-3" /> İskonto</p>
                  <p className="text-2xl font-black text-gray-900 tabular-nums mt-1">%{d.netDiscount || 0}</p>
                  <p className="text-[11px] text-gray-400">tüm liste fiyatlarına</p>
                </div>
                <div className="rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Vade</p>
                  <p className="text-2xl font-black text-gray-900 tabular-nums mt-1">{d.paymentTermDays ?? 0} <span className="text-sm text-gray-400">gün</span></p>
                  <p className="text-[11px] text-gray-400 tabular-nums">min. sipariş {fmt(d.minOrderAmount)} ₺</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
                {/* İletişim ve kimlik */}
                <div className="md:col-span-3 rounded-2xl ring-1 ring-gray-100 divide-y divide-gray-100">
                  {infoRows.map((r) => (
                    <div key={r.label} className="flex items-center gap-3 px-4 py-3">
                      <span className="p-1.5 rounded-lg bg-gray-50 text-gray-400"><r.icon className="h-4 w-4" /></span>
                      <span className="w-20 shrink-0 text-xs font-semibold text-gray-400">{r.label}</span>
                      {r.value ? (
                        r.href ? <a href={r.href} className="text-sm font-semibold text-blue-700 hover:underline truncate">{r.value}</a>
                          : <span className="text-sm font-semibold text-gray-800 truncate">{r.value}</span>
                      ) : <span className="text-sm text-gray-300">—</span>}
                    </div>
                  ))}
                  <div className="flex items-start gap-3 px-4 py-3">
                    <span className="p-1.5 rounded-lg bg-gray-50 text-gray-400"><MapPin className="h-4 w-4" /></span>
                    <span className="w-20 shrink-0 text-xs font-semibold text-gray-400 pt-1">Adres</span>
                    {d.address ? (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.address)}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-gray-800 hover:text-blue-700 leading-relaxed">{d.address}</a>
                    ) : <span className="text-sm text-gray-300 pt-1">—</span>}
                  </div>
                </div>

                {/* Kullanıcılar ve mutabakat */}
                <div className="md:col-span-2 space-y-4">
                  <div className="rounded-2xl ring-1 ring-gray-100 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-black text-gray-900 flex items-center gap-1.5"><Users className="h-4 w-4 text-gray-400" /> Kullanıcılar</h4>
                      <button onClick={() => { setIsViewOpen(false); setUsersOf(d); }} className="text-xs font-bold text-blue-600 hover:underline">Yönet</button>
                    </div>
                    <div className="space-y-2">
                      {(d.users || []).map((u) => (
                        <div key={u.id} className={`flex items-center gap-2.5 ${u.isActive === false ? 'opacity-50' : ''}`}>
                          <span className="h-8 w-8 rounded-full bg-blue-50 text-blue-700 text-[11px] font-black flex items-center justify-center shrink-0">{(u.name || u.email).slice(0, 2).toLocaleUpperCase('tr-TR')}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate">{u.name}{u.isOwner && <span className="ml-1.5 text-[10px] font-bold text-amber-600">ana kullanıcı</span>}</p>
                            <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
                          </div>
                        </div>
                      ))}
                      {!d.users?.length && <p className="text-xs text-gray-400">Kullanıcı yok.</p>}
                    </div>
                  </div>
                  <div className="rounded-2xl ring-1 ring-gray-100 p-4">
                    <h4 className="text-sm font-black text-gray-900 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-gray-400" /> Son mutabakat</h4>
                    {lastRec ? (
                      <p className="text-xs text-gray-600 mt-2">{new Date(lastRec.createdAt).toLocaleDateString('tr-TR')} tarihinde <b className="tabular-nums">{fmt(Math.abs(lastRec.balance))} ₺ {lastRec.balance < 0 ? 'borç' : 'alacak'}</b> bakiye onaylandı.</p>
                    ) : <p className="text-xs text-gray-400 mt-2">Bayi henüz mutabakat onaylamadı.</p>}
                  </div>
                </div>
              </div>
              <div className="rounded-2xl ring-1 ring-gray-100 p-4">
                <h4 className="text-sm font-black text-gray-900 flex items-center gap-1.5 mb-3"><MapPin className="h-4 w-4 text-gray-400" /> Teslimat adresleri</h4>
                <AddressBook base={`/companies/${d.id}/addresses`} showAlert={showAlert} />
              </div>
            </div>

            <div className="modal-footer items-center flex-wrap">
              <Link to={`/print/statement/${d.id}`} className="btn-secondary px-5"><FileText className="h-4 w-4 mr-1.5" /> CARİ EKSTRE</Link>
              <button onClick={() => { setIsViewOpen(false); setUsersOf(d); }} className="btn-secondary px-5"><Users className="h-4 w-4 mr-1.5" /> KULLANICILAR</button>
              <button onClick={() => { setIsViewOpen(false); setFormData({ ...emptyForm, ...d, plasiyerId: d.plasiyerId || '', email: d.users?.[0]?.email || '' }); setTriedSave(false); setIsDrawerOpen(true); }} className="btn-gradient h-12 py-0 flex-1">
                <Edit3 className="h-4 w-4 mr-2" /> DÜZENLE
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Bayi ekle / düzenle */}
      {isDrawerOpen && (() => {
        const set = (k) => (e) => setFormData({ ...formData, [k]: e.target.value });
        const missing = { name: !String(formData.name || '').trim(), taxNumber: !String(formData.taxNumber || '').trim(), email: !String(formData.email || '').trim() };
        const showErr = (k) => triedSave && missing[k];
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop" onClick={() => setIsDrawerOpen(false)} />
          <div className="modal-panel w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="modal-header items-center">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/25 flex items-center justify-center text-white font-black text-sm shrink-0">
                  {formData.name ? formData.name.trim().slice(0, 2).toLocaleUpperCase('tr-TR') : <UserCheck className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <h3 className="modal-title text-xl">{selectedDealer ? 'Bayi Kartını Düzenle' : 'Yeni Bayi'}</h3>
                  <p className="modal-subtitle truncate">{formData.name || 'Firma bilgileri, giriş ve ticari koşullar'}</p>
                </div>
              </div>
              <button onClick={() => setIsDrawerOpen(false)} className="modal-close" aria-label="Kapat">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1 bg-gray-50/40">
              <Section icon={Building2} title="Firma Bilgileri" description="Fatura ve cari hesap için kullanılır.">
                <Field label="Şirket Unvanı" required error={showErr('name') && 'Unvan zorunlu.'}>
                  <IconInput icon={Building2} invalid={showErr('name')} value={formData.name} onChange={set('name')} placeholder="Örn: Akis Teknoloji Ltd. Şti." />
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Vergi No" required error={showErr('taxNumber') && 'Vergi no zorunlu.'}>
                    <IconInput icon={Hash} invalid={showErr('taxNumber')} className="font-mono" value={formData.taxNumber} onChange={set('taxNumber')} placeholder="1234567890" />
                  </Field>
                  <Field label="Vergi Dairesi">
                    <IconInput icon={Landmark} value={formData.taxOffice} onChange={set('taxOffice')} placeholder="Kadıköy" />
                  </Field>
                  <Field label="Cari Kodu (ERP)">
                    <IconInput icon={Database} className="font-mono" value={formData.externalCode || ''} onChange={set('externalCode')} placeholder="120.01.001" />
                  </Field>
                </div>
              </Section>

              <Section icon={Phone} title="İletişim" color="violet">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Yetkili Kişi">
                    <IconInput icon={UserCheck} value={formData.authorizedPerson} onChange={set('authorizedPerson')} placeholder="Ad Soyad" />
                  </Field>
                  <Field label="Telefon">
                    <IconInput type="tel" icon={Phone} value={formData.phone} onChange={set('phone')} placeholder="0 (5xx) xxx xx xx" />
                  </Field>
                </div>
                <Field label="Adres">
                  <TextArea className="h-20" value={formData.address} onChange={set('address')} placeholder="Teslimat ve fatura adresi" />
                </Field>
              </Section>

              <Section icon={KeyRound} title="Portal Girişi" description="Bayi bu e-posta ile giriş yapar; şifre e-postayla gönderilir." color="emerald"
                aside={<Segmented size="sm" value={formData.status} onChange={(v) => setFormData({ ...formData, status: v })}
                  options={[{ value: 'ACTIVE', label: 'Aktif', icon: CheckCircle2 }, { value: 'PASSIVE', label: 'Pasif', icon: Ban }]} />}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <Field label="Giriş E-postası" required error={showErr('email') && 'E-posta zorunlu.'} hint={selectedDealer ? 'Kullanıcılar menüsünden değiştirilebilir.' : undefined}>
                    <IconInput type="email" icon={Mail} invalid={showErr('email')} disabled={!!selectedDealer} className="disabled:opacity-60" value={formData.email} onChange={set('email')} placeholder="bayi@firma.com" />
                  </Field>
                  {selectedDealer ? (
                    <Field label="Şifre">
                      <button type="button" onClick={() => resetPassword(selectedDealer.id)} className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-orange-50 text-orange-600 text-xs font-bold ring-1 ring-orange-100 hover:bg-orange-100 transition-all">
                        <Lock className="h-4 w-4" /> Şifreyi sıfırla ve e-postayla gönder
                      </button>
                    </Field>
                  ) : (
                    <Field label="Geçici Şifre" hint="Boş bırakırsanız güçlü bir şifre üretilip e-postayla gönderilir.">
                      <IconInput type="password" icon={Lock} autoComplete="new-password" minLength={8} value={formData.password} onChange={set('password')} placeholder="Otomatik üret" />
                    </Field>
                  )}
                </div>
              </Section>

              <Section icon={Wallet} title="Ticari Koşullar" description="Fiyat, limit ve ödeme kuralları bu bayiye özel uygulanır." color="amber">
                <Field label="Bayi Grubu" hint="Gruba özel fiyat listeleri ve kampanyalar için.">
                  <Segmented value={formData.dealerGroup} onChange={(v) => setFormData({ ...formData, dealerGroup: v })}
                    options={[{ value: 'STANDART', label: 'Standart', icon: Users }, { value: 'GOLD', label: 'Gold', icon: Award }, { value: 'VIP', label: 'VIP', icon: Crown }]} />
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Risk Limiti" hint="Açık bakiye bu tutarı aşınca sipariş durur.">
                    <IconInput type="number" min="0" icon={ShieldCheck} suffix="₺" value={formData.riskLimit} onChange={set('riskLimit')} />
                  </Field>
                  <Field label="Net İskonto" hint="Tüm liste fiyatlarına uygulanır.">
                    <IconInput type="number" min="0" max="100" step="0.01" icon={Percent} suffix="%" value={formData.netDiscount} onChange={set('netDiscount')} />
                  </Field>
                  <Field label="Minimum Sipariş Tutarı" hint="KDV hariç.">
                    <IconInput type="number" min="0" icon={ShoppingCart} suffix="₺" value={formData.minOrderAmount} onChange={set('minOrderAmount')} />
                  </Field>
                  <Field label="Ödeme Vadesi">
                    <IconInput type="number" min="0" icon={CalendarClock} suffix="gün" value={formData.paymentTermDays} onChange={set('paymentTermDays')} />
                  </Field>
                </div>
                <Field label="Sorumlu Plasiyer" hint={plasiyers.length === 0 ? 'Plasiyer eklemek için Ayarlar sayfasını kullanın.' : 'Bu bayinin satışlarından prim alır.'}>
                  <IconInput as="select" icon={Briefcase} value={formData.plasiyerId} onChange={set('plasiyerId')}>
                    <option value="">Atanmamış</option>
                    {plasiyers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
                  </IconInput>
                </Field>
              </Section>
            </form>

            <div className="modal-footer items-center">
              <p className="hidden md:block text-[11px] text-gray-400 mr-auto"><span className="text-red-500">*</span> zorunlu alanlar</p>
              <button onClick={() => setIsDrawerOpen(false)} className="btn-secondary px-6">VAZGEÇ</button>
              <button onClick={handleSubmit} className="btn-gradient h-12 py-0 px-8">
                <Save className="h-4 w-4 mr-2" /> {selectedDealer ? 'KAYDET' : 'BAYİYİ OLUŞTUR'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};

export default DealerManagement;
