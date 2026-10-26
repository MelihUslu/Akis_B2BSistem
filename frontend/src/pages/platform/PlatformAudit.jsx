import React, { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { platformApi } from '../../services/api';
import AuditLogTable from '../../components/shared/AuditLogTable';

// Tüm firmaların ve platform yöneticilerinin işlem kaydı
const PlatformAudit = () => {
  const [platformOnly, setPlatformOnly] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="bg-gradient-to-br from-slate-500 to-slate-700 p-3.5 rounded-2xl shadow-lg shadow-slate-500/25 shrink-0"><ScrollText className="h-6 w-6 text-white" /></div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">İşlem Kaydı</h1>
          <p className="text-gray-500 text-sm mt-1">Girişler, ayar değişiklikleri, destek oturumları ve silme işlemleri. Satıra tıklayınca ayrıntı açılır.</p>
        </div>
      </div>
      <div className="card-premium p-6">
        <AuditLogTable
          showTenant
          deps={[platformOnly]}
          fetchPage={({ page, q }) => platformApi.get('/audit-logs', { params: { page, q, platformOnly } }).then((r) => r.data)}
          extraFilters={(
            <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
              <input type="checkbox" checked={platformOnly} onChange={(e) => setPlatformOnly(e.target.checked)} /> Yalnızca platform yöneticileri
            </label>
          )}
        />
      </div>
    </div>
  );
};

export default PlatformAudit;
