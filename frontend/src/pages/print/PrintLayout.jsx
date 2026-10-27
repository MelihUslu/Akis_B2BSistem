import { useEffect } from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';

// A4 yazdırma düzeni: firma başlığı + içerik. "Yazdır" ile tarayıcıdan PDF olarak kaydedilebilir.
const PrintLayout = ({ title, subtitle, children, ready }) => {
  const { tenant } = useTenant();
  // Belgeler koyu temada da beyaz kağıt gibi görünsün
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => { if (wasDark) root.classList.add('dark'); };
  }, []);
  return (
    <div className="min-h-screen bg-gray-100 print:bg-white py-6 print:py-0 px-3">
      <style>{`@page { size: A4; margin: 14mm; } @media print { body { background: #fff !important; } }`}</style>
      <div className="max-w-[210mm] mx-auto flex justify-between items-center mb-4 print:hidden">
        <button onClick={() => window.history.back()} className="flex items-center text-xs font-black text-gray-500 hover:text-indigo-600"><ArrowLeft className="h-4 w-4 mr-1" /> Geri</button>
        <button disabled={!ready} onClick={() => window.print()} className="btn-gradient disabled:opacity-50"><Printer className="h-4 w-4 mr-2" /> Yazdır / PDF Olarak Kaydet</button>
      </div>
      <div className="max-w-[210mm] mx-auto bg-white shadow-xl print:shadow-none p-8 print:p-0 text-[12px] text-gray-900">
        <div className="flex justify-between items-start border-b-2 border-gray-900 pb-4 mb-6">
          <div>
            {tenant?.logoUrl ? <img src={tenant.logoUrl} alt={tenant.name} className="h-12 max-w-[14rem] object-contain mb-2" /> : <p className="text-xl font-black">{tenant?.name}</p>}
            <p className="text-[11px] text-gray-600 leading-snug">
              {tenant?.logoUrl && <>{tenant?.name}<br /></>}
              {tenant?.address && <>{tenant.address}<br /></>}
              {[tenant?.taxOffice, tenant?.taxNumber].filter(Boolean).join(' V.D. / ')}{tenant?.taxNumber && <br />}
              {[tenant?.phone, tenant?.contactEmail].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-black uppercase tracking-wide">{title}</p>
            {subtitle && <p className="text-[11px] text-gray-600 mt-1 leading-snug">{subtitle}</p>}
          </div>
        </div>
        {children}
        <p className="mt-10 text-[9px] text-gray-400 text-center">Bu belge {tenant?.name} B2B portalından {new Date().toLocaleString('tr-TR')} tarihinde oluşturulmuştur.</p>
      </div>
    </div>
  );
};

export default PrintLayout;
