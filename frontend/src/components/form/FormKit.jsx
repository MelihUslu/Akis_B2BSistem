import { Check } from 'lucide-react';

/**
 * Açılır pencerelerdeki formlar için ortak parçalar: ikonlu başlıklı bölüm kartı, etiketli alan,
 * ikon/birim ekli giriş kutusu, tek tıkla seçim (segment) ve açma/kapama anahtarı.
 */

// Tailwind sınıfları derleme anında taranır; renkler bu yüzden sabit yazılır
const TINT = {
  blue: 'bg-brand-50 text-brand-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600',
  violet: 'bg-violet-50 text-violet-600', rose: 'bg-rose-50 text-rose-600', indigo: 'bg-brand-50 text-brand-600', slate: 'bg-slate-100 text-slate-600'
};
const SWITCH = { blue: 'bg-brand-500', orange: 'bg-orange-500', emerald: 'bg-emerald-500', red: 'bg-red-500' };

export const Section = ({ icon: Icon, title, description, color = 'blue', children, aside }) => (
  <section className="rounded-2xl ring-1 ring-gray-100 bg-white p-5 space-y-4">
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className={`p-2 rounded-xl shrink-0 ${TINT[color] || TINT.blue}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div>
          <h4 className="text-sm font-black text-gray-900">{title}</h4>
          {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
        </div>
      </div>
      {aside}
    </div>
    {children}
  </section>
);

export const Field = ({ label, icon: Icon, required, hint, error, children, className = '' }) => (
  <div className={`space-y-1.5 ${className}`}>
    {label && (
      <label className="flex items-center text-[11px] font-bold text-gray-500">
        {Icon && <Icon className="h-3.5 w-3.5 mr-1.5 text-gray-400" />}
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
    )}
    {children}
    {error ? <p className="text-[11px] font-semibold text-red-500">{error}</p> : hint && <p className="text-[11px] text-gray-400">{hint}</p>}
  </div>
);

const inputBase = 'w-full h-11 rounded-xl bg-gray-50 border text-sm font-semibold text-gray-900 placeholder:text-gray-300 placeholder:font-medium outline-none transition-all focus:bg-white focus:ring-4';

// Solunda ikon, sağında birim (₺, %, adet) olabilen giriş kutusu
export const IconInput = ({ icon: Icon, suffix, invalid, className = '', as = 'input', children, ...props }) => {
  const Tag = as;
  const tone = invalid ? 'border-red-300 focus:ring-red-100 focus:border-red-300' : 'border-transparent hover:border-gray-200 focus:ring-brand-100 focus:border-brand-300';
  return (
    <div className="relative">
      {Icon && <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />}
      <Tag {...props} className={`${inputBase} ${tone} ${Icon ? 'pl-10' : 'pl-3.5'} ${suffix ? 'pr-12' : 'pr-3.5'} ${as === 'select' ? 'appearance-none cursor-pointer' : ''} ${className}`}>{children}</Tag>
      {suffix && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 pointer-events-none">{suffix}</span>}
    </div>
  );
};

export const TextArea = ({ invalid, className = '', ...props }) => (
  <textarea {...props} className={`w-full rounded-xl bg-gray-50 border ${invalid ? 'border-red-300' : 'border-transparent hover:border-gray-200 focus:border-brand-300'} p-3.5 text-sm text-gray-900 placeholder:text-gray-300 outline-none transition-all focus:bg-white focus:ring-4 focus:ring-brand-100 resize-none ${className}`} />
);

// Az seçenekli alanlar için tek tıkla seçim: [{ value, label, icon?, activeClass? }] — activeClass: seçiliyken farklı renk
export const Segmented = ({ options, value, onChange, size = 'md' }) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map((o) => {
      const active = String(o.value) === String(value);
      return (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`inline-flex items-center gap-1.5 rounded-xl border font-bold transition-all ${size === 'sm' ? 'h-9 px-3 text-xs' : 'h-11 px-4 text-sm'} ${active ? o.activeClass || 'bg-brand-600 border-brand-600 text-white shadow-md shadow-brand-500/20' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}>
          {o.icon && <o.icon className="h-4 w-4" />}
          {o.label}
          {active && size !== 'sm' && <Check className="h-3.5 w-3.5" />}
        </button>
      );
    })}
  </div>
);

export const Toggle = ({ checked, onChange, color = 'blue' }) => (
  <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
    className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${checked ? SWITCH[color] || SWITCH.blue : 'bg-gray-200'}`}>
    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
  </button>
);

// Sol taraftaki adım menüsü: [{ id, title, desc, icon, done, error }]
export const StepNav = ({ steps, active, onSelect }) => (
  <nav className="space-y-1">
    {steps.map((s, i) => {
      const on = s.id === active;
      return (
        <button key={s.id} type="button" onClick={() => onSelect(s.id)}
          className={`w-full text-left flex items-start gap-3 p-3 rounded-xl transition-all ${on ? 'bg-white shadow-sm ring-1 ring-gray-100' : 'hover:bg-white/60'}`}>
          <span className={`relative mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${on ? 'bg-brand-600 text-white shadow-md shadow-brand-500/25' : s.done ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
            {s.done && !on ? <Check className="h-4 w-4" /> : s.icon ? <s.icon className="h-4 w-4" /> : i + 1}
            {s.error && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-gray-50" />}
          </span>
          <span className="min-w-0">
            <span className={`block text-sm font-bold ${on ? 'text-gray-900' : 'text-gray-600'}`}>{s.title}</span>
            {s.desc && <span className="block text-[11px] text-gray-400 leading-snug mt-0.5">{s.desc}</span>}
          </span>
        </button>
      );
    })}
  </nav>
);
