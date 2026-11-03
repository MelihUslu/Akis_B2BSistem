import { useState } from 'react';
import { Plus, Minus, Paperclip, X, Repeat, Pencil, Trash2, Pause, Play, ArrowDownLeft, ArrowUpRight, Camera, Target } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import Modal from '../shared/Modal';
import { downloadFile } from '../../utils/download';
import { formatTRY, formatDate } from '../../utils/format';
import { METHODS, VAT_RATES, parseAmount, vatOf } from '../../utils/cash';

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

const TypeSwitch = ({ value, onChange }) => (
  <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
    {[['OUT', 'Gider', Minus], ['IN', 'Gelir', Plus]].map(([t, label, Icon]) => (
      <button key={t} type="button" onClick={() => onChange(t)}
        className={`h-10 rounded-lg text-sm font-black flex items-center justify-center gap-1.5 ${value === t ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
        <Icon className="h-4 w-4" /> {label}
      </button>
    ))}
  </div>
);

const CategoryPicker = ({ list, value, onChange }) => (
  <div>
    <label className="premium-label">Kategori</label>
    <div className="flex flex-wrap gap-1.5 mb-2">
      {list.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold ring-1 ${value === c ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-600 ring-gray-200 hover:ring-gray-300'}`}>{c}</button>
      ))}
    </div>
    <input required className="premium-input" placeholder="ya da kendiniz yazın" maxLength={60} value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

const AmountVat = ({ amount, vatRate, onAmount, onVat }) => {
  const vat = vatOf(parseAmount(amount), Number(vatRate));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
      <div>
        <label className="premium-label">Tutar (TL, KDV dahil)</label>
        <input autoFocus required inputMode="decimal" className="premium-input text-lg font-black" placeholder="0,00" value={amount} onChange={(e) => onAmount(e.target.value)} />
      </div>
      <div>
        <label className="premium-label">KDV</label>
        <select className="premium-input" value={vatRate} onChange={(e) => onVat(Number(e.target.value))}>
          {VAT_RATES.map((r) => <option key={r} value={r}>{r ? `%${r}` : 'Yok'}</option>)}
        </select>
      </div>
      {vat > 0 && <p className="col-span-2 -mt-1 text-[11px] font-semibold text-gray-500">İçindeki KDV {formatTRY(vat)} · KDV hariç {formatTRY(parseAmount(amount) - vat)}</p>}
    </div>
  );
};

// ─── Kayıt ekle / düzenle ────────────────────────────────────────────────────

