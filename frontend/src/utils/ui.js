// Ad soyaddan baş harfler ("Ahmet Akis" → "AA")
export const initials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toLocaleUpperCase('tr-TR');

// Üst çubuktaki belirgin düğme (Destek vb.); telefonda yalnızca ikon görünür
export const headerButtonClass = 'h-10 flex items-center gap-2 px-3 md:px-4 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-700 hover:border-brand-300 hover:text-brand-600 transition-colors';
