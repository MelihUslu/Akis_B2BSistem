import { useNavigate, useLocation } from 'react-router-dom';
import { startActing } from '../utils/acting';

// Yönetici bayi adına sipariş verir: bayinin portalı o bayinin fiyat, limit ve adresleriyle açılır (dönüşte bu sayfaya gelinir)
const useActAsDealer = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (company) => {
    startActing({ companyId: company.id, name: company.name, by: 'ADMIN', back: pathname });
    navigate('/bayi');
  };
};

export default useActAsDealer;
