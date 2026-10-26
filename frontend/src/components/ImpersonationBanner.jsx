import React from 'react';
import { UserCog } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Platform destek ekibi "müşteri olarak giriş" yaptığında her sayfanın üstünde görünür
const ImpersonationBanner = () => {
  const { user, logout } = useAuth();
  if (!user?.impersonatedBy) return null;
  const end = () => { logout(); window.close(); window.location.href = '/login'; };
  return (
    <div className="bg-amber-400 text-amber-950 px-6 py-2 flex items-center justify-between gap-4 text-xs font-bold">
      <span className="flex items-center"><UserCog className="h-4 w-4 mr-2" /> Destek oturumu: {user.impersonatedBy} olarak {user.name} hesabındasınız. Yapılan işlemler kayıt altına alınır.</span>
      <button onClick={end} className="px-3 py-1 rounded-lg bg-amber-950 text-amber-50 font-black">Oturumu Bitir</button>
    </div>
  );
};

export default ImpersonationBanner;
