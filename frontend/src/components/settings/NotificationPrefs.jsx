import { useEffect, useState } from 'react';
import { BellRing, Mail } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { Toggle } from '../form/FormKit';
import { t } from '../../i18n';

// Hangi bildirimlerin e-postayla da gelsin? (Panel içindeki zil bildirimleri her zaman oluşur.)
const NotificationPrefs = ({ showAlert }) => {
  const [data, setData] = useState(null);

  useEffect(() => { api.get('/auth/notification-prefs').then((r) => setData(r.data)).catch(() => {}); }, []);

  const toggle = async (id, value) => {
    const prefs = { ...data.prefs, [id]: value };
    setData({ ...data, prefs });
    try {
      await api.put('/auth/notification-prefs', { prefs });
    } catch (err) {
      setData(data);
      showAlert?.({ type: 'error', title: t('Kaydedilemedi'), message: errorMessage(err, t('Tercih kaydedilemedi.')) });
    }
  };

  if (!data) return null;
  return (
    <div className="card-premium p-5 md:p-6 space-y-4">
      <div>
        <h3 className="font-black text-gray-900 flex items-center"><BellRing className="h-5 w-5 mr-2 text-indigo-500" /> {t('Bildirim tercihleri')}</h3>
        <p className="text-xs text-gray-500 mt-1">{t('Panel içindeki bildirimler her zaman gelir. Aşağıdakileri açarsanız aynı bildirim e-postanıza da gönderilir.')}</p>
      </div>
      <div className="divide-y divide-gray-100 rounded-xl ring-1 ring-gray-100 overflow-hidden">
        {data.types.map((type, i) => (
          <label key={type.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${i % 2 ? 'bg-slate-50/70' : 'bg-white'}`}>
            <Mail className={`h-4 w-4 shrink-0 ${data.prefs[type.id] ? 'text-indigo-500' : 'text-gray-300'}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-gray-800">{type.label}</span>
              <span className="block text-[11px] text-gray-400">{type.description}</span>
            </span>
            <Toggle checked={Boolean(data.prefs[type.id])} onChange={(v) => toggle(type.id, v)} />
          </label>
        ))}
      </div>
    </div>
  );
};

export default NotificationPrefs;
