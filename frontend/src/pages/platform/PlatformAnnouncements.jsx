import React, { useEffect, useState } from 'react';
import { Megaphone, Trash2 } from 'lucide-react';
import { platformApi, errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { formatDate } from '../../utils/format';

const LEVELS = {
  INFO: { label: 'Bilgi', className: 'bg-indigo-100 text-indigo-700' },
  WARNING: { label: 'Uyarı', className: 'bg-amber-100 text-amber-700' },
  MAINTENANCE: { label: 'Bakım', className: 'bg-red-100 text-red-600' }
};

const empty = { title: '', body: '', level: 'INFO', planCode: '', startsAt: '', endsAt: '' };

// Tüm müşterilerin (veya tek bir paketin) yönetici panelinin üstünde görünen duyurular
const PlatformAnnouncements = () => {
  const [items, setItems] = useState([]);
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(empty);
  const { alertElement, showAlert, confirm } = useAlert();

  const load = () => platformApi.get('/announcements').then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => {
    load();
    platformApi.get('/plans').then((r) => setPlans(r.data.plans)).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const res = await platformApi.post('/announcements', form);
      setForm(empty);
      showAlert({ type: 'success', title: 'Yayınlandı', message: res.data.message });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Yayınlanamadı.') });
    }
  };

  const remove = async (a) => {
    if (!(await confirm({ type: 'warning', title: 'Duyuru kaldırılsın mı?', message: a.title, confirmText: 'Kaldır' }))) return;
    await platformApi.delete(`/announcements/${a.id}`);
    load();
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const now = new Date();

  return (
    <div className="space-y-8 max-w-5xl">
      {alertElement}
      <div className="flex items-center gap-4">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3.5 rounded-2xl shadow-lg shadow-indigo-500/25 shrink-0"><Megaphone className="h-6 w-6 text-white" /></div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Duyurular</h1>
          <p className="text-gray-500 text-sm mt-1">Bakım, yeni özellik ve fiyat değişikliklerini müşterilerinizin yönetim paneline duyurun.</p>
        </div>
      </div>

      <form onSubmit={submit} className="card-premium p-6 space-y-4">
        <h3 className="font-black text-gray-900 flex items-center"><Megaphone className="h-5 w-5 mr-2 text-indigo-500" /> Yeni Duyuru</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2"><label className="premium-label">Başlık</label><input required maxLength={120} className="premium-input" value={form.title} onChange={set('title')} /></div>
          <div><label className="premium-label">Tür</label>
            <select className="premium-input" value={form.level} onChange={set('level')}>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          </div>
          <div><label className="premium-label">Kime</label>
            <select className="premium-input" value={form.planCode} onChange={set('planCode')}>
              <option value="">Tüm müşteriler</option>
              {plans.map((p) => <option key={p.code} value={p.code}>{p.name} paketi</option>)}
            </select>
          </div>
          <div className="md:col-span-4"><label className="premium-label">Metin</label><textarea required maxLength={1000} className="premium-input h-24 resize-none" value={form.body} onChange={set('body')} /></div>
          <div><label className="premium-label">Başlangıç (boşsa hemen)</label><input type="date" className="premium-input" value={form.startsAt} onChange={set('startsAt')} /></div>
          <div><label className="premium-label">Bitiş (boşsa süresiz)</label><input type="date" className="premium-input" value={form.endsAt} onChange={set('endsAt')} /></div>
        </div>
        <button className="btn-gradient">Yayınla</button>
      </form>

      <div className="card-premium p-6">
        <div className="divide-y divide-gray-50">
          {items.map((a) => {
            const live = new Date(a.startsAt) <= now && (!a.endsAt || new Date(a.endsAt) >= now);
            return (
              <div key={a.id} className="py-4 flex justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`pill-badge ${LEVELS[a.level]?.className}`}>{LEVELS[a.level]?.label}</span>
                    <span className="text-sm font-black text-gray-900">{a.title}</span>
                    {!live && <span className="pill-badge bg-gray-100 text-gray-500">Yayında değil</span>}
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{a.body}</p>
                  <p className="text-[11px] text-gray-400 mt-1">{a.planCode ? `${a.planCode} paketi` : 'Tüm müşteriler'} · {formatDate(a.startsAt)} – {a.endsAt ? formatDate(a.endsAt) : 'süresiz'}</p>
                </div>
                <button onClick={() => remove(a)} className="p-2 h-fit text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
          {items.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Henüz duyuru yok.</p>}
        </div>
      </div>
    </div>
  );
};

export default PlatformAnnouncements;
