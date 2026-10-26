import React from 'react';
import { SearchX } from 'lucide-react';
import { rootUrl } from '../../utils/tenant';
import { t } from '../../i18n';

const TenantNotFound = () => (
  <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
    <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-10 max-w-md w-full text-center space-y-5">
      <SearchX className="h-14 w-14 mx-auto text-slate-300" />
      <h1 className="text-2xl font-black text-slate-900">{t('Portal bulunamadı')}</h1>
      <p className="text-sm text-slate-500 font-medium">{t('Bu adreste kayıtlı bir B2B portalı yok. Adresi kontrol edin veya yeni bir portal oluşturun.')}</p>
      <a href={rootUrl()} className="inline-block w-full bg-slate-900 hover:bg-black text-white font-bold py-3.5 rounded-xl text-sm">{t('Ana sayfaya git')}</a>
    </div>
  </div>
);

export default TenantNotFound;
