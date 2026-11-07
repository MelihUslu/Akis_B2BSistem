import { useState } from 'react';
import { MapPin, CalendarPlus, LocateFixed, CheckCircle2 } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import Modal from '../shared/Modal';

// Saha ziyareti pencereleri (plasiyer paneli): ziyaret kaydı ve ziyaret planı
const RESULTS = { ORDER: 'Sipariş alındı', PAYMENT: 'Tahsilat yapıldı', INFO: 'Bilgilendirme / tanıtım', NO_CONTACT: 'Görüşülemedi' };
const today = () => new Date().toLocaleDateString('sv-SE');
const inDays = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv-SE');

/**
 * Ziyaret kaydı: sonuç, not, isteğe bağlı konum (telefonun izniyle) ve sonraki ziyaret günü.
 * planned verilirse o planlı ziyaret yapıldı olarak işaretlenir.
 */
export const VisitRecordModal = ({ dealer, planned, onClose, onSaved }) => {
  const [form, setForm] = useState({ result: '', note: '', nextVisitOn: '' });
  const [loc, setLoc] = useState(null); // { lat, lng, accuracy } | 'pending' | 'denied'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const locate = () => {
    if (!navigator.geolocation) { setLoc('denied'); return; }
    setLoc('pending');
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => setLoc('denied'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/plasiyer/visits/check-in', {
        ...(planned ? { visitId: planned.id } : { companyId: dealer.id }),
        result: form.result, note: form.note, nextVisitOn: form.nextVisitOn || undefined,
        ...(loc && typeof loc === 'object' && loc)
      });
      onSaved(res.data.message);
    } catch (err) {
      setError(errorMessage(err, 'Ziyaret kaydedilemedi.'));
      setBusy(false);
    }
  };

  return (
    <Modal as="form" onSubmit={submit} icon={MapPin} title="Ziyaret kaydı" subtitle={dealer.name} onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button><button disabled={busy || !form.result} className="btn-gradient disabled:opacity-50">Kaydet</button></>}>
      <fieldset>
        <legend className="premium-label">Sonuç</legend>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(RESULTS).map(([k, label]) => (
            <label key={k} className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold cursor-pointer ${form.result === k ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-gray-200 text-gray-700'}`}>
              <input type="radio" name="result" value={k} checked={form.result === k} onChange={() => setForm({ ...form, result: k })} className="accent-brand-600" /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="premium-label" htmlFor="v-note">Not</label>
        <textarea id="v-note" rows={3} maxLength={500} className="premium-input" placeholder="Görüşme notu, talep, rakip bilgisi…" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={locate} className="h-10 px-3 rounded-xl ring-1 ring-gray-200 text-sm font-semibold text-gray-700 inline-flex items-center gap-1.5 hover:bg-gray-50"><LocateFixed className="h-4 w-4" /> Konumu ekle</button>
        {loc === 'pending' && <span className="text-xs text-gray-500">Konum alınıyor…</span>}
        {loc === 'denied' && <span className="text-xs text-amber-700">Konum alınamadı (izin verilmedi); ziyaret konumsuz kaydedilir.</span>}
        {loc && typeof loc === 'object' && <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Konum eklendi (±{Math.round(loc.accuracy)} m)</span>}
      </div>
      <div>
        <label className="premium-label" htmlFor="v-next">Sonraki ziyaret (isteğe bağlı)</label>
        <input id="v-next" type="date" min={inDays(1)} className="premium-input" value={form.nextVisitOn} onChange={(e) => setForm({ ...form, nextVisitOn: e.target.value })} />
      </div>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </Modal>
  );
};

export const VisitPlanModal = ({ dealer, onClose, onSaved }) => {
  const [day, setDay] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/plasiyer/visits', { companyId: dealer.id, plannedFor: day, note });
      onSaved(res.data.message);
    } catch (err) {
      setError(errorMessage(err, 'Ziyaret planlanamadı.'));
      setBusy(false);
    }
  };
  return (
    <Modal as="form" onSubmit={submit} icon={CalendarPlus} title="Ziyaret planla" subtitle={dealer.name} onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button><button disabled={busy || !day} className="btn-gradient disabled:opacity-50">Planla</button></>}>
      <div>
        <label className="premium-label" htmlFor="p-day">Gün</label>
        <input id="p-day" type="date" required min={today()} className="premium-input" value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
      <div>
        <label className="premium-label" htmlFor="p-note">Not</label>
        <input id="p-note" maxLength={500} className="premium-input" placeholder="İsteğe bağlı (ör. yeni katalog götür)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </Modal>
  );
};
