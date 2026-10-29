import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Ortak giriş sayfasından (kök alan adı /giris) yönlendirilen kullanıcı buraya gelir: tek kullanımlık kod adresin
 * # kısmındadır (sunucuya ve loglara gitmez), okunur okunmaz adresten silinir ve oturuma çevrilir.
 * İki aşamalı doğrulama gerekiyorsa giriş ekranında kod adımı açılır; hata olursa giriş ekranında gösterilir.
 */
const LoginHandoff = () => {
  const { loginWithHandoff, logout } = useAuth();
  const navigate = useNavigate();
  const [code] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('code'));

  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
    const fail = (message) => {
      sessionStorage.setItem('akis_login_notice', message);
      navigate('/login', { replace: true });
    };
    if (!code) { fail('Giriş bağlantısı geçersiz. Lütfen tekrar giriş yapın.'); return; }
    logout(); // bu tarayıcıda başka bir hesap açıksa kapanır
    loginWithHandoff(code).then((r) => {
      if (r.success) navigate(r.user.role === 'ADMIN' ? '/admin' : '/bayi', { replace: true });
      else if (r.twoFactorRequired) navigate('/login', { replace: true, state: { challenge: r.challenge } });
      else fail(r.message);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="min-h-screen flex items-center justify-center text-sm font-bold text-gray-500">Giriş yapılıyor...</div>;
};

export default LoginHandoff;
