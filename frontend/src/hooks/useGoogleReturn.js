import { useEffect, useRef } from 'react';
import { t } from '../i18n';

const ERRORS = {
  cancelled: 'Google ile giriş iptal edildi.',
  expired: 'Google ile girişin süresi doldu ya da giriş başka bir tarayıcıda başlatıldı. Lütfen tekrar deneyin.',
  unverified: 'Google hesabınızın e-posta adresi doğrulanmamış. Google hesabınızda e-postanızı doğrulayıp tekrar deneyin.',
  disabled: 'Google ile giriş şu anda kullanılamıyor. E-posta ve şifrenizle giriş yapın.',
  failed: 'Google ile giriş yapılamadı. Lütfen tekrar deneyin.',
};

// Sayfa Google dönüşüyle mi açıldı? (ilk çizimde form yerine "giriş yapılıyor" göstermek için; adresi değiştirmez)
export const isGoogleReturn = () => /(^#|&)google=/.test(window.location.hash);

/**
 * Google'dan dönüş: bilet (#google=…) ya da hata kodu (#google_error=…) adresin # kısmındadır (sunucuya ve loglara
 * gitmez). Okunur okunmaz adresten silinir. Bilet tek kullanımlık olduğu için iş bir kez yapılır (StrictMode'un
 * çift effect çağrısında da).
 */
const useGoogleReturn = (onTicket, onError) => {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const ticket = params.get('google');
    const error = params.get('google_error');
    if (!ticket && !error) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (ticket) onTicket(ticket);
    else onError(t(ERRORS[error] || ERRORS.failed));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
};

export default useGoogleReturn;
