import { Link } from 'react-router-dom';
import { UserRound, LifeBuoy, ChevronRight, Hand } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import PageHeader from '../shared/PageHeader';

/**
 * Hiçbir yönetim yetkisi olmayan ekip üyesinin ana sayfası (ör. yalnızca Personel Alanım'ı kullanan personel).
 * Firma özeti (ciro, borçlular, siparişler) bu kullanıcıya gösterilmez; sunucu da vermez.
 */
const Card = ({ to, icon: Icon, title, text }) => (
  <Link to={to} className="flex items-center gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-brand-200 hover:bg-brand-50/40 transition-colors">
    <span className="h-12 w-12 shrink-0 rounded-2xl bg-brand-50 flex items-center justify-center"><Icon className="h-6 w-6 text-brand-600" /></span>
    <span className="flex-1 min-w-0">
      <span className="block font-black text-gray-900">{title}</span>
      <span className="block text-sm text-gray-500">{text}</span>
    </span>
    <ChevronRight className="h-5 w-5 text-gray-300" />
  </Link>
);

const StaffWelcome = ({ user }) => {
  const { tenant } = useTenant();
  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader icon={Hand} title={`Hoş geldiniz, ${user?.name?.split(' ')[0] || ''}`} subtitle="Hesabınıza yönetim yetkisi tanımlanmadı; yetki gerekiyorsa firma yöneticinizden isteyin." />
      <div className="grid gap-3">
        {tenant?.modules?.hr && <Card to="/admin/personel-alanim" icon={UserRound} title="Personel Alanım" text="İzin, masraf ve avans talepleri, hedef ve prim, şirket duyuruları" />}
        <Card to="/admin/support" icon={LifeBuoy} title="Destek" text="Kullanımla ilgili sorular" />
      </div>
    </div>
  );
};

export default StaffWelcome;
