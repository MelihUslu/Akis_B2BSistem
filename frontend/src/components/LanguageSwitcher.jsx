import { LANGUAGES, useI18n } from '../i18n';

// Bayi portalı dil seçimi (TR / EN)
const LanguageSwitcher = ({ className = '' }) => {
  const { lang, setLang } = useI18n();
  return (
    <div className={`flex items-center bg-gray-100 rounded-xl p-0.5 ${className}`}>
      {LANGUAGES.map((l) => (
        <button key={l.code} type="button" title={l.label} onClick={() => setLang(l.code)}
          className={`px-2 h-8 rounded-lg text-[11px] font-black uppercase transition ${lang === l.code ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
          {l.code}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
