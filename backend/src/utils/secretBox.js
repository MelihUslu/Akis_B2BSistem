import crypto from 'crypto';

/**
 * Hassas ayarların (örn. firmanın sanal POS gizli anahtarı) veritabanında şifreli saklanması.
 * Anahtar: ENCRYPTION_KEY (yoksa JWT_SECRET'tan türetilir — canlıda ENCRYPTION_KEY tanımlayın,
 * aksi halde JWT_SECRET değişince kayıtlı anahtarlar çözülemez).
 */
const key = () => crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || process.env.JWT_SECRET).digest();

export const encrypt = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
};

export const decrypt = (encoded) => {
  const buf = Buffer.from(encoded, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
};
