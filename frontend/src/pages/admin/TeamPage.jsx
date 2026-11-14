import { ShieldCheck } from 'lucide-react';
import PageHeader from '../../components/shared/PageHeader';
import TeamSettings from '../../components/settings/TeamSettings';
import useAlert from '../../hooks/useAlert';

// Ekip ve yetkiler: sol menüden erişilen bağımsız sayfa (eskiden Ayarlar → Ekip ve Yetkiler sekmesindeydi)
const TeamPage = () => {
  const { alertElement, showAlert, confirm } = useAlert();
  return (
    <div className="space-y-6">
      {alertElement}
      <PageHeader icon={ShieldCheck} title="Ekip ve Yetkiler" subtitle="Yöneticileri davet edin, rollerini ve yetkilerini belirleyin" />
      <TeamSettings showAlert={showAlert} confirm={confirm} />
    </div>
  );
};

export default TeamPage;
