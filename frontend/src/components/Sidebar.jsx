import { useEffect, useState } from 'react';
import api from '../services/api';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import TenantBrand from './TenantBrand';
import { can } from '../utils/permissions';
import { 
  LayoutDashboard, Package, ShoppingCart, CreditCard, BarChart3, Settings, LogOut, UserCheck, ChevronLeft, ChevronRight, RotateCcw, Crown, FileSignature, TicketPercent, X, BookUser, Inbox, MessageCircle, ChevronDown, Tags, Briefcase, Users, Wallet, FolderTree, Scale, IdCard, UserRound, Contact
} from 'lucide-react';

// Menü: tek bağlantılar ve açılır gruplar. perm: tek yetki ya da yetkilerden biri yeterli
const MENU = [
  { name: 'Ana Sayfa', path: '/admin', icon: LayoutDashboard },
  { key: 'catalog', name: 'Katalog', icon: Tags, items: [
    { name: 'Ürün Yönetimi', path: '/admin/products', icon: Package, perm: 'CATALOG' },
    { name: 'Kategoriler', path: '/admin/categories', icon: FolderTree, perm: 'CATALOG' },
    { name: 'Kampanyalar', path: '/admin/coupons', icon: TicketPercent, perm: 'CATALOG' },
  ] },
  { key: 'sales', name: 'Satış', icon: Briefcase, items: [
    { name: 'Siparişler', path: '/admin/orders', badge: 'orders', icon: ShoppingCart, perm: 'ORDERS' },
    { name: 'Teklifler', path: '/admin/quotes', badge: 'quotes', icon: FileSignature, perm: 'QUOTES' },
    { name: 'İade / RMA', path: '/admin/returns', badge: 'returns', icon: RotateCcw, perm: 'ORDERS' },
  ] },
  { key: 'customers', name: 'Müşteriler', icon: Users, items: [
    { name: 'Bayi Yönetimi', path: '/admin/dealers', badge: 'dealers', icon: UserCheck, perm: 'DEALERS' },
    { name: 'Müşteri Adayları', path: '/admin/leads', badge: 'leads', icon: Inbox, perm: 'LEADS' },
    { name: 'WhatsApp', path: '/admin/whatsapp', badge: 'whatsapp', icon: MessageCircle, perm: ['MESSAGES', 'SETTINGS'] },
  ] },
  { key: 'finance', name: 'Finans', icon: Wallet, items: [
    { name: 'Cari Hesaplar', path: '/admin/partners', icon: BookUser, perm: ['FINANCE', 'DEALERS'] },
    { name: 'Finans & Prim', path: '/admin/finance', icon: CreditCard, perm: 'FINANCE' },
    { name: 'Gelir-Gider', path: '/admin/cash', icon: Scale, perm: 'FINANCE' },
  ] },
  // Personel: firma modülü açtıysa (module). Personel Alanım tüm ekip üyelerine açık (kartı yoksa sayfa söyler)
  { key: 'hr', name: 'Personel', icon: Contact, module: 'hr', items: [
    { name: 'Personel Yönetimi', path: '/admin/personel', badge: 'hr', icon: IdCard, perm: ['HR', 'FINANCE'] },
    { name: 'Personel Alanım', path: '/admin/personel-alanim', icon: UserRound },
  ] },
  { name: 'Raporlar', path: '/admin/reports', icon: BarChart3, perm: ['ORDERS', 'FINANCE'] },
  { name: 'Abonelik', path: '/admin/subscription', icon: Crown, perm: 'SETTINGS' },
];

// Rozet: ilgilenilmesi gereken iş sayısı (bekleyen sipariş, ekip bekleyen WhatsApp…); dakikada bir ve sayfa değişince yenilenir
const COUNTS_MS = 60000;
const Badge = ({ n, dot }) => (n > 0
  ? (dot
    ? <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-navy-900" />
    : <span className="ml-auto h-5 min-w-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center">{n > 99 ? '99+' : n}</span>)
  : null);

