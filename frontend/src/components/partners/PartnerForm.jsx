import { useState } from 'react';
import { X, Plus, Trash2, Star } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { Field, Segmented } from '../form/FormKit';
import { PARTNER_KINDS } from '../../utils/partner';

const emptyContact = () => ({ name: '', title: '', phone: '', email: '', isPrimary: false });

/**
 * Müşteri / tedarikçi kartı. Yalnızca unvan zorunlu; ara sıra alışveriş yapan müşteri birkaç saniyede açılır.
 * quick: teklif ekranından hızlı müşteri ekleme (kısa form).
 * Bayi kartında yalnızca iletişim e-postası, yetkililer ve iç not düzenlenir (ticari ayarlar Bayi Yönetimi'nde).
 */
const PartnerForm = ({ partner, initialKind = 'CUSTOMER', quick = false, meta, onClose, onSaved }) => {
  const dealer = partner?.kind === 'DEALER';
  const [form, setForm] = useState(() => ({
    kind: partner?.kind || initialKind,
    name: partner?.name || '',
    externalCode: partner?.externalCode || '',
    taxOffice: partner?.taxOffice || '',
    taxNumber: partner?.taxNumber || '',
    phone: partner?.phone || '',
    email: partner?.email || '',
    address: partner?.address || '',
    paymentTermDays: partner?.paymentTermDays ?? 0,
    riskLimit: partner?.riskLimit ?? 0,
    currency: partner?.currency || 'TRY',
    notes: partner?.notes || '',
    status: partner?.status || 'ACTIVE',
    tags: (partner?.tags || []).join(', '),
    ownerId: partner?.owner?.id || partner?.ownerId || '',
    contacts: partner?.contacts?.length ? partner.contacts.map(({ name, title, phone, email, isPrimary }) => ({ name, title: title || '', phone: phone || '', email: email || '', isPrimary })) : []
  }));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setContact = (i, patch) => setForm({ ...form, contacts: form.contacts.map((c, idx) => (idx === i ? { ...c, ...patch } : patch.isPrimary ? { ...c, isPrimary: false } : c)) });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = quick ? form : { ...form, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean), ownerId: form.ownerId || null };
      const res = partner ? await api.patch(`/partners/${partner.id}`, body) : await api.post('/partners', body);
      onSaved(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Kaydedilemedi.'));
    } finally {
      setBusy(false);
    }
  };

  const title = partner ? `${partner.name} · Kartı düzenle` : quick ? 'Yeni müşteri (portal dışı)' : form.kind === 'SUPPLIER' ? 'Yeni tedarikçi' : 'Yeni müşteri';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <form onSubmit={submit} className="modal-panel w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="modal-title">{title}</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-5 overflow-y-auto">
          {dealer && <p className="text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-xl p-3">Bayinin unvan, vergi, risk limiti ve iskonto bilgileri Bayi Yönetimi ekranında düzenlenir. Burada yetkili kişileri, iletişim e-postasını ve iç notu değiştirebilirsiniz.</p>}
          {quick && <p className="text-xs text-gray-500">Portala giriş yapmayan, ara sıra alışveriş yapan müşteriler için. Yalnızca ad / unvan zorunlu; diğer bilgileri sonra Cari Hesaplar'dan tamamlayabilirsiniz.</p>}

          {!dealer && !quick && (
            <Field label="Cari türü">
              <Segmented size="sm" value={form.kind} onChange={(kind) => setForm({ ...form, kind })}
                options={['CUSTOMER', 'SUPPLIER'].map((k) => ({ value: k, label: PARTNER_KINDS[k].label, icon: PARTNER_KINDS[k].icon }))} />
            </Field>
          )}

          {!dealer && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Unvan / ad soyad" required className="md:col-span-2"><input autoFocus required className="premium-input" maxLength={200} value={form.name} onChange={set('name')} /></Field>
              <Field label="Telefon"><input className="premium-input" value={form.phone} onChange={set('phone')} /></Field>
              <Field label="E-posta"><input type="email" className="premium-input" value={form.email} onChange={set('email')} /></Field>
              <Field label="Vergi dairesi"><input className="premium-input" value={form.taxOffice} onChange={set('taxOffice')} /></Field>
              <Field label="Vergi no / TC kimlik no"><input className="premium-input font-mono" value={form.taxNumber} onChange={set('taxNumber')} /></Field>
              {!quick && <>
                <Field label="Cari kodu" hint="Muhasebe / ERP programındaki kod"><input className="premium-input font-mono" value={form.externalCode} onChange={set('externalCode')} /></Field>
                <Field label="Vade (gün)"><input type="number" min="0" className="premium-input" value={form.paymentTermDays} onChange={set('paymentTermDays')} /></Field>
                <Field label="Cari para birimi" hint={partner ? 'Hareketi olan carinin para birimi değiştirilemez.' : 'Bakiye ve ekstre bu para biriminde tutulur.'}>
                  <Segmented size="sm" value={form.currency} onChange={(currency) => setForm({ ...form, currency })}
                    options={[{ value: 'TRY', label: '₺ TL' }, { value: 'USD', label: '$ USD' }, { value: 'EUR', label: '€ EUR' }]} />
                </Field>
                {form.kind === 'CUSTOMER' && <Field label={`Risk limiti (${{ TRY: '₺', USD: '$', EUR: '€' }[form.currency]})`} hint="0 = sınır yok / takip edilmiyor"><input type="number" min="0" step="0.01" className="premium-input" value={form.riskLimit} onChange={set('riskLimit')} /></Field>}
                {partner && <Field label="Durum"><select className="premium-input" value={form.status} onChange={set('status')}><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option></select></Field>}
              </>}
              <Field label="Adres" className="md:col-span-2"><input className="premium-input" value={form.address} onChange={set('address')} /></Field>
            </div>
          )}
          {dealer && <Field label="İletişim e-postası"><input type="email" className="premium-input" value={form.email} onChange={set('email')} /></Field>}

          {!quick && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Etiketler" hint="Virgülle ayırın: İstanbul, Toptan, Takipte">
                <input list="partner-tags" className="premium-input" value={form.tags} onChange={set('tags')} />
                <datalist id="partner-tags">{(meta?.tags || []).map((t) => <option key={t} value={t} />)}</datalist>
              </Field>
              <Field label="Sorumlu personel">
                <select className="premium-input" value={form.ownerId} onChange={set('ownerId')}>
                  <option value="">Atanmamış</option>
                  {(meta?.staff || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
            </div>
          )}

          {!quick && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-gray-900">Yetkili kişiler</p>
                <button type="button" onClick={() => setForm({ ...form, contacts: [...form.contacts, { ...emptyContact(), isPrimary: form.contacts.length === 0 }] })} className="flex items-center text-xs font-black text-indigo-600 hover:underline"><Plus className="h-3.5 w-3.5 mr-1" /> Kişi ekle</button>
              </div>
              {form.contacts.length === 0 && <p className="text-xs text-gray-400">Kayıtlı yetkili yok.</p>}
              {form.contacts.map((c, i) => (
                <div key={i} className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center rounded-xl bg-gray-50 p-2">
                  <input required className="premium-input !bg-white !py-2" placeholder="Ad soyad *" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} />
                  <input className="premium-input !bg-white !py-2" placeholder="Görevi (satın alma…)" value={c.title} onChange={(e) => setContact(i, { title: e.target.value })} />
                  <input className="premium-input !bg-white !py-2" placeholder="Telefon" value={c.phone} onChange={(e) => setContact(i, { phone: e.target.value })} />
                  <input type="email" className="premium-input !bg-white !py-2" placeholder="E-posta" value={c.email} onChange={(e) => setContact(i, { email: e.target.value })} />
                  <div className="flex gap-1 justify-end">
                    <button type="button" title="Birincil yetkili" onClick={() => setContact(i, { isPrimary: true })} className={`p-2 rounded-lg ${c.isPrimary ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}><Star className="h-4 w-4" fill={c.isPrimary ? 'currentColor' : 'none'} /></button>
                    <button type="button" title="Kaldır" onClick={() => setForm({ ...form, contacts: form.contacts.filter((_, idx) => idx !== i) })} className="p-2 rounded-lg text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!quick && <Field label="İç not" hint="Yalnızca ekibiniz görür."><textarea className="premium-input h-20 resize-none" maxLength={2000} value={form.notes} onChange={set('notes')} /></Field>}
          {error && <p className="text-xs font-bold text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}
        </div>
        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 h-11 rounded-xl text-sm font-black text-gray-600 bg-gray-100 hover:bg-gray-200">Vazgeç</button>
          <button disabled={busy} className="btn-gradient disabled:opacity-50">{partner ? 'Kaydet' : 'Kartı Oluştur'}</button>
        </div>
      </form>
    </div>
  );
};

export default PartnerForm;