export const EntryModal = ({ initial, suggestions, onClose, onSaved, showAlert }) => {
  const [form, setForm] = useState(initial);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const isIn = form.type === 'IN';

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = form.id ? await api.put(`/cash/${form.id}`, form) : await api.post('/cash', form);
      const id = form.id || res.data.entry.id;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        await api.post(`/cash/${id}/file`, fd).catch((err) => showAlert({ type: 'warning', title: 'Belge eklenemedi', message: errorMessage(err, 'Kayıt kaydedildi ama belge yüklenemedi.') }));
      }
      onSaved(res.data.message);
    } catch (err) {
      showAlert({ type: 'error', title: 'Kaydedilemedi', message: errorMessage(err, 'Kayıt yapılamadı.') });
    } finally {
      setSaving(false);
    }
  };

  const removeFile = async () => {
    try {
      await api.delete(`/cash/${form.id}/file`);
      set({ hasFile: false, fileName: null });
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Belge kaldırılamadı.') });
    }
  };

  return (
    <Modal as="form" onSubmit={submit} onClose={onClose} icon={isIn ? ArrowDownLeft : ArrowUpRight} title={form.id ? 'Kaydı düzenle' : isIn ? 'Gelir ekle' : 'Gider ekle'}
      footer={<>
        <button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button>
        <button disabled={saving} className="btn-gradient disabled:opacity-60">{saving ? 'Kaydediliyor...' : 'Kaydet'}</button>
      </>}>
      <TypeSwitch value={form.type} onChange={(type) => set({ type, category: '' })} />
      <AmountVat amount={form.amount} vatRate={form.vatRate} onAmount={(amount) => set({ amount })} onVat={(vatRate) => set({ vatRate })} />
      <CategoryPicker list={suggestions[form.type] || []} value={form.category} onChange={(category) => set({ category })} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="premium-label">Tarih</label>
          <input type="date" required className="premium-input" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div>
          <label className="premium-label">Nasıl ödendi?</label>
          <select className="premium-input" value={form.method || ''} onChange={(e) => set({ method: e.target.value || null })}>
            <option value="">—</option>
            {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="premium-label">Açıklama (isteğe bağlı)</label>
        <input className="premium-input" maxLength={500} placeholder={isIn ? 'Örn. eski raf satışı' : 'Örn. Kasım kirası'} value={form.description || ''} onChange={(e) => set({ description: e.target.value })} />
      </div>

      <div>
        <label className="premium-label">Fiş / fatura (isteğe bağlı)</label>
        {form.hasFile && !file ? (
          <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-sm">
            <Paperclip className="h-4 w-4 text-gray-400 shrink-0" />
            <button type="button" onClick={() => downloadFile(`/cash/${form.id}/file`, null, form.fileName)} className="font-semibold text-indigo-600 hover:underline truncate">{form.fileName || 'Belge'}</button>
            <label className="ml-auto text-xs font-bold text-gray-500 hover:text-gray-900 cursor-pointer shrink-0">Değiştir<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
            <button type="button" onClick={removeFile} className="p-1 text-gray-400 hover:text-red-600 shrink-0" aria-label="Belgeyi kaldır"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <label className="flex items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-3 py-3 text-sm text-gray-500 cursor-pointer hover:border-indigo-300 hover:text-indigo-600">
            <Paperclip className="h-4 w-4 shrink-0" />
            <span className="truncate">{file ? file.name : 'PDF ya da fotoğraf ekleyin (en fazla 10 MB)'}</span>
            {file && <button type="button" onClick={(e) => { e.preventDefault(); setFile(null); }} className="ml-auto p-1 text-gray-400 hover:text-red-600" aria-label="Seçimi kaldır"><X className="h-4 w-4" /></button>}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => setFile(e.target.files[0] || null)} />
          </label>
        )}
        {/* Telefonda fişi doğrudan kamerayla çek */}
        {!file && (
          <label className="sm:hidden mt-2 flex items-center justify-center gap-2 h-11 rounded-xl bg-gray-900 text-white text-sm font-black cursor-pointer">
            <Camera className="h-4 w-4" /> Fişin fotoğrafını çek
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files[0] || null)} />
          </label>
        )}
      </div>

      {!form.id && (
        <label className="flex items-start gap-3 rounded-xl bg-indigo-50/60 p-3 cursor-pointer">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600" checked={Boolean(form.repeat)} onChange={(e) => set({ repeat: e.target.checked })} />
          <span className="text-sm">
            <span className="font-black text-gray-900 flex items-center gap-1.5"><Repeat className="h-3.5 w-3.5" /> Her ay tekrarla</span>
            <span className="block text-xs text-gray-500 mt-0.5">Kira, maaş gibi sabit kalemler her ay aynı gün otomatik eklenir. Düzenli kayıtlardan durdurabilirsiniz.</span>
          </span>
        </label>
      )}
    </Modal>
  );
};

// ─── Düzenli gelir / gider ───────────────────────────────────────────────────

const EMPTY_RULE = { type: 'OUT', category: '', amount: '', vatRate: 0, dayOfMonth: 1, method: null, description: '' };

