import React, { useEffect, useState } from 'react';
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
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, '', window.location.pathname);
    try {
      const token = params.get('token');
      const user = decodeUser(params.get('user'));
      if (!token || !user?.impersonatedBy) throw new Error();
      startSession({ token, user });
      navigate('/admin', { replace: true });
    } catch {
      setError('Destek bağlantısı geçersiz veya süresi dolmuş.');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="min-h-screen flex items-center justify-center text-sm font-bold text-gray-500">{error || 'Destek oturumu açılıyor...'}</div>;
};

export default Impersonate;
