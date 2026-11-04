import { Users, Award, Crown } from 'lucide-react';

/**
 * Hangi bayi grupları görsün: hiçbiri seçili değilse tüm bayiler görür. Ürün ve kategori formunda kullanılır.
 * value: ['GOLD', 'VIP'] gibi grup listesi
 */
const GROUPS = [{ value: 'STANDART', label: 'Standart', icon: Users }, { value: 'GOLD', label: 'Gold', icon: Award }, { value: 'VIP', label: 'VIP', icon: Crown }];

const GroupVisibility = ({ value = [], onChange }) => {
  const all = value.length === 0;
  const toggle = (g) => onChange(value.includes(g) ? value.filter((x) => x !== g) : [...value, g]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Görünür bayi grupları">
        <button type="button" onClick={() => onChange([])} aria-pressed={all}
          className={`h-9 px-3 rounded-xl text-xs font-bold ring-1 ${all ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-gray-600 ring-gray-200 hover:ring-gray-300'}`}>Tüm bayiler</button>
        {GROUPS.map(({ value: g, label, icon: Icon }) => (
          <button key={g} type="button" onClick={() => toggle(g)} aria-pressed={value.includes(g)}
            className={`h-9 px-3 rounded-xl text-xs font-bold ring-1 flex items-center gap-1.5 ${value.includes(g) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-gray-600 ring-gray-200 hover:ring-gray-300'}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">{all ? 'Tüm bayiler görür ve sipariş verebilir.' : `Yalnızca ${value.join(', ')} grubundaki bayiler görür; diğerlerinin kataloğunda, aramasında ve hızlı siparişinde çıkmaz.`}</p>
    </div>
  );
};

export default GroupVisibility;
