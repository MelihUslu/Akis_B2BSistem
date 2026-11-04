import { useEffect, useState } from 'react';
import { Save, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw, Lock, ListChecks } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import LeadFormBody from './LeadFormBody';
import ModalHeader from '../shared/ModalHeader';

const TYPES = { text: 'Kısa metin', textarea: 'Uzun metin', number: 'Sayı', select: 'Seçenek listesi' };
const BUILTIN_TYPE = { name: 'text', phone: 'tel', email: 'email', city: 'text', request: 'textarea' };
const BUILTIN_NAME = { name: 'Ad soyad', phone: 'Telefon', email: 'E-posta', city: 'Şehir', request: 'Talep / mesaj' };
const LOCKED = new Set(['name', 'phone']);

// Önizleme için: kapalı alanlar çıkar, hazır alanların türü eklenir, seçenekler listeye çevrilir
const previewOf = (form) => ({
  ...form,
  fields: form.fields.filter((f) => f.enabled && f.label.trim()).map((f) => ({
    ...f,
    type: f.custom ? f.type : BUILTIN_TYPE[f.key],
    options: f.custom && f.type === 'select' ? optionList(f.options) : []
  }))
});
const optionList = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((o) => o.trim()).filter(Boolean);

const Toggle = ({ on, onChange, disabled, label }) => (
  <button type="button" onClick={() => !disabled && onChange(!on)} aria-pressed={on} disabled={disabled}
    className={`flex items-center gap-2 text-xs font-bold ${disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600'}`}>
    <span className={`h-5 w-9 rounded-full p-0.5 transition-colors ${on ? (disabled ? 'bg-brand-300' : 'bg-brand-600') : 'bg-gray-200'}`}>
      <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
    </span>
    {label}
  </button>
);

/**
 * Talep formunu düzenleme: başlık / açıklama / düğme yazısı, hazır alanları açıp kapatma ve zorunlu yapma,
 * ek soru ekleme (kısa metin, uzun metin, sayı, seçenek listesi), sıralama. Sağda canlı önizleme.
 */
