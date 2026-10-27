import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// base64url (UTF-8 JSON) -> nesne; Türkçe karakterler bozulmasın diye TextDecoder ile çözülür
const decodeUser = (value) => {
  const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
};

/**
 * Platform panelindeki "Müşteri olarak giriş" bağlantısı buraya gelir. Token adresin # kısmındadır
 * (sunucuya ve loglara gitmez); okunduktan sonra adresten silinir.
 */
const Impersonate = () => {
  const { startSession } = useAuth();
  const navigate = useNavigate();
  // Bağlantı ilk çizimde bir kez çözümlenir; geçersizse null
  const [session] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const token = params.get('token');
      const user = decodeUser(params.get('user'));
      return token && user?.impersonatedBy ? { token, user } : null;
    } catch {
      return null;
    }
  });
  const error = session ? '' : 'Destek bağlantısı geçersiz veya süresi dolmuş.';

  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
    if (!session) return;
    startSession(session);
    navigate('/admin', { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="min-h-screen flex items-center justify-center text-sm font-bold text-gray-500">{error || 'Destek oturumu açılıyor...'}</div>;
};

export default Impersonate;
