/**
 * CAPTCHA (Cloudflare Turnstile) — platform/developer girişinde.
 * TURNSTILE_SECRET tanımlıysa etkinleşir; tanımlı değilse giriş CAPTCHA olmadan çalışır (panelde uyarı gösterilir).
 * Frontend widget'ı VITE_TURNSTILE_SITEKEY ile derlenir; ikisi birlikte ayarlanmalıdır.
 */
const SECRET = process.env.TURNSTILE_SECRET || '';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const captchaEnabled = () => Boolean(SECRET);

export const verifyTurnstile = async (token, ip) => {
  if (!SECRET) return true; // kurulu değil → geç
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: SECRET, response: String(token) });
    if (ip) body.set('remoteip', ip);
    const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    return data?.success === true;
  } catch {
    return false; // doğrulanamadıysa güvenli taraf: reddet (yönetici tekrar dener)
  }
};
