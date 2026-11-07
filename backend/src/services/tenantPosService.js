import { decrypt } from '../utils/secretBox.js';
import { SANDBOX_URL, LIVE_URL } from './iyzicoService.js';

export const POS_PROVIDERS = ['IYZICO', 'PAYTR'];
// Kartla ödemede seçilebilen en fazla taksit sayıları (iyzico ve PayTR ikisi de destekler)
export const INSTALLMENT_OPTIONS = [1, 2, 3, 6, 9, 12];

// IYZICO_POS_URL yalnızca testlerde (taklit sunucu); canlıda firmanın seçtiği ortam kullanılır
const iyzicoUrl = (tenant) => process.env.IYZICO_POS_URL || (tenant.posMode === 'LIVE' ? LIVE_URL : SANDBOX_URL);

/**
 * Firmanın seçtiği sanal POS'un anahtarları (yoksa null).
 *  IYZICO: posApiKey = API anahtarı, posSecretEnc = şifreli gizli anahtar
 *  PAYTR:  posApiKey = mağaza no, posSecretEnc = şifreli { merchantKey, merchantSalt }
 */
export const tenantPosCreds = (tenant) => {
  if (!tenant?.posProvider || !tenant.posApiKey || !tenant.posSecretEnc) return null;
  const secret = decrypt(tenant.posSecretEnc);
  if (tenant.posProvider === 'IYZICO') {
    return { provider: 'IYZICO', apiKey: tenant.posApiKey, secretKey: secret, baseUrl: iyzicoUrl(tenant) };
  }
  if (tenant.posProvider === 'PAYTR') {
    const { merchantKey, merchantSalt } = JSON.parse(secret);
    return { provider: 'PAYTR', merchantId: tenant.posApiKey, merchantKey, merchantSalt, testMode: tenant.posMode !== 'LIVE' };
  }
  return null;
};

/** Bu tutardaki ödemede gösterilecek en fazla taksit (1: tek çekim) */
export const maxInstallmentFor = (tenant, amount) => {
  const max = INSTALLMENT_OPTIONS.includes(tenant?.posMaxInstallment) ? tenant.posMaxInstallment : 1;
  return max > 1 && amount >= (tenant.posInstallmentMin || 0) ? max : 1;
};

// Bayi ekranının göstereceği ödeme yöntemi: IYZICO | PAYTR | DEMO (geliştirmede, POS yoksa) | NONE
export const posMode = (tenant) => {
  const creds = tenantPosCreds(tenant);
  if (creds) return creds.provider;
  return process.env.NODE_ENV === 'production' ? 'NONE' : 'DEMO';
};
