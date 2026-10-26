import crypto from 'crypto';

// RFC 6238 TOTP (Google Authenticator, Microsoft Authenticator vb. ile uyumlu): 30 sn, 6 hane, SHA-1
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const base32Encode = (buf) => {
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
};

export const base32Decode = (str) => {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of clean) bits += ALPHABET.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
};

export const generateSecret = () => base32Encode(crypto.randomBytes(20));

export const hotp = (secretBuf, counter, digits = 6, algo = 'sha1') => {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac(algo, secretBuf).update(msg).digest();
  const offset = h[h.length - 1] & 0xf;
  const code = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
};

// Saat farkına tolerans için bir önceki ve sonraki 30 sn penceresi de kabul edilir
export const verifyTotp = (base32Secret, token, now = Date.now()) => {
  const code = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  const secret = base32Decode(base32Secret);
  const step = Math.floor(now / 1000 / 30);
  return [-1, 0, 1].some(w => {
    const expected = hotp(secret, step + w);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code));
  });
};

export const otpauthUrl = ({ secret, account, issuer }) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
