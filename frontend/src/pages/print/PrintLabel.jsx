import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import api from '../../services/api';
import { useTenant } from '../../context/TenantContext';
import { formatAddress } from '../../utils/turkey';
import { carrierName } from '../../utils/cargo';

// Pakete yapıştırılacak 10×15 cm kargo etiketi: gönderi anahtarı barkodu + alıcı / gönderici
const PrintLabel = () => {
  const { id } = useParams();
  const { tenant } = useTenant();
  const [order, setOrder] = useState(null);
  const svg = useRef(null);

  useEffect(() => { api.get(`/orders/${id}`).then((r) => setOrder(r.data)).catch(() => {}); }, [id]);
  useEffect(() => {
    if (order?.shipmentKey && svg.current) JsBarcode(svg.current, order.shipmentKey, { format: 'CODE128', width: 2.2, height: 70, fontSize: 18, margin: 0 });
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => { if (wasDark) root.classList.add('dark'); };
  }, [order]);

  if (!order) return <p className="p-10 text-center text-gray-400">Yükleniyor…</p>;
  if (!order.shipmentKey) return <p className="p-10 text-center text-gray-500">Bu sipariş için kargo gönderisi oluşturulmamış.</p>;
  const a = order.shippingAddress || {};

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white py-6 print:py-0">
      <style>{'@page { size: 100mm 150mm; margin: 4mm; }'}</style>
      <div className="w-[100mm] mx-auto flex justify-between items-center mb-4 print:hidden">
        <button onClick={() => window.history.back()} className="flex items-center text-xs font-black text-gray-500"><ArrowLeft className="h-4 w-4 mr-1" /> Geri</button>
        <button onClick={() => window.print()} className="btn-gradient h-10 px-4 py-0"><Printer className="h-4 w-4 mr-2" /> Yazdır</button>
      </div>
      <div className="w-[100mm] h-[142mm] mx-auto bg-white border-2 border-black p-4 flex flex-col text-black text-[11px] leading-snug">
        <div className="flex justify-between items-start border-b-2 border-black pb-2">
          <p className="text-base font-black uppercase">{carrierName(order.shipmentProvider || order.cargoCompany)}</p>
          <p className="font-bold">AK-{order.id}</p>
        </div>
        <div className="py-3 flex justify-center border-b-2 border-black"><svg ref={svg} /></div>
        <div className="py-2 border-b-2 border-black flex-1">
          <p className="text-[10px] font-black uppercase">Alıcı</p>
          <p className="text-[15px] font-black">{order.company?.name}</p>
          {a.contactName && <p className="font-bold">{a.contactName} · {a.phone}</p>}
          <p className="mt-1">{a.line}</p>
          <p className="text-[15px] font-black mt-1">{[a.district, a.city].filter(Boolean).join(' / ').toLocaleUpperCase('tr-TR')}</p>
          {!a.city && <p className="mt-1">{formatAddress(a) || order.company?.address}</p>}
        </div>
        <div className="pt-2">
          <p className="text-[10px] font-black uppercase">Gönderici</p>
          <p className="font-bold">{tenant?.name}</p>
          <p>{[tenant?.address, tenant?.phone].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
    </div>
  );
};

export default PrintLabel;
