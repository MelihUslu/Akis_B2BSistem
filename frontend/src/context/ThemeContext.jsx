import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ theme: 'light', resolved: 'light', setTheme: () => {} });
const KEY = 'akis_theme';
const media = () => window.matchMedia?.('(prefers-color-scheme: dark)');

const readTheme = () => {
  try { return localStorage.getItem(KEY) || 'light'; } catch { return 'light'; }
};
const resolve = (theme) => (theme === 'system' ? (media()?.matches ? 'dark' : 'light') : theme);

/**
 * Açık / koyu / sistem teması. Seçim tarayıcıda saklanır ve <html> etiketine "dark" sınıfı olarak uygulanır;
 * renkler index.css'teki koyu mod değişkenlerinden gelir. Yazdırma sayfaları her zaman açık temadadır.
 */
export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(readTheme);
  const [resolved, setResolved] = useState(() => resolve(readTheme()));

  useEffect(() => {
    const apply = () => {
      const r = resolve(theme);
      setResolved(r);
      document.documentElement.classList.toggle('dark', r === 'dark' && !window.location.pathname.startsWith('/print'));
    };
    apply();
    if (theme !== 'system') return undefined;
    const mq = media();
    mq?.addEventListener('change', apply);
    return () => mq?.removeEventListener('change', apply);
  }, [theme]);

  const setTheme = (next) => {
    try { localStorage.setItem(KEY, next); } catch { /* gizli sekme */ }
    setThemeState(next);
  };

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
