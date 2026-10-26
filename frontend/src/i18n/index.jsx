import { createContext, useContext, useState } from 'react';
import en from './en';

/**
 * Bayi portalı için hafif çoklu dil. Anahtar, Türkçe metnin kendisidir: t('Sepete Ekle').
 * Çevirisi olmayan metin Türkçe görünür (ekran bozulmaz). {ad} yer tutucuları değerlerle doldurulur.
 * Dil değişince sayfa yeniden yüklenir (bileşen dışındaki sabit etiketler de yeni dilde oluşsun);
 * seçim tarayıcıda saklanır ve API'ye X-Lang başlığıyla gider.
 */
export const LANGUAGES = [{ code: 'tr', label: 'Türkçe', flag: '🇹🇷' }, { code: 'en', label: 'English', flag: '🇬🇧' }];
const DICTS = { en };
const KEY = 'akis_lang';

const readLang = () => {
  try { const l = localStorage.getItem(KEY); return DICTS[l] || l === 'tr' ? l : 'tr'; } catch { return 'tr'; }
};
let current = readLang();
if (typeof document !== 'undefined') document.documentElement.lang = current;
export const getLang = () => current;

export const t = (text, vars) => {
  const s = (current !== 'tr' && DICTS[current]?.[text]) || text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s;
};

// Sayı / para / tarih biçimi seçili dile göre
export const locale = () => (current === 'en' ? 'en-GB' : 'tr-TR');

const I18nContext = createContext({ lang: 'tr', setLang: () => {} });

export const I18nProvider = ({ children }) => {
  const [lang, setLangState] = useState(current);
  const setLang = (l) => {
    if (l === lang) return;
    try { localStorage.setItem(KEY, l); } catch { /* gizli sekme */ }
    current = l;
    setLangState(l);
    window.location.reload();
  };
  return <I18nContext.Provider value={{ lang, setLang }}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);
