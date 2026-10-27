import { useTenant } from '../context/TenantContext';

// Firma logosu varsa logo, yoksa firma adı.
// onDark: koyu menüde logo beyaz zemin üzerinde gösterilir (koyu renkli logolar kaybolmasın)
const TenantBrand = ({ className = '', compact = false, textClass = 'text-white', onDark = false }) => {
  const { tenant } = useTenant();
  if (tenant?.logoUrl) {
    const img = <img src={tenant.logoUrl} alt={tenant.name} className={`${compact ? 'h-8 max-w-[3rem]' : 'h-10 max-w-[11rem]'} object-contain ${onDark ? '' : className}`} />;
    return onDark ? <span className={`inline-flex items-center bg-[#fff] rounded-xl ${compact ? 'p-1.5' : 'px-3 py-2'} shadow-sm ${className}`}>{img}</span> : img;
  }
  const name = tenant?.name || 'B2B Portal';
  return (
    <span className={`font-black tracking-tighter uppercase leading-tight ${compact ? 'text-lg' : 'text-xl'} ${textClass} ${className}`}>
      {compact ? name.slice(0, 2) : name}
    </span>
  );
};

export default TenantBrand;
