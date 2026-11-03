import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Package, Wallet, RotateCcw, ShoppingCart, Info, Inbox, MessageCircle, Target } from 'lucide-react';
import api from '../services/api';
import { formatDate } from '../utils/format';
import { t } from '../i18n';
import { enablePush, syncPush } from '../utils/push';

const POLL_MS = 30000;

const TYPE_ICON = {
  ORDER: ShoppingCart,
  PAYMENT_DUE: Wallet,
  PAYMENT: Wallet,
  STOCK: Package,
  RETURN: RotateCcw,
  LEAD: Inbox,
  MESSAGE: MessageCircle,
  BUDGET: Target,
};

const browserNotificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

/**
 * Uygulama içi bildirim zili. 30 sn'de bir yeni bildirimleri çeker; kullanıcı izin verdiyse
 * yeni gelenleri tarayıcı (push) bildirimi olarak da gösterir.
 */
const NotificationBell = ({ dark = false }) => {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState(browserNotificationsSupported() ? Notification.permission : 'unsupported');
  const seenIds = useRef(null);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  const fetchNotifications = () => api.get('/notifications').then((res) => {
      const list = res.data.items;

      // İlk yüklemede gelenler "görülmüş" sayılır; sonrakilerde yeni okunmamışlar için tarayıcı bildirimi
      if (seenIds.current && browserNotificationsSupported() && Notification.permission === 'granted') {
        list
          .filter((n) => !n.isRead && !seenIds.current.has(n.id))
          .forEach((n) => new Notification(n.title, { body: n.message, tag: `n${n.id}` })); // push ile aynı etiket: çift bildirim olmaz
      }
      seenIds.current = new Set(list.map((n) => n.id));

      setItems(list);
      setUnread(res.data.unreadCount);
    }).catch(() => {
      // Sessizce yoksay: bir sonraki turda tekrar denenir
    });

  useEffect(() => {
    syncPush(); // izin daha önce verildiyse bu cihazın push aboneliğini tazeler
    fetchNotifications();
    const timer = setInterval(fetchNotifications, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onClick = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const openItem = async (n) => {
    if (!n.isRead) {
      api.patch(`/notifications/${n.id}/read`).catch(() => {});
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    await api.post('/notifications/read-all').catch(() => {});
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    setUnread(0);
  };

  const requestPermission = async () => {
    if (!browserNotificationsSupported()) return;
    setPermission(await enablePush());
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`relative p-2 rounded-xl transition-all ${dark ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50'}`}
        title={t('Bildirimler')}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full border-2 border-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <p className="text-sm font-black text-gray-900">{t('Bildirimler')}</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center hover:underline">
                <CheckCheck className="h-3.5 w-3.5 mr-1" /> {t('Tümünü okundu yap')}
              </button>
            )}
          </div>

          {permission === 'default' && (
            <button onClick={requestPermission} className="w-full text-left px-5 py-3 bg-indigo-50 text-[11px] font-bold text-indigo-700 flex items-center">
              <Info className="h-4 w-4 mr-2 flex-shrink-0" /> {t('Masaüstü bildirimlerini açmak için tıklayın')}
            </button>
          )}

          <div className="max-h-[26rem] overflow-y-auto custom-scrollbar divide-y divide-gray-50">
            {items.length === 0 ? (
              <p className="text-center text-xs font-bold text-gray-400 py-10">{t('Henüz bildiriminiz yok.')}</p>
            ) : items.map((n) => {
              const Icon = TYPE_ICON[n.type] || Bell;
              return (
                <button key={n.id} onClick={() => openItem(n)} className={`w-full text-left px-5 py-4 flex gap-3 hover:bg-gray-50 transition-colors ${n.isRead ? '' : 'bg-indigo-50/40'}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${n.isRead ? 'bg-gray-100 text-gray-400' : 'bg-indigo-100 text-indigo-600'}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs leading-snug ${n.isRead ? 'font-semibold text-gray-600' : 'font-black text-gray-900'}`}>{n.title}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                    <p className="text-[10px] text-gray-300 font-bold mt-1">{formatDate(n.createdAt, true)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
