import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { publicApi } from '../../services/api';
import { captureUtm, getConsent, setConsent, loadTracking } from '../../utils/site';
import ChatWidget from '../../components/site/ChatWidget';
import Landing from './Landing';
import Signup, { SignupDone } from './Signup';
import Login from './Login';
import LegalPage from './legal/LegalPage';
import { LEGAL_PAGES } from './legal/texts';

// Ölçüm kimliği tanımlıysa çerez onayı sorulur; ölçüm kodları yalnızca "Kabul et" ile yüklenir
const CookieBanner = ({ tracking }) => {
  const needed = Boolean(tracking?.metaPixelId || tracking?.googleTagId);
  const [answer, setAnswer] = useState(getConsent);
  useEffect(() => { if (answer === 'all') loadTracking(tracking); }, [answer, tracking]);
  if (!needed || answer) return null;
  const choose = (v) => { setConsent(v); setAnswer(v); };
  return (
    <div className="fixed left-3 right-3 md:left-6 md:right-auto bottom-3 md:bottom-6 z-[60] md:max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-5">
      <p className="text-sm text-slate-700">Sitemizi geliştirmek ve reklamlarımızın etkinliğini ölçmek için çerezler kullanıyoruz. Ayrıntılar: <Link to="/cerez-politikasi" className="underline">Çerez Politikası</Link>.</p>
      <div className="mt-4 flex gap-2">
        <button onClick={() => choose('necessary')} className="flex-1 h-10 rounded-xl bg-slate-100 text-sm font-semibold text-slate-700">Yalnızca zorunlu</button>
        <button onClick={() => choose('all')} className="flex-1 h-10 rounded-xl bg-[#0b1120] text-white text-sm font-semibold">Kabul et</button>
      </div>
    </div>
  );
};

// Sayfa değişince başa döner; iç sayfadan /#paketler gibi bir bağlantıyla gelindiyse o bölüme kayar
const ScrollTop = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return undefined; }
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 50);
    return () => clearTimeout(t);
  }, [pathname, hash]);
  return null;
};

/**
 * Kök alan adı (tanıtım sitesi): ana sayfa, kayıt (/kayit), giriş (/giris), yasal metinler, canlı sohbet, çerez onayı.
 * Site ayarları (firma bilgileri, chatbot, demo, ölçüm) platform panelinden yönetilir.
 */
const RootApp = () => {
  const [site, setSite] = useState(null);
  // Kayıt ve giriş sayfalarında sohbet balonu gösterilmez (yalnızca "Ekibimize yazın" ile açılır)
  const { pathname } = useLocation();
  const onSignup = pathname.startsWith('/kayit') || pathname === '/giris';
  useEffect(() => {
    captureUtm();
    publicApi.get('/site').then((r) => setSite(r.data)).catch(() => setSite({}));
  }, []);

  return (
    <>
      <ScrollTop />
      <Routes>
        <Route path="/" element={<Landing site={site} />} />
        <Route path="/kayit" element={<Signup site={site} />} />
        <Route path="/kayit/tamam" element={<SignupDone site={site} />} />
        <Route path="/giris" element={<Login site={site} />} />
        {Object.entries(LEGAL_PAGES).map(([key, p]) => <Route key={key} path={p.path} element={<LegalPage page={key} site={site} />} />)}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {site?.chatbot?.enabled && <ChatWidget chatbot={site.chatbot} company={site.company} raised={!onSignup} hideLauncher={onSignup} />}
      {site && <CookieBanner tracking={site.tracking} />}
    </>
  );
};

export default RootApp;
