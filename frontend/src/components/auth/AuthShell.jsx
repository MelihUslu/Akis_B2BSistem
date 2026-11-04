import { Store, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import LanguageSwitcher from '../LanguageSwitcher';
import { Frame } from '../../pages/root/landing/ui';

/**
 * Giriş ailesi ekranlarının ortak çerçevesi (giriş, şifremi unuttum, yeni şifre, e-posta doğrulama, platform girişi).
 * Görünüm ortak girişle (/giris) aynıdır: üstte firmanın logosu / adı, ortada çift çerçeveli kart, altında isteğe bağlı kutu.
 * brand verilirse firma yerine o ad görünür (platform paneli). iconClass: ikon kutusunun rengi (durum ekranlarında yeşil / kırmızı).
 */
const AuthShell = ({ icon: Icon, title, text, children, below, brand, languages = true, iconClass = 'bg-navy-900 text-white' }) => {
  const { tenant } = useTenant();
  const name = brand || tenant?.name || 'B2B Portal';
  const logo = !brand && tenant?.logoUrl;
  return (
    <div className="min-h-screen bg-navy-50 text-slate-900 antialiased pb-16">
      <header className="sticky top-3 z-40 px-3 md:px-6">
        <div className="max-w-6xl mx-auto h-16 flex items-center justify-between gap-4 px-4 md:px-6 rounded-2xl bg-white/90 backdrop-blur border border-white shadow-[0_8px_30px_-15px_rgba(15,23,42,0.25)]">
          {logo ? (
            <img src={logo} alt={name} className="h-10 max-w-[12rem] object-contain" />
          ) : (
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-navy-900 flex items-center justify-center shadow-md"><Store className="h-5 w-5 text-white" /></span>
              <span className="text-lg font-semibold tracking-tight truncate">{name}</span>
            </span>
          )}
          {languages && <LanguageSwitcher />}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-6 md:pt-14">
        <Frame inner="p-7 md:p-10">
          <span className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-md ${iconClass}`}><Icon className="h-5 w-5" /></span>
          <h1 className="mt-6 text-2xl md:text-[1.75rem] font-semibold tracking-[-0.03em]">{title}</h1>
          {text && <div className="mt-2 text-sm text-slate-500">{text}</div>}
          <div className="mt-6">{children}</div>
        </Frame>
        {below}
      </main>
    </div>
  );
};

// Kart içi bilgi / hata kutusu
export const AuthNotice = ({ ok, children }) => (
  <p className={`flex items-start gap-2 text-xs font-bold p-3 rounded-xl ${ok ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
    {ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />} <span>{children}</span>
  </p>
);

// Kart altındaki kesik çizgili kutu (ör. "Bayimiz değil misiniz? Bayilik başvurusu yapın")
export const AuthBelow = ({ icon: Icon = Store, children }) => (
  <div className="mt-5 rounded-2xl border border-dashed border-slate-300 px-5 py-4 flex items-center gap-3">
    <span className="h-9 w-9 shrink-0 rounded-xl bg-brand-50 flex items-center justify-center"><Icon className="h-4 w-4 text-brand-600" /></span>
    {children}
  </div>
);

export default AuthShell;
