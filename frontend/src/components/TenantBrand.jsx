import React from 'react';
import { useTenant } from '../context/TenantContext';

// Firma logosu varsa logo, yoksa firma adı
const TenantBrand = ({ className = '', compact = false, textClass = 'text-white' }) => {
  const { tenant } = useTenant();
  if (tenant?.logoUrl) {
    return <img src={tenant.logoUrl} alt={tenant.name} className={`${compact ? 'h-8 max-w-[3rem]' : 'h-10 max-w-[11rem]'} object-contain ${className}`} />;
  }
  const name = tenant?.name || 'B2B Portal';
  return (
    <span className={`font-black tracking-tighter uppercase leading-tight ${compact ? 'text-lg' : 'text-xl'} ${textClass} ${className}`}>
      {compact ? name.slice(0, 2) : name}
    </span>
  );
};

export default TenantBrand;
