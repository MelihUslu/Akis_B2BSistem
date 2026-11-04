import { useEffect, useState } from 'react';
import { MapPin, Plus, Star, Pencil, Trash2, X, User, Phone, Building, Save, Check } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { Field, IconInput, TextArea } from '../form/FormKit';
import { PROVINCES, formatAddress } from '../../utils/turkey';
import { t } from '../../i18n';

const EMPTY = { title: '', contactName: '', phone: '', city: '', district: '', line: '', postalCode: '', isDefault: false };

export const AddressForm = ({ initial, onSave, onCancel, busy }) => {
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="rounded-2xl ring-1 ring-brand-100 bg-brand-50/30 p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('Adres adı')} required><IconInput icon={Building} required maxLength={60} placeholder={t('Merkez depo, Ankara şube…')} value={form.title} onChange={set('title')} /></Field>
        <Field label={t('Teslim alacak kişi')} required><IconInput icon={User} required maxLength={80} value={form.contactName} onChange={set('contactName')} /></Field>
        <Field label={t('Telefon')} required><IconInput icon={Phone} type="tel" required maxLength={30} placeholder={t('05xx xxx xx xx')} value={form.phone} onChange={set('phone')} /></Field>
        <Field label={t('İl')} required>
          <IconInput as="select" icon={MapPin} required value={form.city} onChange={set('city')}>
            <option value="">{t('İl seçin')}</option>
            {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
          </IconInput>
        </Field>
        <Field label={t('İlçe')} required><IconInput icon={MapPin} required maxLength={60} value={form.district} onChange={set('district')} /></Field>
        <Field label={t('Posta kodu')}><IconInput maxLength={10} inputMode="numeric" value={form.postalCode || ''} onChange={set('postalCode')} /></Field>
        <Field label={t('Açık adres')} required className="sm:col-span-2" hint={t('Mahalle, cadde/sokak, bina ve kapı no')}>
          <TextArea required minLength={10} maxLength={300} className="h-20" value={form.line} onChange={set('line')} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
        <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> {t('Varsayılan teslimat adresi yap')}
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 h-9 px-3 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100"><X className="h-3.5 w-3.5" /> {t('Vazgeç')}</button>
        <button disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-brand-600 text-white text-xs font-bold disabled:opacity-50"><Save className="h-3.5 w-3.5" /> {t('Kaydet')}</button>
      </div>
    </form>
  );
};

/**
 * Teslimat adresleri. base: '/addresses' (bayi) veya '/companies/:id/addresses' (yönetici).
 * selectable: ödeme ekranında adres seçimi (value / onSelect)
 */
const AddressBook = ({ base = '/addresses', showAlert, selectable = false, value, onSelect, compact = false }) => {
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | adres
  const [busy, setBusy] = useState(false);

  const load = () => api.get(base).then((r) => {
    setList(r.data);
    if (selectable && !value && r.data.length) onSelect?.(r.data.find((a) => a.isDefault)?.id || r.data[0].id);
  }).catch(() => setList([]));
  useEffect(() => { load(); }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (form) => {
    setBusy(true);
    try {
      const res = editing === 'new' ? await api.post(base, form) : await api.patch(`${base}/${editing.id}`, form);
      setEditing(null);
      await load();
      if (selectable) onSelect?.(res.data.address.id);
    } catch (err) {
      showAlert?.({ type: 'error', title: t('Adres kaydedilemedi'), message: errorMessage(err, t('Hata oluştu.')) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a) => {
    try {
      await api.delete(`${base}/${a.id}`);
      if (value === a.id) onSelect?.(null);
      load();
    } catch (err) {
      showAlert?.({ type: 'error', title: t('Silinemedi'), message: errorMessage(err, t('Hata oluştu.')) });
    }
  };

  const makeDefault = (a) => api.patch(`${base}/${a.id}`, { isDefault: true }).then(load);

  if (!list) return null;

  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
        {list.map((a) => {
          const on = selectable && value === a.id;
          return (
            <div key={a.id} onClick={() => selectable && onSelect?.(a.id)}
              className={`relative rounded-2xl p-4 ring-1 transition-all ${selectable ? 'cursor-pointer' : ''} ${on ? 'ring-2 ring-brand-500 bg-brand-50/40' : 'ring-gray-100 bg-white hover:ring-gray-200'}`}>
              <div className="flex items-start gap-3">
                <span className={`p-2 rounded-xl shrink-0 ${on ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{on ? <Check className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-gray-900 flex items-center gap-2">
                    {a.title}
                    {a.isDefault && <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-bold">{t('Varsayılan')}</span>}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{formatAddress(a)}</p>
                  <p className="text-[11px] text-gray-400 mt-1">{a.contactName} · {a.phone}</p>
                </div>
              </div>
              <div className="flex justify-end gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                {!a.isDefault && <button onClick={() => makeDefault(a)} title={t('Varsayılan yap')} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50"><Star className="h-3.5 w-3.5" /></button>}
                <button onClick={() => setEditing(a)} title={t('Düzenle')} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(a)} title={t('Sil')} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          );
        })}
      </div>
      {list.length === 0 && !editing && <p className="text-sm text-gray-400">{t('Henüz teslimat adresi yok. Kargo için il ve ilçesi belli bir adres ekleyin.')}</p>}
      {editing ? (
        <AddressForm initial={editing === 'new' ? { isDefault: list.length === 0 } : editing} busy={busy} onSave={save} onCancel={() => setEditing(null)} />
      ) : (
        <button onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border-2 border-dashed border-gray-200 text-xs font-bold text-gray-500 hover:border-brand-300 hover:text-brand-600">
          <Plus className="h-4 w-4" /> {t('Yeni adres ekle')}
        </button>
      )}
    </div>
  );
};

export default AddressBook;
