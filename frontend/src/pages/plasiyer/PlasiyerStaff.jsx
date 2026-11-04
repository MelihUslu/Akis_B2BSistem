import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PlasiyerHeader from '../../components/plasiyer/PlasiyerHeader';
import StaffArea from '../hr/StaffArea';

// Plasiyerin personel alanı: izin, masraf / avans talepleri, hedef ve prim, şirket duyuruları
const PlasiyerStaff = () => (
  <div className="min-h-screen bg-navy-50 text-gray-900 pb-16">
    <PlasiyerHeader />
    <main className="max-w-5xl mx-auto px-4 pt-6 space-y-4">
      <Link to="/plasiyer" className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-600 hover:text-gray-900"><ArrowLeft className="h-4 w-4" /> Bayilerim</Link>
      <h1 className="text-2xl md:text-3xl font-black tracking-tight">Personel Alanım</h1>
      <StaffArea header={false} />
    </main>
  </div>
);

export default PlasiyerStaff;
