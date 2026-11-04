import PlasiyerHeader from '../../components/plasiyer/PlasiyerHeader';
import StaffArea from '../hr/StaffArea';

// "Personel" hesabının tek sayfası: izin, masraf / avans talepleri, hedef ve prim, şirket duyuruları (yönetim paneli yok)
const PersonelHome = () => (
  <div className="min-h-screen bg-navy-50 text-gray-900 pb-16">
    <PlasiyerHeader roleLabel="Personel" />
    <main className="max-w-5xl mx-auto px-4 pt-6 space-y-4">
      <h1 className="text-2xl md:text-3xl font-black tracking-tight">Personel Alanım</h1>
      <StaffArea header={false} />
    </main>
  </div>
);

export default PersonelHome;
