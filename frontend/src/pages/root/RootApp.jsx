import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { publicApi } from '../../services/api';
import { captureUtm, getConsent, setConsent, loadTracking } from '../../utils/site';
import ChatWidget from '../../components/site/ChatWidget';
import Landing from './Landing';
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

const ScrollTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { if (pathname !== '/') window.scrollTo(0, 0); }, [pathname]);
  return null;
};

/**
 * Kök alan adı (tanıtım sitesi): ana sayfa, yasal metinler, canlı sohbet, çerez onayı.
 * Site ayarları (firma bilgileri, chatbot, demo, ölçüm) platform panelinden yönetilir.
 */
const RootApp = () => {
  const [site, setSite] = useState(null);
  useEffect(() => {
    captureUtm();
    publicApi.get('/site').then((r) => setSite(r.data)).catch(() => setSite({}));
  }, []);

  return (
    <>
      <ScrollTop />
      <Routes>
        <Route path="/" element={<Landing site={site} />} />
        {Object.entries(LEGAL_PAGES).map(([key, p]) => <Route key={key} path={p.path} element={<LegalPage page={key} site={site} />} />)}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {site?.chatbot?.enabled && <ChatWidget chatbot={site.chatbot} company={site.company} raised />}
      {site && <CookieBanner tracking={site.tracking} />}
    </>
  );
};

export default RootApp;