const LeadFormEditor = ({ onClose, onSaved, companyName }) => {
  const [form, setForm] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [maxCustom, setMaxCustom] = useState(12);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('edit'); // telefonda düzenle / önizle

  useEffect(() => {
    api.get('/customer-leads/form').then((r) => {
      setForm({ ...r.data.form, fields: r.data.form.fields.map((f) => ({ ...f, options: (f.options || []).join(', ') })) });
      setDefaults(r.data.defaults);
      setMaxCustom(r.data.maxCustom);
    }).catch((err) => setError(errorMessage(err, 'Form ayarları yüklenemedi.')));
  }, []);

  const setText = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setField = (i, patch) => setForm({ ...form, fields: form.fields.map((f, j) => (j === i ? { ...f, ...patch, ...(patch.enabled === false && { required: false }) } : f)) });
  const move = (i, d) => {
    const fields = [...form.fields];
    [fields[i], fields[i + d]] = [fields[i + d], fields[i]];
    setForm({ ...form, fields });
  };
  const removeField = (i) => setForm({ ...form, fields: form.fields.filter((_, j) => j !== i) });
  const customCount = form?.fields.filter((f) => f.custom).length || 0;
  const addField = () => setForm({ ...form, fields: [...form.fields, { key: `new_${Date.now()}`, custom: true, type: 'text', enabled: true, required: false, label: '', placeholder: '', options: '' }] });
  const reset = () => setForm({ ...defaults, fields: defaults.fields.map((f) => ({ ...f, options: '' })) });

  const save = async () => {
    setError(null);
    const bad = form.fields.find((f) => f.custom && (!f.label.trim() || (f.type === 'select' && optionList(f.options).length < 2)));
    if (bad) {
      setError(!bad.label.trim() ? 'Eklediğiniz her sorunun bir başlığı olmalı.' : `"${bad.label}" için en az iki seçenek yazın (virgülle ayırın).`);
      return;
    }
    setSaving(true);
    try {
      const body = { ...form, fields: form.fields.map((f) => ({ ...f, options: optionList(f.options) })) };
      const res = await api.put('/customer-leads/form', body);
      onSaved?.(res.data.message);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Form kaydedilemedi.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel w-full max-w-6xl h-[94vh] flex flex-col">
        <ModalHeader icon={ListChecks} title="Talep formunu düzenle" subtitle="Reklamdan gelen kişinin dolduracağı formdaki yazıları ve soruları belirleyin." onClose={onClose} />

        <div className="lg:hidden px-4 pt-3 grid grid-cols-2 gap-1">
          {[['edit', 'Düzenle'], ['preview', 'Önizleme']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`h-9 rounded-xl text-sm font-black ${tab === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>{l}</button>
          ))}
        </div>

        {!form ? (
          <div className="flex-1 flex items-center justify-center text-sm font-bold text-gray-400">{error || 'Yükleniyor…'}</div>
        ) : (
          <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_24rem]">
            {/* Düzenleyici */}
            <div className={`${tab === 'edit' ? 'block' : 'hidden'} lg:block overflow-y-auto p-4 md:p-6 space-y-6`}>
              <section className="space-y-3">
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Yazılar</p>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="md:col-span-2"><label className="premium-label">Başlık</label><input className="premium-input" maxLength={120} value={form.title} onChange={setText('title')} /></div>
                  <div className="md:col-span-2"><label className="premium-label">Açıklama</label><textarea className="premium-input h-20 resize-none" maxLength={400} value={form.description} onChange={setText('description')} /></div>
                  <div><label className="premium-label">Düğme yazısı</label><input className="premium-input" maxLength={40} value={form.buttonText} onChange={setText('buttonText')} /></div>
                  <div><label className="premium-label">Gönderince çıkan mesaj</label><input className="premium-input" maxLength={300} value={form.successMessage} onChange={setText('successMessage')} /></div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Alanlar</p>
                    <p className="text-xs text-gray-500 mt-1">Ad ve telefon her zaman sorulur. Diğer alanları açıp kapatabilir, zorunlu yapabilir, sıralayabilirsiniz.</p>
                  </div>
                </div>
                {form.fields.map((f, i) => (
                  <div key={f.key} className={`rounded-2xl border p-4 space-y-3 ${f.enabled ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50/60'}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-30" aria-label="Yukarı"><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button type="button" disabled={i === form.fields.length - 1} onClick={() => move(i, 1)} className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-30" aria-label="Aşağı"><ArrowDown className="h-3.5 w-3.5" /></button>
                      </div>
                      <input className="premium-input flex-1 !h-10 font-bold" value={f.label} maxLength={80} onChange={(e) => setField(i, { label: e.target.value })} placeholder={f.custom ? 'Soru (örn: Kaç koli istiyorsunuz?)' : BUILTIN_NAME[f.key]} />
                      {f.custom
                        ? <button type="button" onClick={() => removeField(i)} className="p-2 text-gray-300 hover:text-red-500" aria-label="Soruyu sil"><Trash2 className="h-4 w-4" /></button>
                        : <span className="px-2 py-1 rounded-lg bg-gray-100 text-[11px] font-black text-gray-500 uppercase whitespace-nowrap flex items-center gap-1">{LOCKED.has(f.key) && <Lock className="h-3 w-3" />}{BUILTIN_NAME[f.key]}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pl-7">
                      {f.custom && (
                        <select className="premium-input !h-9 !w-auto !py-0 text-xs" value={f.type} onChange={(e) => setField(i, { type: e.target.value })} aria-label="Soru türü">
                          {Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      )}
                      <Toggle on={f.enabled} disabled={LOCKED.has(f.key)} onChange={(v) => setField(i, { enabled: v })} label="Formda göster" />
                      <Toggle on={f.required} disabled={LOCKED.has(f.key) || !f.enabled} onChange={(v) => setField(i, { required: v })} label="Zorunlu" />
                    </div>
                    {f.enabled && (
                      <div className="pl-7 grid md:grid-cols-2 gap-3">
                        {f.custom && f.type === 'select'
                          ? <div className="md:col-span-2"><label className="premium-label">Seçenekler (virgülle ayırın)</label><input className="premium-input" value={f.options} onChange={(e) => setField(i, { options: e.target.value })} placeholder="Market, Toptancı, Otel" /></div>
                          : <div className="md:col-span-2"><label className="premium-label">İpucu yazısı (isteğe bağlı)</label><input className="premium-input" maxLength={120} value={f.placeholder} onChange={(e) => setField(i, { placeholder: e.target.value })} placeholder="Kutunun içinde soluk görünen örnek" /></div>}
                      </div>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addField} disabled={customCount >= maxCustom}
                  className="w-full h-12 rounded-2xl border-2 border-dashed border-brand-200 text-sm font-black text-brand-600 hover:bg-brand-50 flex items-center justify-center gap-2 disabled:opacity-40">
                  <Plus className="h-4 w-4" /> Soru ekle {customCount > 0 && <span className="text-brand-400 font-bold">({customCount}/{maxCustom})</span>}
                </button>
              </section>
            </div>

            {/* Önizleme */}
            <div className={`${tab === 'preview' ? 'block' : 'hidden'} lg:block overflow-y-auto bg-slate-100/70 border-l border-gray-100 p-4 md:p-6`}>
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Müşterinin göreceği</p>
              <div className="mx-auto max-w-sm bg-white rounded-[2rem] shadow-xl border border-slate-100 p-6 space-y-4">
                <LeadFormBody form={previewOf(form)} values={{}} set={() => () => {}} companyName={companyName} preview />
              </div>
            </div>
          </div>
        )}

        <div className="p-4 md:p-5 border-t border-gray-100 flex flex-wrap items-center gap-3">
          {error && form && <p className="w-full text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
          <button type="button" onClick={reset} disabled={!defaults} className="flex items-center gap-1.5 px-3 h-11 rounded-xl text-sm font-bold text-gray-500 hover:text-gray-900"><RotateCcw className="h-4 w-4" /> Varsayılana dön</button>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button>
          <button type="button" onClick={save} disabled={!form || saving} className="btn-gradient disabled:opacity-60"><Save className="h-4 w-4 mr-2" /> Kaydet</button>
        </div>
      </div>
    </div>
  );
};

export default LeadFormEditor;
