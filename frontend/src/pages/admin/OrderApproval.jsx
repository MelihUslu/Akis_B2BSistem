import React, { useState, useEffect, useCallback } from 'react';
import api, { errorMessage } from '../../services/api';
import {
  ShoppingCart, CheckCircle, Truck, AlertCircle, PackageCheck, Search, FileSpreadsheet, Printer, ExternalLink,
  X, Clock, Hourglass, Package, CheckCheck, ChevronLeft, ChevronRight, CalendarRange, ArrowDownUp, Ban, Building2,
  CreditCard, Landmark, Inbox, TicketPercent, Undo2, MapPin, RefreshCw, Warehouse as WarehouseIcon
} from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { downloadFile } from '../../utils/download';
import { CARRIERS, trackingUrl, carrierName } from '../../utils/cargo';
import useAlert from '../../hooks/useAlert';
import InvoicePanel from '../../components/shared/InvoicePanel';
import { formatAddress } from '../../utils/turkey';
import { formatTRY, formatDate, ORDER_STATUS } from '../../utils/format';

const TABS = [
  { id: '', label: 'Tümü' },
  { id: 'PENDING', label: 'Onay Bekleyen', dot: 'bg-orange-500' },
  { id: 'APPROVED', label: 'Onaylı', dot: 'bg-emerald-500' },
  { id: 'PARTIAL_APPROVED', label: 'Kısmi', dot: 'bg-amber-500' },
  { id: 'SHIPPED', label: 'Kargoda', dot: 'bg-blue-500' },
  { id: 'COMPLETED', label: 'Teslim', dot: 'bg-green-600' },
  { id: 'CANCELLED', label: 'İptal', dot: 'bg-red-500' },
];

const EDITABLE = ['PENDING', 'PARTIAL_APPROVED', 'APPROVED'];
const SHIPPABLE = ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED'];
const HOUR = 60 * 60 * 1000;

// "5 dk önce", "3 saat önce", "2 gün önce"
const timeAgo = (date, now) => {
  const diff = now - new Date(date).getTime();
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / 60000))} dk önce`;
  if (diff < 24 * HOUR) return `${Math.round(diff / HOUR)} saat önce`;
  return `${Math.round(diff / (24 * HOUR))} gün önce`;
};

const StatusPill = ({ status }) => {
  const s = ORDER_STATUS[status] || ORDER_STATUS.PENDING;
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${s.className}`}>{s.label}</span>;
};

