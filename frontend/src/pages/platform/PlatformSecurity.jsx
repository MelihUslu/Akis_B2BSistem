import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { platformApi } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import TwoFactorSettings from '../../components/settings/TwoFactorSettings';

const PlatformSecurity = () => {
  const { alertElement, showAlert } = useAlert();
  return (
    <div className="space-y-6 max-w-4xl">
      {alertElement}
      <div className="flex items-center gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-3.5 rounded-2xl shadow-lg shadow-emerald-500/25 shrink-0"><ShieldCheck className="h-6 w-6 text-white" /></div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Güvenlik</h1>
          <p className="text-gray-500 text-sm mt-1">Platform hesabı tüm müşterilere erişebildiği için iki aşamalı doğrulamayı açmanız önerilir.</p>
        </div>
      </div>
      <TwoFactorSettings client={platformApi} base="/me/2fa" showAlert={showAlert} />
    </div>
  );
};

export default PlatformSecurity;
