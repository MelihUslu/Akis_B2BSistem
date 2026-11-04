import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import TenantBrand from '../TenantBrand';
import NotificationBell from '../NotificationBell';

// Plasiyer panelinin üst çubuğu: firma, bildirimler, plasiyerin adı, çıkış (Bayilerim ve Personel Alanım sayfalarında ortak)
const PlasiyerHeader = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 bg-navy-900 text-white">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <div className="min-w-0 truncate"><TenantBrand textClass="text-white !text-base" onDark /></div>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <NotificationBell dark />
          <div className="text-right min-w-0">
            <p className="text-sm font-bold truncate">{user?.name}</p>
            <p className="text-[11px] font-bold text-brand-300 uppercase tracking-wider">Plasiyer</p>
          </div>
          <button onClick={() => { logout(); navigate('/login'); }} className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10" aria-label="Çıkış yap" title="Çıkış yap"><LogOut className="h-5 w-5" /></button>
        </div>
      </div>
    </header>
  );
};

export default PlasiyerHeader;
