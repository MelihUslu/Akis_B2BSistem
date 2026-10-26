import { Wrench, Receipt, Lightbulb, GraduationCap, MessageCircle } from 'lucide-react';

// Destek taleplerinin konu türleri, durumları ve öncelikleri (firma ve platform ekranları ortak kullanır)
export const TICKET_CATEGORIES = {
  TECHNICAL: { label: 'Teknik sorun', desc: 'Hata, çalışmayan ekran, erişim sorunu', icon: Wrench, tile: 'bg-rose-50 text-rose-600', ring: 'ring-rose-300 bg-rose-50/60' },
  BILLING: { label: 'Fatura / Abonelik', desc: 'Ödeme, paket, fatura soruları', icon: Receipt, tile: 'bg-amber-50 text-amber-600', ring: 'ring-amber-300 bg-amber-50/60' },
  FEATURE: { label: 'Özellik isteği', desc: 'Sistemde olmasını istediğiniz bir şey', icon: Lightbulb, tile: 'bg-violet-50 text-violet-600', ring: 'ring-violet-300 bg-violet-50/60' },
  USAGE: { label: 'Kullanım sorusu', desc: '“Bunu nasıl yaparım?” soruları', icon: GraduationCap, tile: 'bg-blue-50 text-blue-600', ring: 'ring-blue-300 bg-blue-50/60' },
  OTHER: { label: 'Diğer', desc: 'Yukarıdakilere uymayan konular', icon: MessageCircle, tile: 'bg-slate-100 text-slate-600', ring: 'ring-slate-300 bg-slate-50' },
};

export const TICKET_STATUS = {
  OPEN: { label: 'Yanıt bekliyor', className: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400' },
  ANSWERED: { label: 'Yanıtlandı', className: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  CLOSED: { label: 'Kapandı', className: 'bg-gray-100 text-gray-500', bar: 'bg-gray-300' },
};

export const PRIORITY = {
  NORMAL: { label: 'Normal', className: 'text-gray-500' },
  HIGH: { label: 'Yüksek', className: 'text-red-600' },
};

const HOUR = 60 * 60 * 1000;
export const timeAgo = (date, now = Date.now()) => {
  const diff = now - new Date(date).getTime();
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / 60000))} dk önce`;
  if (diff < 24 * HOUR) return `${Math.round(diff / HOUR)} saat önce`;
  if (diff < 7 * 24 * HOUR) return `${Math.round(diff / (24 * HOUR))} gün önce`;
  return new Date(date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
};

export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toLocaleUpperCase('tr-TR') || '?';

// Hedef yanıt süresi (SLA) gösterimi: "1 sa 20 dk kaldı" / "3 sa gecikti"
const span = (ms) => {
  const m = Math.round(Math.abs(ms) / 60000);
  if (m < 60) return `${Math.max(1, m)} dk`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} sa${m % 60 ? ` ${m % 60} dk` : ''}`;
  return `${Math.round(h / 24)} gün`;
};
export const slaState = (dueAt, now = Date.now()) => {
  if (!dueAt) return null;
  const left = new Date(dueAt).getTime() - now;
  if (left < 0) return { label: `${span(left)} gecikti`, className: 'bg-red-100 text-red-700', overdue: true };
  if (left < 60 * 60 * 1000) return { label: `${span(left)} kaldı`, className: 'bg-amber-100 text-amber-700' };
  return { label: `${span(left)} kaldı`, className: 'bg-slate-100 text-slate-600' };
};

export const formatSize = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
