import { useEffect, useState } from 'react';
import { LifeBuoy, Phone, Mail, UserRound, MessageCircle } from 'lucide-react';
import api from '../../services/api';
import { useTenant } from '../../context/TenantContext';
import { HeaderPopover } from '../shared/HeaderMenu';
import { headerButtonClass } from '../../utils/ui';
import { t } from '../../i18n';

// "+90 532 000 00 00" → wa.me bağlantısı için yalnız rakamlar (başında 0 varsa 90 eklenir)
const waNumber = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  return d.startsWith('0') ? `9${d}` : d;
};

const Contact = ({ icon: Icon, label, value, href, close }) => (
  <a href={href} onClick={close} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50">
    <span className="h-9 w-9 shrink-0 rounded-lg bg-indigo-50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center"><Icon className="h-4 w-4" /></span>
    <span className="min-w-0">
      <span className="block text-[11px] font-bold text-gray-400">{label}</span>
      <span className="block text-sm font-bold text-gray-900 truncate">{value}</span>
    </span>
  </a>
);

/**
 * Bayi destek menüsü (üst çubuk): bayiye atanmış müşteri temsilcisi ve firmanın iletişim bilgileri.
 * Bilgiler firmanın kendi ayarlarından gelir (Ayarlar → Firma bilgileri), platformun değil.
 */
const SupportMenu = () => {
  const { tenant } = useTenant();
  const [rep, setRep] = useState(null);
  useEffect(() => { api.get('/auth/me').then((r) => setRep(r.data.company?.plasiyer || null)).catch(() => {}); }, []);
  const phone = tenant?.phone;
  const email = tenant?.contactEmail;

  return (
    <HeaderPopover label={t('Destek')} width="w-80" buttonClass={headerButtonClass}
      trigger={() => <><LifeBuoy className="h-4 w-4" /><span className="hidden md:inline">{t('Destek')}</span></>}>
      {(close) => (
        <>
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-sm font-black text-gray-900">{t('Size nasıl yardımcı olabiliriz?')}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t('Sipariş, ödeme ve ürünlerle ilgili sorularınız için bize ulaşın.')}</p>
          </div>
          <div className="p-1.5">
            {rep && (
              <>
                <p className="px-3 pt-2 pb-1 text-[10px] font-black text-gray-400 uppercase tracking-wider">{t('Müşteri temsilciniz')}</p>
                <Contact icon={UserRound} label={rep.name} value={rep.email} href={`mailto:${rep.email}`} close={close} />
              </>
            )}
            {(phone || email) && <p className="px-3 pt-2 pb-1 text-[10px] font-black text-gray-400 uppercase tracking-wider">{tenant?.name}</p>}
            {phone && <Contact icon={Phone} label={t('Telefon')} value={phone} href={`tel:${phone.replace(/\s/g, '')}`} close={close} />}
            {phone && <Contact icon={MessageCircle} label="WhatsApp" value={t('Mesaj gönderin')} href={`https://wa.me/${waNumber(phone)}`} close={close} />}
            {email && <Contact icon={Mail} label={t('E-posta')} value={email} href={`mailto:${email}`} close={close} />}
            {!rep && !phone && !email && <p className="px-3 py-4 text-sm text-gray-500">{t('İletişim bilgisi henüz eklenmemiş.')}</p>}
          </div>
        </>
      )}
    </HeaderPopover>
  );
};

export default SupportMenu;
