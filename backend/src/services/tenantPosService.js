import { decrypt } from '../utils/secretBox.js';
import { SANDBOX_URL, LIVE_URL } from './iyzicoService.js';

export const POS_PROVIDERS = ['IYZICO', 'PAYTR'];

/**
 * Firmanın seçtiği sanal POS'un anahtarları (yoksa null).
 *  IYZICO: posApiKey = API anahtarı, posSecretEnc = şifreli gizli anahtar
 *  PAYTR:  posApiKey = mağaza no, posSecretEnc = şifreli { merchantKey, merchantSalt }
 */
export const tenantPosCreds = (tenant) => {
  if (!tenant?.posProvider || !tenant.posApiKey || !tenant.posSecretEnc) return null;
  const secret = decrypt(tenant.posSecretEnc);
  if (tenant.posProvider === 'IYZICO') {
    return { provider: 'IYZICO', apiKey: tenant.posApiKey, secretKey: secret, baseUrl: tenant.posMode === 'LIVE' ? LIVE_URL : SANDBOX_URL };
  }
  if (tenant.posProvider === 'PAYTR') {
    const { merchantKey, merchantSalt } = JSON.parse(secret);
    return { provider: 'PAYTR', merchantId: tenant.posApiKey, merchantKey, merchantSalt, testMode: tenant.posMode !== 'LIVE' };
  }
  return null;
};

// Bayi ekranının göstereceği ödeme yöntemi: IYZICO | PAYTR | DEMO (geliştirmede, POS yoksa) | NONE
export const posMode = (tenant) => {
  const creds = tenantPosCreds(tenant);
  if (creds) return creds.provider;
  return process.env.NODE_ENV === 'production' ? 'NONE' : 'DEMO';
};
