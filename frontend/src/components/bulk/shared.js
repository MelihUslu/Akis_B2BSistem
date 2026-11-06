import { formatMoney } from '../../utils/format';

// Toplu SMS ve toplu e-postanın ortak parçaları (sunucudaki fillTemplate ile aynı kurallar)
export const PLACEHOLDERS = [['{ad}', 'Firma / kişi adı'], ['{yetkili}', 'Yetkili kişi'], ['{bakiye}', 'Cari bakiye']];
export const fillTemplate = (template, row) => template
  .replace(/\{ad\}/g, row.name)
  .replace(/\{yetkili\}/g, row.contact || row.name)
  .replace(/\{bakiye\}/g, row.balance == null ? '' : `${formatMoney(Math.abs(row.balance), row.currency || 'TRY')}${row.balance < 0 ? ' borç' : row.balance > 0 ? ' alacak' : ''}`);
export const phoneText = (p) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6, 8)} ${p.slice(8)}`;
// E-postada kullanılabilir adresler: aboneliği bırakanlar hariç
export const usableEmails = (row) => (row.emails || []).filter((e) => !(row.optedOut || []).includes(e));
// Kanala göre ulaşılabilir numaralar / adresler (boşsa satır seçilemez)
export const reachable = (row, channel) => (channel === 'sms' ? row.phones : usableEmails(row));
