import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IdCard, CalendarDays, Receipt, Target, Megaphone, Power, CalendarCog } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { useTenant } from '../../context/TenantContext';
import { can } from '../../utils/permissions';
import useAlert from '../../hooks/useAlert';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/shared/PageHeader';
import FilterTabs from '../../components/shared/FilterTabs';
import EmptyState from '../../components/shared/EmptyState';
import EmployeesTab from '../../components/hr/EmployeesTab';
import LeavesTab from '../../components/hr/LeavesTab';
import ClaimsTab from '../../components/hr/ClaimsTab';
import TargetsTab from '../../components/hr/TargetsTab';
import AnnouncementsTab from '../../components/hr/AnnouncementsTab';
import HrSettingsTab from '../../components/hr/HrSettingsTab';

/**
 * Personel Yönetimi. "Personel" yetkisi: kartlar, izin / masraf / avans onayı, hedefler, duyurular.
 * "Finans" yetkisi: ödeme bekleyen masraf / avans ve primlerin ödenmesi (yalnızca o sekmeler görünür).
 */
const HrManagement = () => {
  const { user } = useAuth();
  const { alertElement, showAlert, confirm } = useAlert();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [counts, setCounts] = useState({});
  const [enabling, setEnabling] = useState(false);
  const { refresh } = useTenant();

  const loadCounts = useCallback(() => Promise.all([
    status?.canManage ? api.get('/hr/leaves', { params: { status: 'PENDING' } }).then((r) => r.data.counts.PENDING || 0) : 0,
    api.get('/hr/claims', { params: { status: 'PENDING' } }).then((r) => (status?.canManage ? r.data.counts.PENDING || 0 : 0) + (status?.canPay ? r.data.counts.TO_PAY || 0 : 0))
  ]).then(([leaves, claims]) => setCounts({ leaves, claims })).catch(() => {}), [status]);

  const loadStatus = useCallback(() => api.get('/hr/status').then((r) => setStatus({ ...r.data, isOwner: user?.isOwner })).catch(() => setStatus({ enabled: false })), [user?.isOwner]);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Modül kapalıysa Ayarlar yetkilisi buradan açar (Ayarlar → Modüller ile aynı ayar)
  const enable = async () => {
    setEnabling(true);
    try {
      await api.post('/settings', { key: 'hr_enabled', value: 'true' });
      await Promise.all([refresh(), loadStatus()]);
      showAlert({ type: 'success', title: 'Personel yönetimi açıldı', message: 'Önce personel kartlarını oluşturun; ekip üyesinin ya da plasiyerin hesabını karta bağlarsanız kendi izin ve masraf taleplerini Personel Alanım\'dan açar.' });
    } catch (err) {
      showAlert({ type: 'error', title: 'Açılamadı', message: errorMessage(err, 'Modül açılamadı.') });
    } finally {
      setEnabling(false);
    }
  };
  useEffect(() => { if (status?.enabled) loadCounts(); }, [status, loadCounts]);

  const tabs = status?.canManage ? [
    { id: 'employees', label: 'Personel', icon: IdCard },
    { id: 'leaves', label: 'İzinler', icon: CalendarDays, tone: 'orange', count: counts.leaves, alert: true },
    { id: 'claims', label: 'Masraf ve avans', icon: Receipt, tone: 'orange', count: counts.claims, alert: true },
    { id: 'targets', label: 'Hedef ve prim', icon: Target },
    { id: 'announcements', label: 'Duyurular', icon: Megaphone },
    { id: 'settings', label: 'İzin ayarları', icon: CalendarCog }
  ] : [
    { id: 'claims', label: 'Masraf ve avans', icon: Receipt, tone: 'orange', count: counts.claims, alert: true },
    { id: 'targets', label: 'Hedef ve prim', icon: Target }
  ];
  const tab = tabs.some((t) => t.id === params.get('tab')) ? params.get('tab') : tabs[0].id;
  const props = { showAlert, confirm, me: status, onChanged: loadCounts };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {alertElement}
      <PageHeader icon={IdCard} title="Personel Yönetimi" subtitle="Personel kartları, izin, masraf ve avans onayları, satış hedefi ve prim, şirket duyuruları." />
      {status && !status.enabled ? (
        <EmptyState icon={IdCard} action={can(user, 'SETTINGS') && (
          <button type="button" onClick={enable} disabled={enabling} className="btn-gradient disabled:opacity-50"><Power className="h-4 w-4 mr-1.5" /> {enabling ? 'Açılıyor...' : 'Modülü aç'}</button>
        )}>
          Personel modülü bu firmada kapalı. Açınca personel kartları, izin, masraf ve avans onayları, satış hedefi ve prim, şirket duyuruları kullanılabilir; ekip üyeleri ve plasiyerler "Personel Alanım"dan kendi taleplerini açar. Sonradan Ayarlar → Modüller'den kapatabilirsiniz.
        </EmptyState>
      ) : status && (
        <>
          <FilterTabs value={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} tabs={tabs} />
          {tab === 'employees' && <EmployeesTab {...props} />}
          {tab === 'leaves' && <LeavesTab {...props} />}
          {tab === 'claims' && <ClaimsTab {...props} />}
          {tab === 'targets' && <TargetsTab {...props} />}
          {tab === 'announcements' && <AnnouncementsTab {...props} />}
          {tab === 'settings' && <HrSettingsTab {...props} />}
        </>
      )}
    </div>
  );
};

export default HrManagement;