// Açık bırakılan gruplar tarayıcıda hatırlanır
const OPEN_KEY = 'akis_menu_open';
const readOpen = () => { try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'); } catch { return []; } };
const saveOpen = (list) => { try { localStorage.setItem(OPEN_KEY, JSON.stringify(list)); } catch { /* gizli sekme */ } };

// Menü altındaki abonelik kutusu yalnızca dikkat gereken durumlarda görünür (abonelik normalse gösterilmez)
const PLAN_BOX = {
  TRIAL: { title: 'DENEME SÜRÜMÜ', text: 'Deneme süreniz bitmeden bir paket seçin.', cta: 'Paketleri Gör' },
  TRIAL_EXPIRED: { title: 'DENEME BİTTİ', text: 'Bayileriniz portala giremiyor.', cta: 'Paket Seç' },
  EXPIRED: { title: 'SÜRE DOLDU', text: 'Bayileriniz portala giremiyor.', cta: 'Ödeme Yap' },
  PAST_DUE: { title: 'ÖDEME BEKLENİYOR', text: 'Son ödemeniz alınamadı.', cta: 'Abonelik' },
};

// mobile: telefonda çekmece olarak açılır (daraltma yok); onNavigate menüyü kapatır
const Sidebar = ({ mobile = false, onNavigate }) => {
  const [collapsedState, setIsCollapsed] = useState(false);
  const isCollapsed = !mobile && collapsedState;
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { tenant } = useTenant();
  const planBox = PLAN_BOX[tenant?.access?.reason] || null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const [openGroups, setOpenGroups] = useState(readOpen);
  const [counts, setCounts] = useState({});
  useEffect(() => {
    const load = () => api.get('/dashboard/menu-counts').then((r) => setCounts(r.data)).catch(() => {});
    load();
    const t = setInterval(load, COUNTS_MS);
    return () => clearInterval(t);
  }, [location.pathname]);
  const countOf = (item) => (item.badge ? counts[item.badge] || 0 : 0);
  const allowed = (item) => !item.perm || [].concat(item.perm).some((p) => can(user, p));
  const menu = MENU
    .filter((m) => !m.module || tenant?.modules?.[m.module])
    .map((m) => (m.items ? { ...m, items: m.items.filter(allowed) } : m))
    .filter((m) => (m.items ? m.items.length > 0 : allowed(m)));
  const isActivePath = (path) => (path === '/admin' ? location.pathname === '/admin' : location.pathname === path || location.pathname.startsWith(`${path}/`));
  const toggleGroup = (key) => {
    const next = openGroups.includes(key) ? openGroups.filter((k) => k !== key) : [...openGroups, key];
    setOpenGroups(next);
    saveOpen(next);
  };

  const link = (item, child = false) => (
    <NavLink
      key={item.path}
      to={item.path}
      end={item.path === '/admin'}
      onClick={onNavigate}
      title={isCollapsed ? item.name : ''}
      className={({ isActive }) => `
        relative flex items-center rounded-2xl transition-all duration-300 group
        ${isCollapsed ? 'justify-center p-3.5' : child ? 'pl-4 pr-4 py-2.5' : 'px-5 py-3.5'}
        ${isActive
          ? 'bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-lg shadow-black/20'
          : 'text-white/70 hover:text-white hover:bg-white/5'}
      `}
    >
      <item.icon className={`transition-all duration-700 ${isCollapsed ? 'h-7 w-7' : child ? 'h-4 w-4 mr-3.5' : 'h-5 w-5 mr-4'} ${isActivePath(item.path) ? 'text-white' : 'text-navy-300 group-hover:text-white'}`} />
      {!isCollapsed && <span className={`${child ? 'text-[13px]' : 'text-sm'} font-bold whitespace-nowrap`}>{item.name}</span>}
      <Badge n={countOf(item)} dot={isCollapsed} />
    </NavLink>
  );

  return (
    <aside className={`
      ${isCollapsed ? 'w-24' : 'w-72'} 
      ${mobile ? 'flex h-full overflow-y-auto' : 'hidden lg:flex h-screen sticky top-0'} flex-col py-6 transition-all duration-700 ease-in-out relative z-50
      bg-navy-900
    `}>
      {/* Collapse Toggle Button */}
      {mobile ? (
        <button onClick={onNavigate} className="absolute right-4 top-6 p-2 text-gray-400 hover:text-white" aria-label="Menüyü kapat"><X className="h-5 w-5" /></button>
      ) : (
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-10 bg-brand-600 text-white p-1.5 rounded-full shadow-lg hover:bg-brand-700 transition-colors z-[60]"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      )}

      {/* Logo Section */}
      <div className={`px-8 mb-6 transition-all ${isCollapsed ? 'px-6' : 'px-8'}`}>
        <div className="flex items-center group cursor-pointer">
          <TenantBrand compact={isCollapsed} textClass="text-white" onDark />
        </div>
      </div>

      {/* Main Menu */}
      <nav className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 space-y-1.5">
        {menu.map((m) => {
          if (!m.items) return link(m);
          // Daraltılmış menüde gruplar ince çizgiyle ayrılır, alt bağlantılar ikon olarak görünür
          if (isCollapsed) return <div key={m.key} className="pt-2 mt-2 border-t border-white/5 space-y-1.5">{m.items.map((i) => link(i))}</div>;
          const hasActive = m.items.some((i) => isActivePath(i.path));
          const open = hasActive || openGroups.includes(m.key);
          return (
            <div key={m.key}>
              <button type="button" onClick={() => toggleGroup(m.key)} aria-expanded={open}
                className={`w-full flex items-center px-5 py-3.5 rounded-2xl transition-colors group ${hasActive ? 'text-white' : 'text-white/85 hover:text-white hover:bg-white/5'}`}>
                <m.icon className={`h-5 w-5 mr-4 text-brand-400`} />
                <span className="text-sm font-bold whitespace-nowrap flex-1 text-left">{m.name}</span>
                {!open && <span className="mr-2"><Badge n={m.items.reduce((sum, i) => sum + countOf(i), 0)} /></span>}
                <ChevronDown className={`h-4 w-4 text-navy-300 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
              </button>
              <div className={`grid transition-[grid-template-rows] duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden" inert={!open}>
                  <div className="ml-7 pl-3 border-l border-white/10 space-y-1 py-1">{m.items.map((i) => link(i, true))}</div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Abonelik uyarısı (deneme / süre doldu / ödeme bekleniyor; menü açıkken) */}
      {planBox && !isCollapsed && can(user, 'SETTINGS') && (
        <div className="px-6 mb-6 animate-in fade-in duration-500">
          <div className={`rounded-2xl p-5 border transition-all duration-700 bg-gradient-to-br from-brand-600/20 to-brand-800/20 border-brand-500/20`}>
            <p className="text-[11px] font-black text-brand-500 uppercase tracking-widest mb-1">{planBox.title}</p>
            <p className={`text-[11px] leading-relaxed mb-3 transition-colors duration-700 text-gray-400`}>{planBox.text}</p>
            <button onClick={() => { onNavigate?.(); navigate('/admin/subscription'); }} className="w-full py-2.5 bg-brand-600 text-white text-[11px] font-black rounded-lg hover:bg-brand-700 transition-colors">{planBox.cta}</button>
          </div>
        </div>
      )}

      {/* Ayarlar ve Çıkış masaüstünde sağ üstteki kullanıcı menüsünde; telefonda açılan menüde burada da durur */}
      {mobile && <div className="px-4 space-y-2">
        {can(user, 'SETTINGS') && <NavLink
          to="/admin/settings"
          onClick={onNavigate}
          title={isCollapsed ? 'Ayarlar' : ''}
          className={`flex items-center rounded-2xl text-sm font-bold transition-all duration-700 group ${isCollapsed ? 'justify-center p-4' : 'px-5 py-4'} text-gray-400 hover:text-white hover:bg-white/5`}
        >
          <Settings className={`transition-all duration-700 ${isCollapsed ? 'h-7 w-7' : 'h-5 w-5 mr-4'} text-gray-500 group-hover:text-gray-300`} />
          {!isCollapsed && <span className="whitespace-nowrap">Ayarlar</span>}
        </NavLink>}
        <button 
          onClick={handleLogout}
          title={isCollapsed ? 'Çıkış Yap' : ''}
          className={`w-full flex items-center rounded-2xl text-sm font-bold text-red-500 hover:bg-red-500/10 transition-all group ${isCollapsed ? 'justify-center p-4' : 'px-5 py-4'}`}
        >
          <LogOut className={`transition-all duration-700 ${isCollapsed ? 'h-7 w-7' : 'h-5 w-5 mr-4'} text-red-500/60 group-hover:text-red-500`} />
          {!isCollapsed && <span className="whitespace-nowrap">Çıkış Yap</span>}
        </button>
      </div>}
    </aside>
  );
};

export default Sidebar;
