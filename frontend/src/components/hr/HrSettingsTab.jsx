import { useEffect, useState } from 'react';
import { CalendarCog, Plus, Trash2, Save, Info } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { Field } from '../form/FormKit';
import { formatDate } from '../../utils/format';

const Switch = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-brand-600' : 'bg-gray-200'}`}>
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
);

/**
 * İzin kuralları (Personel yetkisi): Cumartesi iş günü mü, kalan günü aşan yıllık izin (avans izin), tatil günleri.
 * Sabit resmî tatiller her yıl otomatik düşülür; dini bayramlar her yıl değiştiği için firma buraya ekler.
 */
const HrSettingsTab = ({ showAlert }) => {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({ date: '', name: '', half: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/hr/settings').then((r) => setData(r.data)).catch(() => setData(null)); }, []);

  const add = () => {
    if (!draft.date) return;
    const holidays = [...data.holidays.filter((h) => h.date !== draft.date), { ...draft, name: draft.name.trim() || 'Tatil' }].sort((a, b) => a.date.localeCompare(b.date));
    setData({ ...data, holidays });
    setDraft({ date: '', name: draft.name, half: false });
  };
  const save = async () => {
    setBusy(true);
    try {
      const res = await api.put('/hr/settings', { saturdayWorkday: data.saturdayWorkday, allowNegativeLeave: data.allowNegativeLeave, holidays: data.holidays });
      showAlert({ type: 'success', title: 'Kaydedildi', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Kaydedilemedi', message: errorMessage(err, 'Ayarlar kaydedilemedi.') });
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;
  const year = new Date().getFullYear();
  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h3 className="font-black text-gray-900 flex items-center gap-2"><CalendarCog className="h-5 w-5 text-brand-500" /> İzin günü hesabı</h3>
        <div className="flex items-start justify-between gap-4 rounded-2xl ring-1 ring-gray-100 p-4">
          <div>
            <p className="font-bold text-sm text-gray-900">Cumartesi iş günü sayılsın</p>
            <p className="text-xs text-gray-500 mt-0.5">Haftada 6 gün çalışılıyorsa açın; izinde Cumartesi de düşer. Pazar ve resmî tatiller her zaman sayılmaz.</p>
          </div>
          <Switch on={data.saturdayWorkday} onChange={(v) => setData({ ...data, saturdayWorkday: v })} label="Cumartesi iş günü" />
        </div>
        <div className="flex items-start justify-between gap-4 rounded-2xl ring-1 ring-gray-100 p-4">
          <div>
            <p className="font-bold text-sm text-gray-900">Kalan günü aşan yıllık izne izin ver (avans izin)</p>
            <p className="text-xs text-gray-500 mt-0.5">Kapalıyken personel kalan gününden fazla yıllık izin isteyemez; açıkken bakiye eksiye düşebilir.</p>
          </div>
          <Switch on={data.allowNegativeLeave} onChange={(v) => setData({ ...data, allowNegativeLeave: v })} label="Avans izin" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div>
          <h3 className="font-black text-gray-900">Tatil günleri</h3>
          <p className="text-xs text-gray-500 mt-1 flex items-start gap-1.5"><Info className="h-4 w-4 shrink-0 text-gray-400" /> Ramazan ve Kurban Bayramı tarihleri her yıl değişir; Diyanet takviminden buraya ekleyin. Arife günlerini "yarım gün" işaretleyin. Firmanızın ek tatillerini (ör. yılbaşı köprüsü) de ekleyebilirsiniz.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[10rem_minmax(0,1fr)_auto_auto] gap-2 sm:items-end">
          <Field label="Tarih"><input type="date" className="premium-input" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} aria-label="Tatil tarihi" /></Field>
          <Field label="Adı"><input maxLength={80} className="premium-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ramazan Bayramı" aria-label="Tatil adı" /></Field>
          <label className="h-11 flex items-center gap-2 text-sm font-semibold text-gray-600 cursor-pointer"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={draft.half} onChange={(e) => setDraft({ ...draft, half: e.target.checked })} /> Yarım gün</label>
          <button type="button" onClick={add} disabled={!draft.date} className="h-11 px-4 rounded-xl ring-1 ring-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5 disabled:opacity-50"><Plus className="h-4 w-4" /> Ekle</button>
        </div>
        {data.holidays.length === 0 ? <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Henüz firma tatili eklenmedi: dini bayramlar izin hesabında iş günü sayılır.</p> : (
          <ul className="divide-y divide-gray-50 rounded-2xl ring-1 ring-gray-100">
            {data.holidays.map((h) => (
              <li key={h.date} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-28 shrink-0 font-bold text-gray-900 tabular-nums">{formatDate(`${h.date}T12:00:00`)}</span>
                <span className="flex-1 min-w-0 truncate text-gray-700">{h.name}{h.half && <span className="ml-2 text-xs font-bold text-gray-400">yarım gün</span>}</span>
                <button type="button" onClick={() => setData({ ...data, holidays: data.holidays.filter((x) => x.date !== h.date) })} className="p-2 text-gray-400 hover:text-red-600" aria-label={`${h.name} sil`}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer font-bold text-gray-600">Her yıl otomatik düşülen resmî tatiller ({year}–{year + 1})</summary>
          <ul className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1">
            {data.fixedHolidays.map((h) => <li key={h.date}>{formatDate(`${h.date}T12:00:00`)} · {h.name}{h.half && ' (yarım gün)'}</li>)}
          </ul>
        </details>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={busy} className="btn-gradient disabled:opacity-50"><Save className="h-4 w-4 mr-1.5" /> Kaydet</button>
      </div>
    </div>
  );
};

export default HrSettingsTab;
