import React from 'react';

export const TENANT_STATUS = {
  TRIAL: { label: 'Deneme', className: 'bg-indigo-100 text-indigo-700' },
  ACTIVE: { label: 'Aktif', className: 'bg-emerald-100 text-emerald-700' },
  PAST_DUE: { label: 'Ödeme Gecikti', className: 'bg-amber-100 text-amber-700' },
  SUSPENDED: { label: 'Askıda', className: 'bg-red-100 text-red-600' },
  CANCELLED: { label: 'İptal', className: 'bg-gray-200 text-gray-600' },
};

export const StatusPill = ({ status, access }) => {
  const s = TENANT_STATUS[status] || TENANT_STATUS.TRIAL;
  const expired = access && !access.active && ['TRIAL_EXPIRED', 'EXPIRED'].includes(access.reason);
  return (
    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${expired ? 'bg-red-100 text-red-600' : s.className}`}>
      {expired ? (access.reason === 'TRIAL_EXPIRED' ? 'Deneme Bitti' : 'Süresi Doldu') : s.label}
    </span>
  );
};

export const limitLabel = (n) => (n < 0 ? '∞' : n.toLocaleString('tr-TR'));
