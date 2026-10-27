import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { errorMessage } from '../../services/api';
import PrintLayout from './PrintLayout';
import { formatMoney, formatDate } from '../../utils/format';

/**
 * Tahsilat makbuzu (cariden para girişi) / tediye makbuzu (cariye ödeme). İki imza alanı içerir.
 */
const PrintReceipt = () => {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { api.get(`/partners/payments/${id}`).then((r) => setP(r.data)).catch((e) => setError(errorMessage(e, 'Makbuz bulunamadı.'))); }, [id]);

  if (error) return <p className="p-10 text-center text-gray-500">{error}</p>;
  if (!p) return <p className="p-10 text-center text-gray-400">Yükleniyor...</p>;
  const inbound = p.direction === 'IN';
  const c = p.company;
  const paid = formatMoney(p.amount, p.currency || 'TRY');
  const accountCur = c.currency || 'TRY';
  const posted = p.accountAmount !== null && (p.currency !== accountCur) ? formatMoney(p.accountAmount, accountCur) : null;

  return (
    <PrintLayout ready title={inbound ? 'Tahsilat Makbuzu' : 'Tediye Makbuzu'}
      subtitle={<>No: <b>{p.receiptNo ?? p.id}</b><br />Tarih: {formatDate(p.paymentDate)}</>}>
      {p.status === 'CANCELLED' && (
        <p className="mb-5 rounded-lg border-2 border-red-400 bg-red-50 p-2 text-center text-[11px] font-black uppercase tracking-widest text-red-600">İptal edildi (ters kayıt)</p>
      )}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div>
          <p className="text-[10px] font-black text-gray-500 uppercase mb-1">{inbound ? 'Ödeyen' : 'Ödenen'}</p>
          <p className="font-bold">{c.name}</p>
          <p className="text-gray-600 leading-snug">
            {c.address && <>{c.address}<br /></>}
            {[c.taxOffice, c.taxNumber].filter(Boolean).join(' V.D. / ')}{c.externalCode && ` · Cari: ${c.externalCode}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-gray-500 uppercase mb-1">Tutar</p>
          <p className="text-2xl font-black">{paid}</p>
          {posted && <p className="text-[11px] text-gray-500">Cariye işlenen: {posted} (kur {p.rate})</p>}
        </div>
      </div>
      <table className="w-full border-collapse mb-10">
        <tbody>
          {[
            ['Ödeme şekli', p.methodLabel],
            ['Kur', accountCur !== 'TRY' || p.currency !== 'TRY' ? `1 ${accountCur === 'TRY' ? p.currency : accountCur} = ${p.rate} TL` : null],
            ['Banka', p.bankName],
            [['CHECK', 'NOTE'].includes(p.method) ? 'Çek / senet no' : 'Belge / dekont no', p.reference],
            ['Vade', p.dueDate && formatDate(p.dueDate)],
            ['Açıklama', p.note],
            ['Düzenleyen', p.createdByName]
          ].filter(([, v]) => v).map(([k, v]) => (
            <tr key={k} className="border-b border-gray-200"><td className="py-2 w-40 text-gray-500">{k}</td><td className="py-2 font-semibold">{v}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mb-14 text-[11px] text-gray-600">
        {inbound
          ? `Yukarıda bilgileri yazılı ${paid} tutar, ${c.name} carisinin hesabına ${posted ? `${posted} ` : ''}alacak olarak kaydedilmek üzere tahsil edilmiştir.`
          : `Yukarıda bilgileri yazılı ${paid} tutar, ${c.name} carisine ödenmiştir.`}
      </p>
      <div className="grid grid-cols-2 gap-10 text-center text-[11px]">
        <div className="border-t border-gray-400 pt-2">{inbound ? 'Teslim eden' : 'Teslim alan'}<br /><span className="text-gray-400">Ad soyad / imza</span></div>
        <div className="border-t border-gray-400 pt-2">{inbound ? 'Teslim alan' : 'Teslim eden'}<br /><span className="text-gray-400">Ad soyad / imza</span></div>
      </div>
    </PrintLayout>
  );
};

export default PrintReceipt;
