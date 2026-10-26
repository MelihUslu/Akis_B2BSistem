import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const NEXT = { light: 'dark', dark: 'system', system: 'light' };
const META = {
  light: { icon: Sun, label: 'Açık tema' },
  dark: { icon: Moon, label: 'Koyu tema' },
  system: { icon: Monitor, label: 'Sistem teması' }
};

// Açık → koyu → sistem arasında döner
const ThemeToggle = ({ className = '' }) => {
  const { theme, setTheme } = useTheme();
  const { icon: Icon, label } = META[theme] || META.light;
  return (
    <button
      onClick={() => setTheme(NEXT[theme] || 'dark')}
      title={`${label} (değiştirmek için tıklayın)`}
      aria-label={label}
      className={`p-2.5 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors ${className}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
};

export default ThemeToggle;
