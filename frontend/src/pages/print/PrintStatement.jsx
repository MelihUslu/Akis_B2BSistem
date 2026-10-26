import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { errorMessage } from '../../services/api';
import PrintLayout from './PrintLayout';
import { formatTRY, formatDate } from '../../utils/format';

// Cari hesap ekstresi + mutabakat imza alanı. Bayi kendi ekstresini, admin herhangi bir bayininkini yazdırır.
const PrintStatement = () => {
  const { companyId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(companyId ? `/finance/statement/${companyId}` : '/finance/my-statement')
      .then((r) => setData(r.data)).catch((e) => setError(errorMessage(e, 'Ekstre getirilemedi.')));
  }, [companyId]);

  if (error) return <p className="p-10 text-center text-gray-500">{error}</p>;
  if (!data) return <p className="p-10 text-center text-gray-400">Yükleniyor...</p>;

  const rows = [...data.transactions].reverse();
  const totals = rows.reduce((t, r) => ({ debt: t.debt + (r.type === 'DEBT' ? r.amount : 0), credit: t.credit + (r.type === 'CREDIT' ? r.amount : 0) }), { debt: 0, credit: 0 });
  const balance = data.company.currentBalance;

  return (
    <PrintLayout ready title="Cari Hesap Ekstresi" subtitle={<>{data.company.name}<br />Tarih: {formatDate(new Date())}</>}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-gray-900 text-[10px] uppercase">
            <th className="py-2 text-left">Tarih</th><th className="py-2 text-left">Açıklama</th>
            <th className="py-2 text-right">Borç</th><th className="py-2 text-right">Alacak</th><th className="py-2 text-right">Bakiye</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-200 text-gray-600"><td className="py-1.5" /><td className="py-1.5">Açılış bakiyesi</td><td /><td /><td className="py-1.5 text-right">{formatTRY(data.openingBalance)}</td></tr>
          {rows.map(t => (
            <tr key={t.id} className="border-b border-gray-200">
              <td className="py-1.5 whitespace-nowrap">{formatDate(t.date)}</td>
              <td className="py-1.5">{t.description}</td>
              <td className="py-1.5 text-right whitespace-nowrap">{t.type === 'DEBT' ? formatTRY(t.amount) : ''}</td>
              <td className="py-1.5 text-right whitespace-nowrap">{t.type === 'CREDIT' ? formatTRY(t.amount) : ''}</td>
              <td className="py-1.5 text-right whitespace-nowrap">{formatTRY(t.balanceAfter)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-gray-900 font-black">
            <td colSpan={2} className="py-2">Toplam</td>
            <td className="py-2 text-right">{formatTRY(totals.debt)}</td>
            <td className="py-2 text-right">{formatTRY(totals.credit)}</td>
            <td className="py-2 text-right">{formatTRY(balance)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-8 border border-gray-300 p-4">
        <p className="font-bold mb-2">Mutabakat</p>
        <p className="text-[11px] text-gray-700 leading-relaxed">
          {formatDate(new Date())} tarihi itibarıyla cari hesabınız <b>{formatTRY(Math.abs(balance))} {balance < 0 ? 'BORÇ' : balance > 0 ? 'ALACAK' : ''}</b> bakiye vermektedir.
          Mutabık olduğunuzu ya da itirazınızı aşağıya imza ve kaşe ile bildirmenizi rica ederiz.
        </p>
        <div className="grid grid-cols-2 gap-8 mt-8 text-center text-[11px]">
          <div><div className="border-t border-gray-400 pt-1">Mutabıkız / Mutabık Değiliz</div></div>
          <div><div className="border-t border-gray-400 pt-1">Kaşe · İmza · Tarih</div></div>
        </div>
      </div>
    </PrintLayout>
  );
};

export default PrintStatement;
