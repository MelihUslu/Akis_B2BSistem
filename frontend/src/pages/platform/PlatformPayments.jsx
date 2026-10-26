import React, { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';
import { platformApi } from '../../services/api';
import { formatDate, formatTRY } from '../../utils/format';

const PlatformPayments = () => {
  const [payments, setPayments] = useState([]);

  useEffect(() => { platformApi.get('/payments').then((res) => setPayments(res.data)).catch(() => {}); }, []);

  const total = payments.filter((p) => p.status === 'SUCCESS').reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-3.5 rounded-2xl shadow-lg shadow-emerald-500/25 shrink-0"><Receipt className="h-6 w-6 text-white" /></div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Ödemeler</h1>
          <p className="text-gray-500 text-sm mt-1">Son {payments.length} kayıt · Başarılı toplam {formatTRY(total)}</p>
        </div>
      </div>
      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="list-head">
            <tr className="text-left text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">
              <th className="px-6 py-4">Tarih</th><th className="px-6 py-4">Müşteri</th><th className="px-6 py-4">Paket</th>
              <th className="px-6 py-4">Yöntem</th><th className="px-6 py-4">Dönem</th><th className="px-6 py-4 text-right">Tutar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/70">
            {payments.map((p) => (
              <tr key={p.id} className="transition-colors hover:bg-slate-50/80 hover:shadow-[inset_3px_0_0_0_#3b82f6]">
                <td className="px-6 py-4 text-gray-500 font-semibold">{formatDate(p.createdAt, true)}</td>
                <td className="px-6 py-4"><Link to={`/tenants/${p.tenantId}`} className="font-bold text-gray-900 hover:text-indigo-600">{p.tenant.name}</Link></td>
                <td className="px-6 py-4 font-semibold">{p.planCode} · {p.billingCycle === 'YEARLY' ? 'Yıllık' : 'Aylık'}</td>
                <td className="px-6 py-4 font-semibold">{p.method === 'IYZICO' ? 'iyzico' : 'Manuel'}{p.reference && <span className="block text-[10px] text-gray-400">{p.reference}</span>}</td>
                <td className="px-6 py-4 text-gray-500">{formatDate(p.periodStart)} – {formatDate(p.periodEnd)}</td>
                <td className={`px-6 py-4 text-right font-black ${p.status === 'SUCCESS' ? 'text-emerald-600' : 'text-red-500'}`}>{p.status === 'SUCCESS' ? formatTRY(p.amount) : 'Başarısız'}</td>
              </tr>
            ))}
            {payments.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-gray-400 font-bold">Henüz ödeme yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PlatformPayments;
