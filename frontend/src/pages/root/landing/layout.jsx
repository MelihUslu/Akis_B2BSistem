import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogIn, Menu, Store, X } from 'lucide-react';
import { SiteFooter } from './sections';
import { NAV } from './data';


// Menü bağlantıları ana sayfada aynı sayfadaki bölüme, iç sayfalarda ana sayfanın o bölümüne gider
const navHref = (id, home) => (home ? `#${id}` : `/#${id}`);

// Tüm tanıtım sayfalarında ortak menü çubuğu. Bulunulan sayfanın düğmesi (Giriş / Ücretsiz başla) vurgulanır.
export const SiteHeader = ({ brand }) => {
  const { pathname } = useLocation();
  const home = pathname === '/';
  const [menuOpen, setMenuOpen] = useState(false);
  const onLogin = pathname === '/giris';
  const navLink = ([label, id], className, onClick) => (home
    ? <a key={id} href={navHref(id, true)} className={className} onClick={onClick}>{label}</a>
    : <Link key={id} to={navHref(id, false)} className={className} onClick={onClick}>{label}</Link>);

  return (
    <header className="sticky top-3 z-40 px-3 md:px-6">
      <div className="max-w-6xl mx-auto h-16 flex items-center justify-between gap-4 px-4 md:px-6 rounded-2xl bg-white/90 backdrop-blur border border-white shadow-[0_8px_30px_-15px_rgba(15,23,42,0.25)]">
        <Link to="/" onClick={() => home && window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5 shrink-0">
          <span className="h-9 w-9 rounded-xl bg-navy-900 flex items-center justify-center shadow-md"><Store className="h-5 w-5 text-white" /></span>
          <span className="text-lg font-semibold tracking-tight">{brand}</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-[15px] font-medium text-slate-700">
          {NAV.map((n) => navLink(n, 'hover:text-slate-950'))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <Link to="/giris" className={`h-10 px-3 flex items-center text-[15px] font-medium hover:text-slate-950 ${onLogin ? 'text-slate-950 underline underline-offset-8 decoration-2 decoration-brand-500' : 'text-slate-700'}`}>Giriş yap</Link>
          <Link to="/kayit" className="h-11 px-5 rounded-xl bg-navy-900 text-white text-[15px] font-semibold flex items-center hover:bg-navy-950">Ücretsiz başla</Link>
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 -mr-2 text-slate-700" aria-label="Menü">{menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}</button>
      </div>
      {menuOpen && (
        <div className="md:hidden max-w-6xl mx-auto mt-2 rounded-2xl bg-white border border-slate-200 shadow-xl p-4 space-y-4">
          <nav className="grid gap-1">{NAV.map((n) => navLink(n, 'px-3 py-2.5 rounded-xl text-[15px] font-medium hover:bg-slate-50', () => setMenuOpen(false)))}</nav>
          <Link to="/giris" onClick={() => setMenuOpen(false)} className="h-11 rounded-xl border border-slate-200 text-sm font-semibold flex items-center justify-center gap-2 text-slate-700"><LogIn className="h-4 w-4" /> Giriş yap</Link>
          <Link to="/kayit" onClick={() => setMenuOpen(false)} className="h-11 rounded-xl bg-navy-900 text-white text-sm font-semibold flex items-center justify-center">Ücretsiz başla</Link>
        </div>
      )}
    </header>
  );
};

// İç sayfaların alt bilgisi: ana sayfadaki koyu çerçeve içinde aynı alt bilgi
export const PageFooter = ({ company, brand }) => {
  const { pathname } = useLocation();
  const nav = NAV.map(([l, id]) => [l, navHref(id, pathname === '/')]);
  return (
    <div className="px-3 md:px-6 pt-20 md:pt-28 pb-3 md:pb-6">
      <div className="max-w-[90rem] mx-auto rounded-[2.5rem] overflow-hidden bg-navy-900 p-3 md:p-4">
        <SiteFooter company={company} brand={brand} nav={nav} className="mt-0" />
      </div>
    </div>
  );
};
