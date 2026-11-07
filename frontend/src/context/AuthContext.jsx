import { createContext, useContext, useState, useEffect } from 'react';
import api, { getMe } from '../services/api';
import { disablePushOnLogout } from '../utils/push';
import { stopActing } from '../utils/acting';

const AuthContext = createContext();

// Oturum tarayıcıda saklanır; sayfa açılırken senkron okunur (ekran "giriş yok" ile yanıp sönmesin)
const readStoredUser = () => {
  try {
    const storedUser = localStorage.getItem('akis_user');
    return localStorage.getItem('akis_token') && storedUser ? JSON.parse(storedUser) : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readStoredUser);

  useEffect(() => {
    if (readStoredUser()) {
      // Yetkiler değişmiş olabilir: kullanıcı bilgisini sunucudan tazele
      getMe().then(({ data }) => {
        const fresh = {
          id: data.id, name: data.name, email: data.email, role: data.role, companyId: data.companyId,
          isOwner: data.isOwner, permissions: Array.isArray(data.permissions) ? data.permissions : [],
          orderApproval: data.orderApproval || 'NONE', orderApprovalLimit: data.orderApprovalLimit ?? null, dealerDeny: data.dealerDeny || [],
          impersonatedBy: data.impersonatedBy || null
        };
        localStorage.setItem('akis_user', JSON.stringify(fresh));
        setUser(fresh);
      }).catch(() => {});
    }
  }, []);

  const startSession = ({ token, user }) => {
    localStorage.setItem('akis_token', token);
    localStorage.setItem('akis_user', JSON.stringify(user));
    setUser(user);
  };

  // İki aşamalı doğrulama açıksa { twoFactorRequired, challenge } döner; kod verifyTwoFactor ile gönderilir
  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      if (response.data.twoFactorRequired) return { success: false, twoFactorRequired: true, challenge: response.data.challenge };
      startSession(response.data);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Giriş başarısız oldu.' 
      };
    }
  };

  // Ortak giriş sayfasından (kök alan adı /giris) gelen tek kullanımlık kodla oturum
  const loginWithHandoff = async (code) => {
    try {
      const response = await api.post('/auth/handoff', { code });
      if (response.data.twoFactorRequired) return { success: false, twoFactorRequired: true, challenge: response.data.challenge };
      startSession(response.data);
      return { success: true, user: response.data.user };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Giriş başarısız oldu.' };
    }
  };

  // Google'dan dönen bilet bu portaldaki hesaba çevrilir; yanıt şifreli girişle aynıdır
  const loginWithGoogle = async (ticket) => {
    try {
      const response = await api.post('/auth/google', { ticket });
      if (response.data.twoFactorRequired) return { success: false, twoFactorRequired: true, challenge: response.data.challenge };
      startSession(response.data);
      return { success: true };
    } catch (error) {
      const data = error.response?.data || {};
      return { success: false, message: data.message || 'Giriş başarısız oldu.', email: data.email };
    }
  };

  const verifyTwoFactor = async (challenge, code) => {
    try {
      const response = await api.post('/auth/2fa/verify', { challenge, code });
      startSession(response.data);
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Doğrulama başarısız.';
      return { success: false, message, expired: /süresi doldu/i.test(message) };
    }
  };

  const logout = () => {
    disablePushOnLogout(); // token'ı hemen okur; abonelik arkada silinir
    localStorage.removeItem('akis_token');
    localStorage.removeItem('akis_user');
    stopActing();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, loginWithHandoff, loginWithGoogle, verifyTwoFactor, startSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
