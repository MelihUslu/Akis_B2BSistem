// Çok kullanıcılı testler: seed/seed.mjs'nin ürettiği oturum anahtarları (.data/tokens.json).
// Her sanal kullanıcı kendi hesabıyla girer: 1000 farklı yönetici, 1000 farklı bayi.
import { SharedArray } from 'k6/data';
import { fail } from 'k6';

const load = (key) => new SharedArray(key, () => {
  try { return JSON.parse(open('../.data/tokens.json'))[key]; } catch { return []; }
});
export const ADMIN_TOKENS = load('admins');
export const DEALER_TOKENS = load('dealers');

export const tokenFor = (list, vu) => {
  if (!list.length) fail('Oturum anahtarı yok: önce seed/seed.mjs ile yük testi verisini üretin (README → Büyük ölçekli testler).');
  return list[(vu - 1) % list.length];
};
