import { useNavigate } from 'react-router-dom';
import { UserCheck, ArrowLeftRight, X } from 'lucide-react';
import { getActing, stopActing } from '../../utils/acting';

/**
 * Bayi adına işlem modunda portalın üstündeki şerit: kimin adına işlem yapıldığı görünür, mod buradan kapatılır.
 * (Bu modda siparişler bayinin fiyat, limit ve adresleriyle; girenin adıyla kaydedilir ve bayiye bildirim gider.)
 */
const ActingBanner = () => {
  const navigate = useNavigate();
  const acting = getActing();
  if (!acting) return null;
  const back = acting.back || (acting.by === 'PLASIYER' ? '/plasiyer' : '/admin/orders');
  const leave = () => { stopActing(); navigate(back); };
  return (
    <div role="status" className="bg-brand-600 text-white">
      <div className="px-4 md:px-8 lg:px-12 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="flex items-center gap-2 min-w-0 flex-1">
          <UserCheck className="h-4 w-4 shrink-0" />
          <span className="min-w-0"><b className="font-black">{acting.name}</b> adına işlem yapıyorsunuz <span className="text-white/80">({acting.by === 'PLASIYER' ? 'plasiyer' : 'yönetici'} modu). Sipariş bu bayinin fiyat ve limitiyle oluşur, bayiye bildirim gider.</span></span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <button onClick={() => { stopActing(); navigate(acting.by === 'PLASIYER' ? '/plasiyer' : '/admin/dealers'); }} className="h-8 px-3 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold flex items-center gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5" /> Bayi değiştir</button>
          <button onClick={leave} className="h-8 px-3 rounded-lg bg-white text-brand-700 text-xs font-bold flex items-center gap-1.5 hover:bg-brand-50"><X className="h-3.5 w-3.5" /> Moddan çık</button>
        </span>
      </div>
    </div>
  );
};

export default ActingBanner;
