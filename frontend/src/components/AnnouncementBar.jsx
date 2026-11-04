import { useEffect, useState } from 'react';
import { Megaphone, AlertTriangle, Wrench, X } from 'lucide-react';
import api from '../services/api';

const STYLE = {
  INFO: { icon: Megaphone, className: 'bg-brand-50 border-brand-100 text-brand-800' },
  WARNING: { icon: AlertTriangle, className: 'bg-amber-50 border-amber-200 text-amber-800' },
  MAINTENANCE: { icon: Wrench, className: 'bg-red-50 border-red-100 text-red-800' }
};
const KEY = 'akis_dismissed_announcements';

const readDismissed = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
};

// Platformun yayınladığı duyurular (bakım, yeni özellik). Kapatılan duyuru bu tarayıcıda bir daha gösterilmez.
const AnnouncementBar = () => {
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    api.get('/account/announcements').then((r) => setItems(r.data)).catch(() => {});
  }, []);

  const dismiss = (id) => {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* yok say */ }
  };

  const visible = items.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      {visible.map((a) => {
        const { icon: Icon, className } = STYLE[a.level] || STYLE.INFO;
        return (
          <div key={a.id} className={`flex items-start gap-3 rounded-2xl border px-5 py-4 ${className}`}>
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-black">{a.title}</p>
              <p className="text-xs mt-0.5 whitespace-pre-line">{a.body}</p>
            </div>
            <button onClick={() => dismiss(a.id)} className="opacity-60 hover:opacity-100" aria-label="Kapat"><X className="h-4 w-4" /></button>
          </div>
        );
      })}
    </div>
  );
};

export default AnnouncementBar;
