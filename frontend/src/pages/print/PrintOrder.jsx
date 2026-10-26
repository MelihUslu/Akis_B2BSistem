import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { errorMessage } from '../../services/api';
import PrintLayout from './PrintLayout';
import { formatTRY, formatDate, ORDER_STATUS } from '../../utils/format';
import { formatAddress } from '../../utils/turkey';
import { carrierName } from '../../utils/cargo';

const PrintOrder = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { api.get(`/orders/${id}`).then((r) => setOrder(r.data)).catch((e) => setError(errorMessage(e, 'Sipariş bulunamadı.'))); }, [id]);

  if (error) return <p className="p-10 text-center text-gray-500">{error}</p>;
  if (!order) return <p className="p-10 text-center text-gray-400">Yükleniyor...</p>;

  const items = order.items.filter(i => i.status === 'APPROVED' || order.status === 'PENDING');
  const c = order.company;

  return (
    <PrintLayout ready title={order.status === 'PENDING' ? 'Sipariş Formu' : 'Proforma Fatura'}
      subtitle={<>No: <b>AK-{order.id}</b><br />Tarih: {formatDate(order.createdAt, true)}<br />Durum: {ORDER_STATUS[order.status]?.label}</>}>
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <p className="text-[10px] font-black text-gray-500 uppercase mb-1">Alıcı</p>
          <p className="font-bold">{c.name}</p>
          <p className="text-gray-600 leading-snug">
            {c.address && <>{c.address}<br /></>}
            {[c.taxOffice, c.taxNumber].filter(Boolean).join(' V.D. / ')}{c.externalCode && ` · Cari: ${c.externalCode}`}<br />
            {c.phone}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-gray-500 uppercase mb-1">Ödeme / Teslimat</p>
          <p>{order.paymentMethod === 'WIRE_TRANSFER' ? 'Havale / EFT' : 'Cari hesap'}{order.dueDate && ` · Vade: ${formatDate(order.dueDate)}`}</p>
          {order.trackingNumber && <p>{carrierName(order.cargoCompany)} {order.trackingNumber}</p>}
          {order.shippingAddress && (
            <p className="text-gray-600 leading-snug mt-1">
              <b>Teslimat:</b> {order.shippingAddress.contactName} · {order.shippingAddress.phone}<br />
              {formatAddress(order.shippingAddress)}
            </p>
          )}
          <p className="text-gray-600">Sipariş veren: {order.user?.name}</p>
        </div>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-gray-900 text-[10px] uppercase">
            <th className="py-2 text-left w-8">#</th><th className="py-2 text-left">Ürün</th><th className="py-2 text-left">SKU</th>
            <th className="py-2 text-right">Miktar</th><th className="py-2 text-right">Birim Fiyat</th><th className="py-2 text-right">KDV</th><th className="py-2 text-right">Tutar</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, idx) => (
            <tr key={i.id} className="border-b border-gray-200 align-top">
              <td className="py-2">{idx + 1}</td>
              <td className="py-2">{i.product.parent?.name || i.product.name}{i.variantLabel && <div className="text-[10px] text-gray-500">{i.variantLabel}</div>}</td>
              <td className="py-2 font-mono text-[11px]">{i.product.sku}</td>
              <td className="py-2 text-right whitespace-nowrap">{i.quantity} {i.product.unit}</td>
              <td className="py-2 text-right whitespace-nowrap">{formatTRY(i.price)}</td>
              <td className="py-2 text-right">%{i.vatRate}</td>
              <td className="py-2 text-right whitespace-nowrap">{formatTRY(i.price * i.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end mt-4">
        <table className="w-72">
          <tbody>
            <tr><td className="py-1 text-gray-600">Ara Toplam</td><td className="py-1 text-right">{formatTRY(order.subtotal)}</td></tr>
            {order.discountAmount > 0 && <tr><td className="py-1 text-gray-600">İndirim ({order.couponCode})</td><td className="py-1 text-right">−{formatTRY(order.discountAmount)}</td></tr>}
            <tr><td className="py-1 text-gray-600">KDV</td><td className="py-1 text-right">{formatTRY(order.vatAmount)}</td></tr>
            <tr className="border-t-2 border-gray-900 font-black text-sm"><td className="py-2">Genel Toplam</td><td className="py-2 text-right">{formatTRY(order.totalAmount)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-[10px] text-gray-500">Bu belge mali değeri olmayan bir proforma / sipariş formudur. Fatura ayrıca düzenlenir.</p>
    </PrintLayout>
  );
};

export default PrintOrder;
