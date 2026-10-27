import { UserRound, Truck, Store } from 'lucide-react';

// Cari türleri: bayi (portala girer), portal dışı müşteri, tedarikçi
export const PARTNER_KINDS = {
  DEALER: { label: 'Bayi', plural: 'Bayiler', icon: Store, className: 'bg-indigo-50 text-indigo-700' },
  CUSTOMER: { label: 'Müşteri', plural: 'Müşteriler', icon: UserRound, className: 'bg-emerald-50 text-emerald-700' },
  SUPPLIER: { label: 'Tedarikçi', plural: 'Tedarikçiler', icon: Truck, className: 'bg-amber-50 text-amber-700' },
};

// Bakiye carinin gözünden: eksi = bize borçlu, artı = alacaklı (tedarikçide "borcumuz")
export const balanceText = (kind, balance) => {
  if (!balance) return { label: 'Bakiye yok', className: 'text-gray-400' };
  if (balance < 0) return { label: 'Borçlu', className: 'text-red-600' };
  return { label: kind === 'SUPPLIER' ? 'Alacaklı (borcumuz)' : 'Alacaklı', className: 'text-emerald-600' };
};

// Manuel cari hareket türleri, cari türüne göre anlaşılır adlarla
export const transactionTypes = (kind) => (kind === 'SUPPLIER'
  ? [
    { id: 'CREDIT', label: 'Alış faturası / borcumuz', desc: 'Tedarikçi alacaklanır' },
    { id: 'DEBT', label: 'Tedarikçiye ödeme', desc: 'Tedarikçi borçlanır' }
  ]
  : [
    { id: 'DEBT', label: 'Satış / fatura / masraf', desc: 'Cari borçlanır' },
    { id: 'CREDIT', label: 'Tahsilat / iade', desc: 'Cari alacaklanır' }
  ]);

// Tahsilat / ödeme yöntemleri (elle girilenler)
export const PAYMENT_METHODS = {
  CASH: 'Nakit',
  WIRE_TRANSFER: 'Havale / EFT',
  CARD: 'Kredi kartı (fiziki POS)',
  CHECK: 'Çek',
  NOTE: 'Senet',
  POS: 'Sanal POS',
  MANUAL: 'Diğer'
};

// Cari hareketinin kaynağı
export const TX_SOURCES = {
  ORDER: { label: 'Sipariş', className: 'bg-indigo-50 text-indigo-600' },
  RETURN: { label: 'İade', className: 'bg-orange-50 text-orange-600' },
  PAYMENT: { label: 'Tahsilat / ödeme', className: 'bg-emerald-50 text-emerald-700' },
  ERP: { label: 'ERP', className: 'bg-slate-100 text-slate-600' },
  OPENING: { label: 'Açılış', className: 'bg-slate-100 text-slate-600' },
  MANUAL: { label: 'Manuel', className: 'bg-gray-100 text-gray-600' },
  REVERSAL: { label: 'Ters kayıt', className: 'bg-red-50 text-red-600' }
};

export const AGING_LABELS = [
  ['notDue', 'Vadesi gelmemiş'], ['d30', '1–30 gün'], ['d60', '31–60 gün'], ['d90', '61–90 gün'], ['d90plus', '90+ gün'], ['unmatched', 'Açılış / eşleşmeyen']
];
