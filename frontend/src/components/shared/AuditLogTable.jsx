import React, { useEffect, useState } from 'react';
import { Search, ChevronLeft, ChevronRight, UserCog } from 'lucide-react';
import { formatDate } from '../../utils/format';

/**
 * İşlem kaydı tablosu (kim, ne zaman, ne yaptı). Firma ayarlarında ve platform panelinde ortak kullanılır.
 * fetchPage({ page, q }) -> { data, pagination }
 */
const AuditLogTable = ({ fetchPage, showTenant = false, extraFilters = null, deps = [] }) => {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState({ data: [], pagination: { page: 1, pages: 1, total: 0 } });
  const [open, setOpen] = useState(null);

  useEffect(() => {
    fetchPage({ page, q: query }).then(setResult).catch(() => {});
  }, [page, query, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q); }} className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input className="premium-input pl-11" placeholder="İşlem veya kişi ara..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {extraFilters}
        <span className="text-xs font-bold text-gray-400">{result.pagination.total} kayıt</span>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
              <th className="py-3 pr-4">Zaman</th>
              {showTenant && <th className="py-3 pr-4">Firma</th>}
              <th className="py-3 pr-4">Kişi</th>
              <th className="py-3 pr-4">İşlem</th>
              <th className="py-3 pr-4">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {result.data.map((l) => (
              <React.Fragment key={l.id}>
                <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(open === l.id ? null : l.id)}>
                  <td className="py-3 pr-4 text-xs text-gray-500 whitespace-nowrap">{formatDate(l.createdAt, true)}</td>
                  {showTenant && <td className="py-3 pr-4 text-xs font-bold text-gray-700">{l.tenantName || '—'}</td>}
                  <td className="py-3 pr-4">
                    <span className="text-xs font-bold text-gray-800">{l.actorName || (l.actorType === 'SYSTEM' ? 'Sistem' : '—')}</span>
                    {l.actorType === 'PLATFORM' && <span className="ml-2 pill-badge bg-purple-100 text-purple-700">Platform</span>}
                    {l.impersonatedBy && (
                      <span className="ml-2 inline-flex items-center pill-badge bg-amber-100 text-amber-700" title="Platform destek oturumunda yapıldı">
                        <UserCog className="h-3 w-3 mr-1" /> {l.impersonatedBy}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs font-semibold text-gray-700">{l.action}</td>
                  <td className="py-3 pr-4 text-[11px] text-gray-400 font-mono">{l.ip || ''}</td>
                </tr>
                {open === l.id && (l.details || l.path) && (
                  <tr>
                    <td colSpan={showTenant ? 5 : 4} className="pb-4">
                      <pre className="text-[11px] bg-gray-50 rounded-xl p-3 overflow-x-auto text-gray-600 whitespace-pre-wrap">{[l.method && `${l.method} ${l.path}`, l.details && JSON.stringify(l.details, null, 2)].filter(Boolean).join('\n')}</pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {result.data.length === 0 && (
              <tr><td colSpan={showTenant ? 5 : 4} className="py-10 text-center text-sm text-gray-400 font-semibold">Kayıt yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {result.pagination.pages > 1 && (
        <div className="flex justify-end items-center gap-3">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-xs font-bold text-gray-500">{page} / {result.pagination.pages}</span>
          <button disabled={page >= result.pagination.pages} onClick={() => setPage(page + 1)} className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
};

export default AuditLogTable;
