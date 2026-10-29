import { Sparkles } from 'lucide-react';

// Tanıtım sayfasının ortak görsel parçaları

// "✦ Etiket" rozeti (bölüm üst başlığı)
export const Chip = ({ children, icon: Icon = Sparkles }) => (
  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white border border-slate-200/80 shadow-sm text-[13px] font-semibold text-slate-800">
    <Icon className="h-3.5 w-3.5 text-indigo-500" /> {children}
  </span>
);

// Vurgulu kelime: beyaz kutu içinde turkuaz → mor yazı
export const Highlight = ({ children }) => (
  <span className="inline-block align-baseline bg-white rounded-2xl md:rounded-3xl px-3 md:px-5 pb-1 md:pb-2 shadow-[0_8px_30px_-12px_rgba(79,70,229,0.35)] mx-1">
    <span className="text-indigo-600">{children}</span>
  </span>
);

// Bölüm başlığı (sıkı aralıklı, büyük)
export const Heading = ({ children, className = '' }) => (
  <h2 className={`text-3xl sm:text-4xl lg:text-[3.25rem] font-semibold tracking-[-0.04em] leading-[1.08] text-slate-950 ${className}`}>{children}</h2>
);

// Siyah düğme, altında renk geçişli çizgi
export const PrimaryButton = ({ href, onClick, children, className = '', type, disabled }) => {
  const inner = 'flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[#0b0d12] text-white text-[15px] font-semibold hover:bg-black transition-colors';
  return (
    <span className={`inline-block rounded-xl bg-indigo-500 pb-1 transition-transform ${disabled ? 'opacity-60' : 'hover:-translate-y-0.5'} ${className}`}>
      {href ? <a href={href} className={inner}>{children}</a> : <button type={type || 'button'} onClick={onClick} disabled={disabled} className={`${inner} w-full disabled:cursor-not-allowed`}>{children}</button>}
    </span>
  );
};

// Çift çerçeveli kart: dışta ince çerçeve, içte beyaz yüzey
export const Frame = ({ children, className = '', inner = '' }) => (
  <div className={`rounded-[2rem] border border-slate-200/70 bg-white/40 p-2 ${className}`}>
    <div className={`rounded-[1.6rem] bg-white shadow-[0_10px_40px_-20px_rgba(15,23,42,0.18)] h-full ${inner}`}>{children}</div>
  </div>
);

// Köşe işaretleri (yüzen arayüz parçalarının çerçevesi)
export const Brackets = ({ children, className = '' }) => (
  <div className={`relative p-3 ${className}`}>
    {['top-0 left-0 border-t border-l', 'top-0 right-0 border-t border-r', 'bottom-0 left-0 border-b border-l', 'bottom-0 right-0 border-b border-r'].map((c) => (
      <span key={c} className={`absolute h-2.5 w-2.5 border-slate-400/70 ${c}`} />
    ))}
    {children}
  </div>
);
