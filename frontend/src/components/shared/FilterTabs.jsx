
// Tailwind sınıfları derleme anında taranır; her renk tonu sabit yazılır
const TONES = {
  slate: { on: 'bg-slate-800 text-white shadow-md shadow-slate-800/20', icon: 'text-slate-500', badgeOn: 'bg-white/20 text-white', badge: 'bg-slate-100 text-slate-600' },
  orange: { on: 'bg-orange-500 text-white shadow-md shadow-orange-500/25', icon: 'text-orange-500', badgeOn: 'bg-white/25 text-white', badge: 'bg-orange-100 text-orange-700' },
  emerald: { on: 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25', icon: 'text-emerald-500', badgeOn: 'bg-white/25 text-white', badge: 'bg-emerald-100 text-emerald-700' },
  blue: { on: 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25', icon: 'text-indigo-500', badgeOn: 'bg-white/25 text-white', badge: 'bg-indigo-100 text-indigo-700' },
  violet: { on: 'bg-violet-600 text-white shadow-md shadow-violet-600/25', icon: 'text-violet-500', badgeOn: 'bg-white/25 text-white', badge: 'bg-violet-100 text-violet-700' },
  red: { on: 'bg-red-500 text-white shadow-md shadow-red-500/25', icon: 'text-red-500', badgeOn: 'bg-white/25 text-white', badge: 'bg-red-100 text-red-600' },
  gray: { on: 'bg-gray-500 text-white shadow-md shadow-gray-500/25', icon: 'text-gray-400', badgeOn: 'bg-white/25 text-white', badge: 'bg-gray-100 text-gray-500' },
};

/**
 * Renkli, ikonlu ve sayaçlı durum sekmeleri.
 * tabs: [{ id, label, icon, tone, count?, alert? }] — alert: seçili değilken bile dikkat çeksin (ör. bekleyen başvuru)
 * compact: dar sütunlar için iki sütunlu ızgara (sekmeler kesilmez)
 */
const FilterTabs = ({ tabs, value, onChange, className = '', compact = false }) => (
  <div className={`${compact ? 'grid grid-cols-2 w-full' : 'inline-flex max-w-full overflow-x-auto'} gap-1 p-1 rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm ${className}`}>
    {tabs.map((t) => {
      const tone = TONES[t.tone] || TONES.slate;
      const on = value === t.id;
      const Icon = t.icon;
      return (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          className={`relative flex items-center gap-2 rounded-xl font-bold whitespace-nowrap transition-all ${compact ? 'h-9 px-2.5 text-xs' : 'h-10 px-3.5 text-sm'} ${on ? tone.on : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}>
          {Icon && <Icon className={`h-4 w-4 ${on ? 'text-current' : tone.icon}`} />}
          {t.label}
          {t.count !== undefined && t.count !== null && (
            <span className={`${compact ? 'ml-auto' : ''} min-w-[1.4rem] px-1.5 py-0.5 rounded-md text-[11px] font-black tabular-nums text-center ${on ? tone.badgeOn : t.alert && t.count ? tone.badge : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
          )}
          {t.alert && !on && t.count > 0 && <span className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ${tone.on.split(' ')[0]} animate-pulse`} />}
        </button>
      );
    })}
  </div>
);

export default FilterTabs;