const SummaryCard = ({ icon: Icon, label, value, sub, tone, active, onClick }) => (
  <button onClick={onClick}
    className={`text-left rounded-2xl p-4 ring-1 transition-all hover:-translate-y-0.5 hover:shadow-md ${active ? 'ring-2 ring-blue-500 bg-blue-50/40' : 'ring-gray-100 bg-white'}`}>
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold text-gray-500">{label}</span>
      <span className={`p-1.5 rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span>
    </div>
    <p className="text-2xl font-black text-gray-900 mt-1 tabular-nums">{value}</p>
    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub || ' '}</p>
  </button>
);

const OrderApproval = () => {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ counts: {}, total: 0, pendingAmount: 0, oldestPendingAt: null });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [checked, setChecked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [cargoCompany, setCargoCompany] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [urlParams] = useSearchParams();
  const [filter, setFilter] = useState(urlParams.get('status') || '');
  const [query, setQuery] = useState(urlParams.get('q') || '');
  const [range, setRange] = useState({ from: '', to: '' });
  const [sort, setSort] = useState('');
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [now, setNow] = useState(() => Date.now());
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState(null); // detayda seçilen karşılama deposu // bekleme süreleri her yüklemede bu ana göre hesaplanır
  const { alertElement, showAlert, confirm } = useAlert();

  const listParams = (paged) => ({
    ...(filter && { status: filter }),
    ...(query.trim() && { q: query.trim() }),
    ...(range.from && { from: range.from }),
    ...(range.to && { to: range.to }),
    ...(paged && { page, limit, ...(sort && { sort }) })
  });

  const openOrder = (order) => {
    // Kalem durumları yerel kopya üzerinde düzenlenir, "Kaydet" ile gönderilir
    setSelectedOrder({ ...order, items: order.items.map((i) => ({ ...i })) });
    setTrackingNumber(order.trackingNumber || '');
    setCargoCompany(order.cargoCompany || '');
    setWarehouseId(order.warehouseId || null);
  };

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const [list, st] = await Promise.all([
        api.get('/orders', { params: listParams(true) }),
        api.get('/orders/stats', { params: listParams(false) }).catch(() => null)
      ]);
      setNow(Date.now());
      setOrders(list.data.data);
      setPagination(list.data.pagination);
      if (st) setStats(st.data);
      setChecked(new Set());
      // Aramadan tek sipariş geldiyse otomatik aç
      if (urlParams.get('q') && list.data.data.length === 1) openOrder(list.data.data[0]);
    } catch (error) {
      setErrorMsg('Siparişler yüklenirken bir hata oluştu: ' + errorMessage(error, error.message));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { api.get('/warehouses').then((r) => setWarehouses(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    const t = setTimeout(fetchOrders, 250);
    return () => clearTimeout(t);
  }, [filter, query, range, page, sort, limit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc ile detay paneli kapanır
  const closeDetail = useCallback(() => setSelectedOrder(null), []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeDetail(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeDetail]);

  const changeFilter = (id) => { setPage(1); setFilter(id); };

  const exportExcel = () => downloadFile('/orders/export', listParams(false), 'siparisler.xlsx')
    .catch(() => showAlert({ type: 'error', title: 'Hata', message: 'Excel oluşturulamadı.' }));

  const setItemStatus = (itemId, status) => {
    setSelectedOrder((prev) => ({ ...prev, items: prev.items.map((i) => (i.id === itemId ? { ...i, status } : i)) }));
  };

  // Hızlı / toplu onayda: bekleyen siparişte tüm kalemler onaylanır; daha önce iptal edilen kalem iptal kalır
  const approveAllItems = (order) => order.items.map((i) => ({ itemId: i.id, status: i.status === 'CANCELLED' && order.status !== 'PENDING' ? 'CANCELLED' : 'APPROVED' }));

  const handlePartialApprove = async (order) => {
    const cancelled = order.items.filter((i) => i.status === 'CANCELLED').length;
    const ok = await confirm({
      type: cancelled === order.items.length ? 'warning' : 'info',
      title: cancelled === order.items.length ? 'Sipariş İptal Edilecek' : 'Onayı Kaydet',
      message: cancelled === order.items.length
        ? 'Tüm kalemler iptal işaretli. Sipariş iptal edilecek ve cariye yazılan tutar varsa geri alınacak.'
        : `${order.items.length - cancelled} kalem onaylanacak${cancelled ? `, ${cancelled} kalem iptal edilecek` : ''}. Onaylanan kalemlerin stoğu düşülecek ve tutar bayinin carisine borç yazılacak.`,
      confirmText: 'Kaydet',
    });
    if (!ok) return;

    try {
      const itemStatuses = order.items.map((item) => ({ itemId: item.id, status: item.status }));
      const res = await api.patch(`/orders/${order.id}/partial-approve`, { itemStatuses, ...(warehouseId && { warehouseId }) });
      showAlert({ type: 'success', title: 'Sipariş Güncellendi', message: `${res.data.message} Yeni tutar: ${formatTRY(res.data.updatedOrder.totalAmount)}` });
      setSelectedOrder(null);
      fetchOrders();
    } catch (error) {
      showAlert({ type: 'error', title: 'Onay Başarısız', message: errorMessage(error, 'Hata oluştu.') });
    }
  };

  // Satırdaki "Onayla": tüm kalemleri onaylar
  const quickApprove = async (order) => {
    const ok = await confirm({
      type: 'info', title: `#AK-${order.id} onaylansın mı?`,
      message: `${order.company?.name} · ${order.items.length} kalem · ${formatTRY(order.totalAmount)}. Tüm kalemler onaylanır, stok düşülür ve tutar cariye yazılır. Kalem bazında karar vermek için satıra tıklayın.`,
      confirmText: 'Onayla'
    });
    if (!ok) return;
    try {
      await api.patch(`/orders/${order.id}/partial-approve`, { itemStatuses: approveAllItems(order) });
      showAlert({ type: 'success', title: 'Onaylandı', message: `#AK-${order.id} onaylandı.` });
      fetchOrders();
    } catch (error) {
      showAlert({ type: 'error', title: 'Onay Başarısız', message: errorMessage(error, 'Hata oluştu.') });
    }
  };

  const handleShip = async (orderId) => {
    if (!trackingNumber.trim()) {
      showAlert({ type: 'warning', title: 'Takip No Gerekli', message: 'Lütfen kargo takip numarasını girin.' });
      return;
    }
    try {
      await api.patch(`/orders/${orderId}/ship`, { trackingNumber, cargoCompany });
      showAlert({ type: 'success', title: 'Kargoya Verildi', message: 'Bayiye kargo bildirimi gönderildi.' });
      setSelectedOrder(null);
      fetchOrders();
    } catch (error) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(error, 'Kargo bilgisi kaydedilemedi.') });
    }
  };

  // Kargo entegrasyonu: gönderi oluştur / durumu güncelle / iptal
  const shipmentAction = async (method, suffix) => {
    try {
      const res = await api.request({ method, url: `/orders/${selectedOrder.id}/shipment${suffix}` });
      showAlert({ type: 'success', title: 'Kargo', message: res.data.message });
      setSelectedOrder((prev) => ({ ...prev, ...res.data.order, items: prev.items }));
      if (res.data.order?.trackingNumber) setTrackingNumber(res.data.order.trackingNumber);
      fetchOrders();
    } catch (error) {
      showAlert({ type: 'error', title: 'Kargo', message: errorMessage(error, 'İşlem yapılamadı.') });
    }
  };

  const handleComplete = async (orderId) => {
    try {
      await api.patch(`/orders/${orderId}/complete`);
      showAlert({ type: 'success', title: 'Teslim Edildi', message: 'Sipariş tamamlandı olarak işaretlendi.' });
      setSelectedOrder(null);
      fetchOrders();
    } catch (error) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(error, 'Sipariş güncellenemedi.') });
    }
  };

  // ─── Toplu işlemler ────────────────────────────────────────────────────────
  const selected = orders.filter((o) => checked.has(o.id));
  const selPending = selected.filter((o) => o.status === 'PENDING');
  const selShipped = selected.filter((o) => o.status === 'SHIPPED');

  const toggleCheck = (id) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allChecked = orders.length > 0 && orders.every((o) => checked.has(o.id));
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(orders.map((o) => o.id)));

  const runBulk = async (list, action, title) => {
    setBusy(true);
    let okCount = 0;
    const failed = [];
    for (const order of list) {
      try {
        await action(order);
        okCount++;
      } catch (error) {
        failed.push(`#AK-${order.id}: ${errorMessage(error, 'hata')}`);
      }
    }
    setBusy(false);
    showAlert({
      type: failed.length ? 'warning' : 'success', title,
      message: `${okCount} sipariş güncellendi.${failed.length ? ` Başarısız: ${failed.join(' · ')}` : ''}`
    });
    fetchOrders();
  };

  const bulkApprove = async () => {
    const total = selPending.reduce((s, o) => s + o.totalAmount, 0);
    const ok = await confirm({
      type: 'info', title: `${selPending.length} sipariş onaylansın mı?`,
      message: `Toplam ${formatTRY(total)}. Tüm kalemler onaylanır, stoklar düşülür ve tutarlar bayilerin carisine yazılır.`,
      confirmText: 'Hepsini Onayla'
    });
    if (ok) runBulk(selPending, (o) => api.patch(`/orders/${o.id}/partial-approve`, { itemStatuses: approveAllItems(o) }), 'Toplu Onay');
  };

  const bulkComplete = async () => {
    const ok = await confirm({ type: 'info', title: `${selShipped.length} sipariş teslim edildi olarak işaretlensin mi?`, message: 'Bayilere bildirim gider.', confirmText: 'İşaretle' });
    if (ok) runBulk(selShipped, (o) => api.patch(`/orders/${o.id}/complete`), 'Toplu Teslim');
  };

  // ─── Görünüm ───────────────────────────────────────────────────────────────
  const c = stats.counts || {};
  const toShip = (c.APPROVED || 0) + (c.PARTIAL_APPROVED || 0);
  const oldestHours = stats.oldestPendingAt ? (now - new Date(stats.oldestPendingAt).getTime()) / HOUR : 0;

  const rowAction = (order) => {
    if (order.status === 'PENDING') {
      return <button onClick={(e) => { e.stopPropagation(); quickApprove(order); }} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold ring-1 ring-emerald-100 hover:bg-emerald-100"><CheckCircle className="h-3.5 w-3.5" /> Onayla</button>;
    }
    if (order.status === 'APPROVED' || order.status === 'PARTIAL_APPROVED') {
      return <button onClick={(e) => { e.stopPropagation(); openOrder(order); }} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-orange-50 text-orange-700 text-xs font-bold ring-1 ring-orange-100 hover:bg-orange-100"><Truck className="h-3.5 w-3.5" /> Kargola</button>;
    }
    if (order.status === 'SHIPPED') {
      return <button onClick={(e) => { e.stopPropagation(); handleComplete(order.id); }} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold ring-1 ring-blue-100 hover:bg-blue-100"><PackageCheck className="h-3.5 w-3.5" /> Teslim</button>;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {alertElement}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-3.5 rounded-2xl shadow-lg shadow-blue-500/25 shrink-0"><ShoppingCart className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Siparişler</h1>
            <p className="text-gray-500 text-sm mt-1">Onaylayın, kalem bazında karar verin, kargoya verin. Satıra tıklayınca detay açılır.</p>
          </div>
        </div>
        <button onClick={exportExcel} className="flex items-center h-11 px-4 rounded-2xl bg-white border border-gray-100 shadow-sm text-xs font-bold text-gray-600 hover:text-emerald-700 hover:border-emerald-200 shrink-0">
          <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel'e Aktar
        </button>
      </div>

      {/* Özet kartları: tıklayınca o duruma filtrelenir */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard icon={Hourglass} label="Onay bekleyen" value={c.PENDING || 0} tone="bg-orange-50 text-orange-600"
          sub={c.PENDING ? `${formatTRY(stats.pendingAmount)}${stats.oldestPendingAt ? ` · en eskisi ${timeAgo(stats.oldestPendingAt, now)}` : ''}` : 'Bekleyen sipariş yok'}
          active={filter === 'PENDING'} onClick={() => changeFilter(filter === 'PENDING' ? '' : 'PENDING')} />
        <SummaryCard icon={Package} label="Kargoya verilecek" value={toShip} tone="bg-emerald-50 text-emerald-600"
          sub={c.PARTIAL_APPROVED ? `${c.PARTIAL_APPROVED} tanesi kısmi onaylı` : 'Onaylanmış, gönderilmemiş'}
          active={filter === 'APPROVED'} onClick={() => changeFilter(filter === 'APPROVED' ? '' : 'APPROVED')} />
        <SummaryCard icon={Truck} label="Kargoda" value={c.SHIPPED || 0} tone="bg-blue-50 text-blue-600" sub="Teslim bekleniyor"
          active={filter === 'SHIPPED'} onClick={() => changeFilter(filter === 'SHIPPED' ? '' : 'SHIPPED')} />
        <SummaryCard icon={CheckCheck} label="Toplam sipariş" value={stats.total || 0} tone="bg-gray-100 text-gray-600"
          sub={`${c.COMPLETED || 0} teslim · ${c.CANCELLED || 0} iptal`} active={filter === ''} onClick={() => changeFilter('')} />
      </div>

      {oldestHours >= 24 && filter !== 'PENDING' && (
        <button onClick={() => { changeFilter('PENDING'); setSort('oldest'); }}
          className="w-full flex items-center gap-3 rounded-2xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-left text-sm text-amber-800 hover:bg-amber-100/70">
          <Clock className="h-4 w-4 shrink-0" />
          <span><b>{timeAgo(stats.oldestPendingAt, now)}</b> gelen bir sipariş hâlâ onay bekliyor. En eskiden başlayarak görmek için tıklayın.</span>
        </button>
      )}

      <div className="card-premium">
        {/* Durum sekmeleri */}
        <div className="flex gap-1 px-3 pt-3 border-b border-gray-100 overflow-x-auto">
          {TABS.map((t) => {
            const count = t.id ? c[t.id] || 0 : stats.total || 0;
            const on = filter === t.id;
            return (
              <button key={t.id} onClick={() => changeFilter(t.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 -mb-px border-b-2 text-sm font-bold whitespace-nowrap transition-colors ${on ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                {t.dot && <span className={`h-2 w-2 rounded-full ${t.dot}`} />}
                {t.label}
                <span className={`min-w-[1.5rem] px-1.5 py-0.5 rounded-md text-[11px] tabular-nums ${on ? 'bg-blue-100 text-blue-700' : t.id === 'PENDING' && count ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Arama ve filtreler */}
        <div className="flex flex-wrap gap-2 items-center p-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-[14rem]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input className="w-full h-10 pl-10 pr-3 rounded-xl bg-gray-50 border border-transparent text-sm font-semibold outline-none focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-100 placeholder:text-gray-400 placeholder:font-medium"
              placeholder="Sipariş no (AK-12) veya bayi adı" value={query} onChange={(e) => { setPage(1); setQuery(e.target.value); }} />
          </div>
          <div className="flex items-center gap-1 h-10 px-3 rounded-xl bg-gray-50 text-sm" title="Tarih aralığı">
            <CalendarRange className="h-4 w-4 text-gray-400" />
            <input type="date" className="bg-transparent outline-none text-xs font-semibold text-gray-700" value={range.from} onChange={(e) => { setPage(1); setRange({ ...range, from: e.target.value }); }} />
            <span className="text-gray-300">–</span>
            <input type="date" className="bg-transparent outline-none text-xs font-semibold text-gray-700" value={range.to} onChange={(e) => { setPage(1); setRange({ ...range, to: e.target.value }); }} />
            {(range.from || range.to) && <button onClick={() => setRange({ from: '', to: '' })} className="ml-1 text-gray-400 hover:text-gray-700" title="Temizle"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="flex items-center gap-1.5 h-10 pl-3 pr-1 rounded-xl bg-gray-50" title="Sıralama">
            <ArrowDownUp className="h-4 w-4 text-gray-400" />
            <select className="bg-transparent outline-none text-xs font-bold text-gray-700 pr-1 cursor-pointer" value={sort} onChange={(e) => { setPage(1); setSort(e.target.value); }}>
              <option value="">En yeni önce</option>
              <option value="oldest">En eski önce</option>
              <option value="amount">Tutar (yüksek)</option>
            </select>
          </div>
        </div>

        {/* Toplu işlem çubuğu */}
        {checked.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm">
            <span className="font-bold mr-2">{checked.size} sipariş seçildi</span>
            <button disabled={busy || !selPending.length} onClick={bulkApprove}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/15 hover:bg-white/25 font-bold text-xs disabled:opacity-40">
              <CheckCircle className="h-3.5 w-3.5" /> Onayla{selPending.length ? ` (${selPending.length})` : ''}
            </button>
            <button disabled={busy || !selShipped.length} onClick={bulkComplete}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/15 hover:bg-white/25 font-bold text-xs disabled:opacity-40">
              <PackageCheck className="h-3.5 w-3.5" /> Teslim edildi{selShipped.length ? ` (${selShipped.length})` : ''}
            </button>
            {busy && <span className="text-xs text-blue-100">İşleniyor…</span>}
            <button onClick={() => setChecked(new Set())} className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-blue-100 hover:text-white"><X className="h-3.5 w-3.5" /> Seçimi temizle</button>
          </div>
        )}

        {errorMsg && (
          <div className="m-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl">
            <p className="text-red-700 text-sm font-bold flex items-center"><AlertCircle className="h-4 w-4 mr-2" /> {errorMsg}</p>
            <button onClick={fetchOrders} className="mt-2 text-xs text-red-600 underline">Tekrar Dene</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="list-head">
              <tr className="text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">
                <th className="pl-4 pr-2 py-3 w-8"><input type="checkbox" className="h-4 w-4 rounded accent-blue-600 cursor-pointer" checked={allChecked} onChange={toggleAll} aria-label="Tümünü seç" /></th>
                <th className="px-3 py-3">Sipariş</th>
                <th className="px-3 py-3">Bayi</th>
                <th className="px-3 py-3">Tarih</th>
                <th className="px-3 py-3">Ödeme</th>
                <th className="px-3 py-3 text-right">Tutar</th>
                <th className="px-3 py-3">Durum</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/60">
              {isLoading ? (
                [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i}><td colSpan="8" className="px-4 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + (i % 3) * 12}%` }} /></td></tr>
                ))
              ) : orders.length === 0 ? (
                <tr><td colSpan="8" className="text-center py-20">
                  <Inbox className="h-12 w-12 mx-auto text-gray-200 mb-3" />
                  <p className="text-sm font-bold text-gray-500">Bu filtrede sipariş yok</p>
                  <p className="text-xs text-gray-400 mt-1">Farklı bir durum veya tarih aralığı seçin.</p>
                </td></tr>
              ) : orders.map((order, idx) => {
                const waitingHours = order.status === 'PENDING' ? (now - new Date(order.createdAt).getTime()) / HOUR : 0;
                const isOpen = selectedOrder?.id === order.id;
                const isChecked = checked.has(order.id);
                const cancelledItems = order.items.filter((i) => i.status === 'CANCELLED').length;
                return (
                  <tr key={order.id} onClick={() => openOrder(order)}
                    className={`group cursor-pointer transition-colors ${isOpen ? 'bg-blue-50/70 shadow-[inset_3px_0_0_0_#2563eb]' : isChecked ? 'bg-blue-50/40' : `${idx % 2 ? 'bg-slate-50/80' : 'bg-white'} hover:bg-blue-50/40 hover:shadow-[inset_3px_0_0_0_#3b82f6]`}`}>
                    <td className="pl-4 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="h-4 w-4 rounded accent-blue-600 cursor-pointer" checked={isChecked} onChange={() => toggleCheck(order.id)} aria-label={`#AK-${order.id} seç`} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <p className="font-mono text-sm font-bold text-gray-900">#AK-{order.id}</p>
                      <p className="text-[11px] text-gray-400">{order.items.length} kalem{cancelledItems ? ` · ${cancelledItems} iptal` : ''}
                        {order.invoice?.status === 'ISSUED' && <span className="ml-1.5 text-emerald-600 font-bold" title={`Fatura: ${order.invoice.number || ''}`}>· faturalı</span>}
                        {order.invoice?.status === 'FAILED' && <span className="ml-1.5 text-red-500 font-bold" title={order.invoice.errorMessage || ''}>· fatura hatası</span>}
                      </p>
                    </td>
                    <td className="px-3 py-3 max-w-[16rem]">
                      <p className="text-sm font-semibold text-gray-800 truncate">{order.company?.name}</p>
                      {order.couponCode && <p className="text-[11px] font-bold text-pink-600 flex items-center gap-1"><TicketPercent className="h-3 w-3" /> {order.couponCode}</p>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <p className="text-sm text-gray-700">{formatDate(order.createdAt, true)}</p>
                      <p className={`text-[11px] font-semibold ${waitingHours >= 24 ? 'text-red-500' : waitingHours >= 4 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {waitingHours >= 4 && <Clock className="inline h-3 w-3 mr-0.5 -mt-0.5" />}{timeAgo(order.createdAt, now)}
                      </p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                        {order.paymentMethod === 'WIRE_TRANSFER' ? <><Landmark className="h-3.5 w-3.5 text-gray-400" /> Havale/EFT</> : <><CreditCard className="h-3.5 w-3.5 text-gray-400" /> Cari</>}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <span className="text-sm font-black text-gray-900 tabular-nums">{formatTRY(order.totalAmount)}</span>
                    </td>
                    <td className="px-3 py-3"><StatusPill status={order.status} /></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{rowAction(order)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-semibold">{pagination.total} sipariş</span>
            <span className="text-gray-300">·</span>
            <label className="flex items-center gap-1">Sayfada
              <select className="bg-white border border-gray-200 rounded-lg px-1.5 py-1 font-bold text-gray-700" value={limit} onChange={(e) => { setPage(1); setLimit(Number(e.target.value)); }}>
                {[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          {pagination.pages > 1 && (
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-2 rounded-lg bg-white border border-gray-200 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-xs font-bold text-gray-600 px-2 tabular-nums">{page} / {pagination.pages}</span>
              <button disabled={page >= pagination.pages} onClick={() => setPage(page + 1)} className="p-2 rounded-lg bg-white border border-gray-200 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      </div>

      {/* Sağdan açılan sipariş detayı */}
      {selectedOrder && (() => {
        const order = selectedOrder;
        const editable = EDITABLE.includes(order.status);
        const approved = order.items.filter((i) => i.status !== 'CANCELLED');
        const net = approved.reduce((s, i) => s + i.price * i.quantity, 0);
        const vat = approved.reduce((s, i) => s + i.price * i.quantity * (i.vatRate / 100), 0);
        return (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="modal-backdrop" onClick={closeDetail} />
            <aside className="relative h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col animate-slide-in">
              <div className="modal-header items-start">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="modal-title text-xl font-mono">#AK-{order.id}</h3>
                    <StatusPill status={order.status} />
                  </div>
                  <p className="text-sm text-gray-600 mt-1 flex items-center gap-1.5"><Building2 className="h-4 w-4 text-gray-400" /> {order.company?.name}</p>
                  <p className="modal-subtitle">{formatDate(order.createdAt, true)} · {timeAgo(order.createdAt, now)} · {order.paymentMethod === 'WIRE_TRANSFER' ? 'Havale/EFT' : 'Cari hesap'}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Link to={`/print/order/${order.id}`} className="modal-close" title="Yazdır / PDF"><Printer className="h-5 w-5" /></Link>
                  <button onClick={closeDetail} className="modal-close" aria-label="Kapat"><X className="h-5 w-5" /></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
                {warehouses.length > 1 && (
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-blue-50/50 ring-1 ring-blue-100 px-4 py-3">
                    <WarehouseIcon className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-bold text-gray-800">Karşılanacak depo</span>
                    {editable ? (
                      <select value={warehouseId || warehouses.find((w) => w.isDefault)?.id || ''} onChange={(e) => setWarehouseId(Number(e.target.value))}
                        className="ml-auto h-9 rounded-xl bg-white border border-blue-200 px-3 text-sm font-semibold">
                        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}{w.isDefault ? ' (varsayılan)' : ''}</option>)}
                      </select>
                    ) : <span className="ml-auto text-sm font-semibold text-gray-600">{warehouses.find((w) => w.id === order.warehouseId)?.name || 'Varsayılan depo'}</span>}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-gray-900">Kalemler <span className="text-gray-400 font-semibold">({order.items.length})</span></h4>
                  {editable && order.items.length > 1 && (
                    <div className="flex gap-2 text-xs font-bold">
                      <button onClick={() => setSelectedOrder({ ...order, items: order.items.map((i) => ({ ...i, status: 'APPROVED' })) })} className="text-emerald-600 hover:underline">Tümünü onayla</button>
                      <span className="text-gray-300">|</span>
                      <button onClick={() => setSelectedOrder({ ...order, items: order.items.map((i) => ({ ...i, status: 'CANCELLED' })) })} className="text-red-500 hover:underline">Tümünü iptal</button>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl ring-1 ring-gray-100 divide-y divide-gray-100 overflow-hidden">
                  {order.items.map((item) => {
                    const off = item.status === 'CANCELLED';
                    return (
                      <div key={item.id} className={`flex items-center gap-3 p-3.5 ${off ? 'bg-red-50/40' : 'bg-white'}`}>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold truncate ${off ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{item.product?.parent?.name || item.product?.name}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="font-mono text-[10px] font-semibold text-gray-500 bg-gray-100/80 px-1.5 py-0.5 rounded-md">{item.product?.sku}</span>
                            {item.variantLabel && <span className="text-[11px] font-bold text-indigo-600">{item.variantLabel}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-gray-900 tabular-nums">{item.quantity} {item.product?.unit}</p>
                          <p className="text-[11px] text-gray-400 tabular-nums">× {formatTRY(item.price)}</p>
                        </div>
                        <p className={`w-24 text-right text-sm font-black tabular-nums shrink-0 ${off ? 'text-gray-300 line-through' : 'text-gray-900'}`}>{formatTRY(item.price * item.quantity)}</p>
                        {editable ? (
                          <div className="flex bg-gray-100 p-0.5 rounded-lg shrink-0">
                            <button onClick={() => setItemStatus(item.id, 'APPROVED')} title="Onayla"
                              className={`p-1.5 rounded-md transition-all ${!off ? 'bg-emerald-500 text-white shadow' : 'text-gray-400 hover:text-emerald-600'}`}><CheckCircle className="h-4 w-4" /></button>
                            <button onClick={() => setItemStatus(item.id, 'CANCELLED')} title="İptal et"
                              className={`p-1.5 rounded-md transition-all ${off ? 'bg-red-500 text-white shadow' : 'text-gray-400 hover:text-red-600'}`}><Ban className="h-4 w-4" /></button>
                          </div>
                        ) : (
                          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${off ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>{off ? 'İptal' : 'Onaylı'}</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-2xl bg-gray-50 p-4 space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600"><span>Ara toplam ({approved.length} kalem)</span><span className="tabular-nums">{formatTRY(net)}</span></div>
                  {order.couponCode && <div className="flex justify-between text-pink-600 font-semibold"><span>Kupon {order.couponCode}</span><span className="tabular-nums">−{formatTRY(order.discountAmount)}</span></div>}
                  <div className="flex justify-between text-gray-600"><span>KDV</span><span className="tabular-nums">{formatTRY(vat)}</span></div>
                  <div className="flex justify-between pt-2 border-t border-gray-200 font-black text-gray-900"><span>Kayıtlı sipariş tutarı</span><span className="tabular-nums">{formatTRY(order.totalAmount)}</span></div>
                  {editable && <p className="text-[11px] text-gray-400 pt-1">Kalem iptal ederseniz tutar ve kupon indirimi kaydettiğinizde yeniden hesaplanır.</p>}
                </div>

                {/* Teslimat adresi */}
                <div className="rounded-2xl ring-1 ring-gray-100 p-4">
                  <h4 className="text-sm font-black text-gray-900 flex items-center gap-2 mb-1.5"><MapPin className="h-4 w-4 text-blue-500" /> Teslimat adresi</h4>
                  {order.shippingAddress ? (
                    <div className="text-sm text-gray-700">
                      <p className="font-bold">{order.shippingAddress.title} · {order.shippingAddress.contactName} {order.shippingAddress.phone && <span className="text-gray-400 font-normal">· {order.shippingAddress.phone}</span>}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatAddress(order.shippingAddress)}</p>
                    </div>
                  ) : <p className="text-xs text-gray-400">{order.company?.address || 'Adres girilmemiş.'}</p>}
                </div>

                <InvoicePanel key={order.id} orderId={order.id} orderStatus={order.status} canManage onError={(message) => showAlert({ type: 'error', title: 'Fatura', message })} />

                {SHIPPABLE.includes(order.status) && (
                  <div className="rounded-2xl ring-1 ring-orange-100 bg-orange-50/40 p-4 space-y-3">
                    <h4 className="text-sm font-black text-gray-900 flex items-center gap-2"><Truck className="h-4 w-4 text-orange-500" /> Kargo</h4>
                    {stats.cargoEnabled && order.status !== 'SHIPPED' && (
                      order.shipmentKey && order.shipmentStatus !== 'CANCELLED' ? (
                        <div className="rounded-xl bg-white ring-1 ring-orange-100 p-3 space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-bold text-gray-900">{order.shipmentKey}</span>
                            <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 font-bold">{order.shipmentInfo || 'Gönderi oluşturuldu'}</span>
                          </div>
                          <p className="text-[11px] text-gray-500">Etiketi yazdırıp pakete yapıştırın. Kargo paketi teslim alınca takip numarası otomatik gelir ve sipariş “Kargoda” olur.</p>
                          <div className="flex flex-wrap gap-2">
                            <Link to={`/print/label/${order.id}`} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gray-900 text-white text-xs font-bold"><Printer className="h-3.5 w-3.5" /> Etiketi yazdır</Link>
                            <button onClick={() => shipmentAction('POST', '/refresh')} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200"><RefreshCw className="h-3.5 w-3.5" /> Durumu güncelle</button>
                            <button onClick={() => shipmentAction('DELETE', '')} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-red-600 text-xs font-bold hover:bg-red-50"><Ban className="h-3.5 w-3.5" /> Gönderiyi iptal et</button>
                          </div>
                        </div>
                      ) : order.status !== 'PENDING' && (
                        <button onClick={() => shipmentAction('POST', '')} className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-orange-500 text-white text-xs font-black uppercase tracking-wider hover:bg-orange-600">
                          <Truck className="h-4 w-4" /> Yurtiçi Kargo gönderisi oluştur
                        </button>
                      )
                    )}
                    {stats.cargoEnabled && order.status !== 'SHIPPED' && <p className="text-[11px] text-gray-400">ya da başka bir kargo firmasıyla gönderdiyseniz takip numarasını elle girin:</p>}
                    {order.trackingNumber && (
                      <p className="text-xs text-gray-600">Mevcut: {carrierName(order.cargoCompany)} <b className="text-blue-600">{order.trackingNumber}</b>
                        {trackingUrl(order.cargoCompany, order.trackingNumber) && <a href={trackingUrl(order.cargoCompany, order.trackingNumber)} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center text-indigo-600 font-bold">takip et <ExternalLink className="h-3 w-3 ml-0.5" /></a>}
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select value={cargoCompany} onChange={(e) => setCargoCompany(e.target.value)} className="h-10 rounded-xl bg-white border border-gray-200 px-3 text-sm outline-none focus:ring-4 focus:ring-orange-100 focus:border-orange-300">
                        <option value="">Kargo firması</option>
                        {Object.entries(CARRIERS).map(([code, cr]) => <option key={code} value={code}>{cr.name}</option>)}
                      </select>
                      <input type="text" placeholder="Takip numarası" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)}
                        className="h-10 rounded-xl bg-white border border-gray-200 px-3 text-sm font-mono outline-none focus:ring-4 focus:ring-orange-100 focus:border-orange-300" />
                    </div>
                  </div>
                )}
                {order.status === 'PENDING' && <p className="text-xs text-gray-400 flex items-center gap-1.5"><Undo2 className="h-3.5 w-3.5" /> Kargoya vermek için önce siparişi onaylayın.</p>}
              </div>

              <div className="modal-footer items-center flex-wrap">
                {editable && (
                  <button onClick={() => handlePartialApprove(selectedOrder)} className="btn-gradient h-12 py-0 px-6 flex-1">
                    <CheckCircle className="h-4 w-4 mr-2" /> {order.status === 'PENDING' ? 'KARARI KAYDET' : 'GÜNCELLE'}
                  </button>
                )}
                {SHIPPABLE.includes(order.status) && (
                  <button onClick={() => handleShip(order.id)} className="h-12 px-5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center flex-1">
                    <Truck className="h-4 w-4 mr-2" /> {order.status === 'SHIPPED' ? 'Takip No Güncelle' : 'Kargoya Ver'}
                  </button>
                )}
                {order.status === 'SHIPPED' && (
                  <button onClick={() => handleComplete(order.id)} className="h-12 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center flex-1">
                    <PackageCheck className="h-4 w-4 mr-2" /> Teslim Edildi
                  </button>
                )}
                {!editable && !SHIPPABLE.includes(order.status) && <button onClick={closeDetail} className="btn-secondary flex-1">KAPAT</button>}
              </div>
            </aside>
          </div>
        );
      })()}
    </div>
  );
};

export default OrderApproval;