export const RecurringModal = ({ rules, suggestions, onClose, onChanged, showAlert, confirm }) => {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const run = async (fn) => {
    try {
      const res = await fn();
      showAlert({ type: 'success', title: 'Düzenli kayıtlar', message: res.data.message });
      onChanged();
      return true;
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'İşlem yapılamadı.') });
      return false;
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const ok = await run(() => (form.id ? api.put(`/cash/recurring/${form.id}`, form) : api.post('/cash/recurring', form)));
    setSaving(false);
    if (ok) setForm(null);
  };

  const remove = async (r) => {
    if (await confirm({ type: 'warning', title: 'Düzenli kayıt silinsin mi?', message: `${r.category} · ${formatTRY(r.amount)}. Daha önce oluşan kayıtlar silinmez.`, confirmText: 'Sil' })) run(() => api.delete(`/cash/recurring/${r.id}`));
  };

  if (form) {
    return (
      <Modal as="form" onSubmit={submit} onClose={() => setForm(null)} icon={Repeat} title={form.id ? 'Düzenli kaydı düzenle' : 'Düzenli kayıt ekle'}
        footer={<>
          <button type="button" onClick={() => setForm(null)} className="btn-secondary">Geri</button>
          <button disabled={saving} className="btn-gradient disabled:opacity-60">{saving ? 'Kaydediliyor...' : 'Kaydet'}</button>
        </>}>
        <TypeSwitch value={form.type} onChange={(type) => set({ type, category: '' })} />
        <AmountVat amount={form.amount} vatRate={form.vatRate} onAmount={(amount) => set({ amount })} onVat={(vatRate) => set({ vatRate })} />
        <CategoryPicker list={suggestions[form.type] || []} value={form.category} onChange={(category) => set({ category })} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="premium-label">Her ayın kaçı?</label>
            <select className="premium-input" value={form.dayOfMonth} onChange={(e) => set({ dayOfMonth: Number(e.target.value) })}>
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="premium-label">Nasıl ödeniyor?</label>
            <select className="premium-input" value={form.method || ''} onChange={(e) => set({ method: e.target.value || null })}>
              <option value="">—</option>
              {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="premium-label">Açıklama (isteğe bağlı)</label>
          <input className="premium-input" maxLength={500} value={form.description || ''} onChange={(e) => set({ description: e.target.value })} />
        </div>
        {!form.id && <p className="text-[11px] text-gray-500">Seçtiğiniz gün bu ay geçtiyse bu ayın kaydı da hemen eklenir.</p>}
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} icon={Repeat} title="Düzenli gelir ve giderler" size="max-w-2xl"
      footer={<button type="button" onClick={() => setForm({ ...EMPTY_RULE })} className="btn-gradient"><Plus className="h-4 w-4 mr-1.5" /> Düzenli kayıt ekle</button>}>
      <p className="text-sm text-gray-500">Kira, maaş, abonelik gibi her ay tekrar eden kalemler seçtiğiniz gün otomatik kaydedilir.</p>
      {rules.length === 0 ? (
        <div className="py-10 text-center">
          <Repeat className="h-10 w-10 mx-auto text-gray-200" />
          <p className="mt-2 text-sm font-bold text-gray-500">Henüz düzenli kayıt yok</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-2xl ring-1 ring-gray-100">
          {rules.map((r) => (
            <li key={r.id} className={`flex items-center gap-3 px-4 py-3 ${r.isActive ? '' : 'opacity-60'}`}>
              <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${r.type === 'IN' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                {r.type === 'IN' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{r.category}{r.description && <span className="font-normal text-gray-500"> · {r.description}</span>}</p>
                <p className="text-[11px] text-gray-500">Her ayın {r.dayOfMonth}. günü · {r.isActive ? `sıradaki ${formatDate(r.nextDate)}` : 'durduruldu'}</p>
              </div>
              <p className="text-sm font-black tabular-nums whitespace-nowrap">{formatTRY(r.amount)}</p>
              <div className="flex shrink-0">
                <button type="button" onClick={() => run(() => api.put(`/cash/recurring/${r.id}`, { isActive: !r.isActive }))} className="p-2 text-gray-400 hover:text-gray-900" title={r.isActive ? 'Durdur' : 'Devam ettir'} aria-label={r.isActive ? 'Durdur' : 'Devam ettir'}>
                  {r.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button type="button" onClick={() => setForm({ ...r, amount: String(r.amount).replace('.', ',') })} className="p-2 text-gray-400 hover:text-indigo-600" aria-label="Düzenle"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={() => remove(r)} className="p-2 text-gray-400 hover:text-red-600" aria-label="Sil"><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

// ─── Aylık bütçeler ──────────────────────────────────────────────────────────

export const BudgetModal = ({ budgets, categories, spent, onClose, onSaved, showAlert }) => {
  const names = [...new Set([...categories, ...Object.keys(budgets)])];
  const [draft, setDraft] = useState(() => Object.fromEntries(names.map((c) => [c, budgets[c] ? String(budgets[c]).replace('.', ',') : ''])));
  const [extra, setExtra] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put('/cash/budgets', { budgets: Object.fromEntries(Object.entries(draft).filter(([, v]) => parseAmount(v) > 0)) });
      onSaved(res.data.message);
    } catch (err) {
      showAlert({ type: 'error', title: 'Kaydedilemedi', message: errorMessage(err, 'Bütçe kaydedilemedi.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal as="form" onSubmit={submit} onClose={onClose} icon={Target} title="Aylık gider bütçeleri" size="max-w-xl"
      footer={<>
        <button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button>
        <button disabled={saving} className="btn-gradient disabled:opacity-60">{saving ? 'Kaydediliyor...' : 'Kaydet'}</button>
      </>}>
      <p className="text-sm text-gray-500">Her kategori için aylık üst sınır girin. Aşılınca sayfada uyarı görürsünüz; yıllık görünümde 12 ile çarpılır. Boş bırakılan kategoride bütçe yok.</p>
      <div className="divide-y divide-gray-50">
        {Object.keys(draft).map((c) => (
          <div key={c} className="flex items-center gap-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{c}</p>
              {spent[c] > 0 && <p className="text-[11px] text-gray-400">Bu dönem {formatTRY(spent[c])}</p>}
            </div>
            <input inputMode="decimal" className="premium-input !py-2 w-36 text-right" placeholder="—" value={draft[c]} onChange={(e) => setDraft({ ...draft, [c]: e.target.value })} aria-label={`${c} aylık bütçe`} />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="premium-input !py-2" placeholder="Başka kategori ekle" maxLength={60} value={extra} onChange={(e) => setExtra(e.target.value)} />
        <button type="button" disabled={!extra.trim() || extra.trim() in draft} onClick={() => { setDraft({ ...draft, [extra.trim()]: '' }); setExtra(''); }} className="px-4 rounded-xl bg-gray-900 text-white text-xs font-black disabled:opacity-40">Ekle</button>
      </div>
    </Modal>
  );
};
