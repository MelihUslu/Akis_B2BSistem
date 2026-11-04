import { useEffect, useState } from 'react';
import { BookOpen, Plus, Pencil, Trash2, Search, Eye, ThumbsUp, Type, Tags, Save } from 'lucide-react';
import { platformApi, errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { formatDate } from '../../utils/format';
import { TICKET_CATEGORIES } from '../../components/shared/supportMeta';
import { Field, IconInput, TextArea, Toggle } from '../../components/form/FormKit';
import ArticleBody from '../../components/support/ArticleBody';
import ModalHeader from '../../components/shared/ModalHeader';

const EMPTY = { title: '', summary: '', category: 'USAGE', keywords: '', body: '', isPublished: true, sortOrder: 0 };

// Yararlı oranı: oy azsa gösterilmez
const helpfulRate = (a) => {
  const total = a.helpfulYes + a.helpfulNo;
  return total ? Math.round((a.helpfulYes / total) * 100) : null;
};

// Firmaların destek sayfasında gördüğü yardım merkezi yazıları
const PlatformHelp = () => {
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(null); // { ...EMPTY, id? }
  const [preview, setPreview] = useState(false);
  const [tried, setTried] = useState(false);
  const [query, setQuery] = useState('');
  const { alertElement, showAlert, confirm } = useAlert();

  const load = () => platformApi.get('/help').then((r) => setItems(r.data)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const edit = (a) => { setForm(a ? { ...EMPTY, ...a } : EMPTY); setTried(false); setPreview(false); };

  const save = async (e) => {
    e.preventDefault();
    if (form.title.trim().length < 3 || form.body.trim().length < 10) { setTried(true); return; }
    try {
      const res = form.id ? await platformApi.put(`/help/${form.id}`, form) : await platformApi.post('/help', form);
      setForm(null);
      load();
      showAlert({ type: 'success', title: 'Kaydedildi', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Kaydedilemedi.') });
    }
  };

  const remove = async (a) => {
    if (!(await confirm({ type: 'warning', title: 'Yazı silinsin mi?', message: a.title, confirmText: 'Sil' }))) return;
    await platformApi.delete(`/help/${a.id}`);
    load();
  };

  const term = query.trim().toLocaleLowerCase('tr-TR');
  const visible = (items || []).filter((a) => !term || `${a.title} ${a.keywords}`.toLocaleLowerCase('tr-TR').includes(term));
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const err = (cond) => tried && cond;
  const totals = (items || []).reduce((s, a) => ({ views: s.views + a.views, yes: s.yes + a.helpfulYes, no: s.no + a.helpfulNo }), { views: 0, yes: 0, no: 0 });

  return (
    <div className="space-y-6 max-w-6xl">
      {alertElement}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="page-icon"><BookOpen className="h-6 w-6 text-brand-400" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Yardım Merkezi</h1>
            <p className="text-gray-500 text-sm mt-1">Firmalar destek sayfasında bu yazıları arar; talep yazarken uygun yazılar önerilir.</p>
          </div>
        </div>
        <button onClick={() => edit(null)} className="btn-gradient h-12 px-5 py-0"><Plus className="h-4 w-4 mr-1.5" /> Yeni yazı</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Yayındaki yazı', value: (items || []).filter((a) => a.isPublished).length, icon: BookOpen },
          { label: 'Toplam görüntülenme', value: totals.views, icon: Eye },
          { label: 'İşe yaradı oranı', value: totals.yes + totals.no ? `%${Math.round((totals.yes / (totals.yes + totals.no)) * 100)}` : '—', icon: ThumbsUp },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl p-4 ring-1 ring-gray-100 bg-white">
            <div className="flex items-center justify-between"><span className="text-[11px] font-bold text-gray-500">{c.label}</span><c.icon className="h-4 w-4 text-brand-500" /></div>
            <p className="text-2xl font-black text-gray-900 mt-1 tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="card-premium overflow-hidden">
        <div className="p-3 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Başlık veya anahtar kelime ara"
              className="w-full h-10 pl-10 pr-3 rounded-xl bg-gray-50 border border-transparent text-sm font-semibold outline-none focus:bg-white focus:border-brand-300 focus:ring-4 focus:ring-brand-100" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="list-head">
              <tr><th className="text-left px-4 py-3">Yazı</th><th className="text-left px-4 py-3">Konu</th><th className="text-right px-4 py-3">Görüntülenme</th><th className="text-right px-4 py-3">İşe yaradı</th><th className="text-left px-4 py-3">Güncellendi</th><th className="px-4 py-3" /></tr>
            </thead>
            <tbody>
              {!items ? <tr><td colSpan={6} className="py-12 text-center text-gray-400">Yükleniyor…</td></tr>
                : visible.length === 0 ? <tr><td colSpan={6} className="py-12 text-center text-gray-400">Yazı yok.</td></tr>
                  : visible.map((a, i) => {
                    const c = TICKET_CATEGORIES[a.category] || TICKET_CATEGORIES.USAGE;
                    const rate = helpfulRate(a);
                    return (
                      <tr key={a.id} className={`${i % 2 ? 'bg-slate-50/60' : 'bg-white'} hover:bg-brand-50/40`}>
                        <td className="px-4 py-3 max-w-[28rem]">
                          <button onClick={() => edit(a)} className="text-left block w-full min-w-0">
                            <span className="font-bold text-gray-900 hover:text-brand-700">{a.title}</span>
                            {!a.isPublished && <span className="ml-2 px-1.5 py-0.5 rounded-md bg-gray-200 text-gray-600 text-[11px] font-bold">Taslak</span>}
                            {a.summary && <span className="block text-xs text-gray-500 truncate pr-4">{a.summary}</span>}
                          </button>
                        </td>
                        <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${c.tile}`}><c.icon className="h-3 w-3" />{c.label}</span></td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">{a.views}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {rate === null ? <span className="text-gray-300">—</span> : <span className={rate >= 70 ? 'text-emerald-600 font-bold' : rate < 40 ? 'text-red-600 font-bold' : 'text-amber-600 font-bold'}>%{rate}</span>}
                          <span className="block text-[11px] text-gray-400">{a.helpfulYes} evet · {a.helpfulNo} hayır</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(a.updatedAt)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button onClick={() => edit(a)} className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50" title="Düzenle"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => remove(a)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Sil"><Trash2 className="h-4 w-4" /></button>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="modal-backdrop" onClick={() => setForm(null)} />
          <form onSubmit={save} className="modal-panel w-full max-w-3xl max-h-[92vh] flex flex-col">
            <ModalHeader icon={BookOpen} title={form.id ? 'Yazıyı Düzenle' : 'Yeni Yardım Yazısı'} subtitle='Adımları "1." ile, maddeleri "-" ile yazın; paragrafları boş satırla ayırın.' onClose={() => setForm(null)} />
            <div className="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              <Field label="Başlık" required error={err(form.title.trim().length < 3) && 'Başlık girin.'}>
                <IconInput icon={Type} invalid={err(form.title.trim().length < 3)} value={form.title} onChange={set('title')} maxLength={200} placeholder="Örn: Excel ile toplu ürün yükleme" />
              </Field>
              <Field label="Kısa özet" hint="Listede başlığın altında görünür.">
                <IconInput icon={BookOpen} value={form.summary} onChange={set('summary')} maxLength={300} />
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_8rem] gap-4">
                <Field label="Konu türü">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(TICKET_CATEGORIES).map(([id, c]) => (
                      <button key={id} type="button" onClick={() => setForm({ ...form, category: id })}
                        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold ring-1 ${form.category === id ? `ring-2 ${c.ring}` : 'ring-gray-100 text-gray-600 hover:bg-gray-50'}`}>
                        <c.icon className="h-3.5 w-3.5" /> {c.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Sıra"><IconInput type="number" value={form.sortOrder} onChange={set('sortOrder')} /></Field>
              </div>
              <Field label="Anahtar kelimeler" hint="Aramada eşleşmesi için eş anlamlılar, virgülle: fatura, e-arşiv, gib">
                <IconInput icon={Tags} value={form.keywords} onChange={set('keywords')} maxLength={500} />
              </Field>
              <Field label="İçerik" required error={err(form.body.trim().length < 10) && 'En az 10 karakter yazın.'}>
                <div className="flex gap-1 mb-2">
                  {[['Yaz', false], ['Önizleme', true]].map(([l, v]) => (
                    <button key={l} type="button" onClick={() => setPreview(v)} className={`h-8 px-3 rounded-lg text-xs font-bold ${preview === v ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>{l}</button>
                  ))}
                </div>
                {preview
                  ? <div className="rounded-xl ring-1 ring-gray-100 p-4 min-h-[16rem]"><ArticleBody text={form.body} /></div>
                  : <TextArea className="h-64 font-mono text-[13px]" invalid={err(form.body.trim().length < 10)} value={form.body} onChange={set('body')} maxLength={20000}
                    placeholder={'1. Ayarlar → ... sekmesine gidin.\n2. ...\n\nİpuçları\n- ...'} />}
              </Field>
              <label className="flex items-center gap-3 text-sm font-bold text-gray-700">
                <Toggle checked={form.isPublished} onChange={(v) => setForm({ ...form, isPublished: v })} /> Yayında (kapalıysa taslak olarak saklanır)
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setForm(null)} className="btn-secondary px-6">Vazgeç</button>
              <button className="btn-gradient h-12 py-0 px-8"><Save className="h-4 w-4 mr-2" /> Kaydet</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default PlatformHelp;
