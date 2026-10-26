import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { disablePushOnLogout } from '../utils/push';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for token
    const token = localStorage.getItem('akis_token');
    const storedUser = localStorage.getItem('akis_user');
    
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
      // Yetkiler değişmiş olabilir: kullanıcı bilgisini sunucudan tazele
      api.get('/auth/me').then(({ data }) => {
        const fresh = {
          id: data.id, name: data.name, email: data.email, role: data.role, companyId: data.companyId,
          isOwner: data.isOwner, permissions: Array.isArray(data.permissions) ? data.permissions : [],
          impersonatedBy: data.impersonatedBy || null
        };
        localStorage.setItem('akis_user', JSON.stringify(fresh));
        setUser(fresh);
      }).catch(() => {});
    }
    setLoading(false);
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
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, verifyTwoFactor, startSession, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
