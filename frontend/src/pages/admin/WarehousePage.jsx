import { useEffect, useState, useCallback } from 'react';
import {
  Warehouse, Plus, Pencil, Trash2, Star, ArrowRightLeft, PackagePlus, PackageMinus, ClipboardCheck,
  Search, Barcode, Boxes, ListChecks, History, AlertTriangle, MapPin, X, Save, Camera
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import BarcodeScanner from '../../components/bayi/BarcodeScanner';
import useAlert from '../../hooks/useAlert';
import PageHeader from '../../components/shared/PageHeader';
import EmptyState from '../../components/shared/EmptyState';
import Modal from '../../components/shared/Modal';
import { formatDate } from '../../utils/format';

const TABS = [
  ['stock', 'Stok & Hareketler', History],
  ['warehouses', 'Depolar', Warehouse],
  ['bins', 'Raflar', Boxes],
  ['pick', 'Toplama', ListChecks],
  ['lookup', 'Ara / Barkod', Barcode],
];

const TYPE_LABEL = {
  IN: 'Giriş', OUT: 'Çıkış', ADJUST: 'Düzeltme', COUNT: 'Sayım', TRANSFER_IN: 'Transfer (gelen)', TRANSFER_OUT: 'Transfer (giden)',
  ORDER_OUT: 'Sipariş çıkışı', ORDER_CANCEL_IN: 'Sipariş iptali', RETURN_IN: 'İade (geri)', ERP_SET: 'ERP senkron', INITIAL: 'Açılış',
};
const typeTone = (t) => (t.endsWith('_OUT') || t === 'OUT' ? 'text-red-600' : 'text-emerald-600');

const btn = 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition';
const btnPrimary = `${btn} bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50`;
const btnGhost = `${btn} bg-white border border-gray-200 text-gray-700 hover:bg-gray-50`;

// ─── Ürün seçici (arama + seçim) ────────────────────────────────────────────
const ProductPicker = ({ value, onChange, placeholder = 'Ürün adı, stok kodu ya da barkod…' }) => {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [scan, setScan] = useState(false);
  // Kamerayla okunan kodu ürüne çevir: barkod/stok kodu tam eşleşen varsa onu, yoksa ilk sonucu seç
  const onScan = async (code) => {
    setScan(false);
    try {
      const r = await api.get('/products', { params: { search: code, isAdmin: true, limit: 5 } });
      const items = r.data.data || [];
      const hit = items.find((p) => p.barcode === code || p.sku === code) || items[0];
      if (hit) onChange(hit); else setQ(code);
    } catch { setQ(code); }
  };
  useEffect(() => {
    if (!q.trim()) { setList([]); return; }
    const id = setTimeout(() => {
      api.get('/products', { params: { search: q.trim(), isAdmin: true, limit: 20 } })
        .then((r) => { setList(r.data.data || []); setOpen(true); }).catch(() => setList([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);
  if (value) return (
    <div className="flex items-center justify-between gap-2 premium-input !py-2.5">
      <span className="truncate"><b>{value.name}</b> <span className="text-gray-400">· {value.sku}</span></span>
      <button type="button" onClick={() => onChange(null)} className="text-gray-400 hover:text-red-500 shrink-0"><X className="h-4 w-4" /></button>
    </div>
  );
  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input className="premium-input !pl-9" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => list.length && setOpen(true)} placeholder={placeholder} />
        </div>
        <button type="button" onClick={() => setScan(true)} title="Kamerayla barkod okut" className="shrink-0 px-3 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-brand-600 transition-colors"><Camera className="h-4 w-4" /></button>
      </div>
      {open && list.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {list.map((p) => (
            <button type="button" key={p.id} onClick={() => { onChange(p); setOpen(false); setQ(''); }}
              className="w-full text-left px-3 py-2 hover:bg-brand-50 text-sm border-b border-gray-50 last:border-0">
              <b>{p.name}</b> <span className="text-gray-400">· {p.sku}{p.barcode ? ` · ${p.barcode}` : ''} · stok {p.stock}</span>
            </button>
          ))}
        </div>
      )}
      {scan && <BarcodeScanner onCode={onScan} onClose={() => setScan(false)} />}
    </div>
  );
};

const Field = ({ label, children, hint }) => (
  <label className="block">
    <span className="block text-sm font-semibold text-gray-700 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-xs text-gray-400 mt-1">{hint}</span>}
  </label>
);

const WarehouseSelect = ({ warehouses, value, onChange, allowEmpty, emptyLabel = 'Varsayılan depo' }) => (
  <select className="premium-input" value={value || ''} onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)}>
    {allowEmpty && <option value="">{emptyLabel}</option>}
    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
  </select>
);

// ─── Stok giriş / çıkış ─────────────────────────────────────────────────────
const AdjustModal = ({ warehouses, direction, onClose, onDone, showAlert }) => {
  const [product, setProduct] = useState(null);
  const [warehouseId, setWarehouseId] = useState(warehouses.find((w) => w.isDefault)?.id || warehouses[0]?.id || null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const isOut = direction === 'OUT';
  const submit = async (e) => {
    e.preventDefault();
    if (!product || !(parseInt(quantity) > 0)) return;
    setBusy(true);
    try {
      const r = await api.post('/warehouses/adjust', { productId: product.id, warehouseId, quantity: parseInt(quantity), direction, reason });
      showAlert({ type: 'success', title: 'Tamam', message: r.data.message });
      onDone();
    } catch (err) {
      showAlert({ type: 'error', title: 'Yapılamadı', message: errorMessage(err, 'Stok işlenemedi.') });
    } finally { setBusy(false); }
  };
  return (
    <Modal as="form" onSubmit={submit} icon={isOut ? PackageMinus : PackagePlus} title={isOut ? 'Stok çıkışı' : 'Stok girişi'}
      subtitle={isOut ? 'Fire, numune, el ile çıkış' : 'Mal kabul, el ile giriş'} onClose={onClose}
      footer={<><button type="button" onClick={onClose} className={btnGhost}>Vazgeç</button><button disabled={busy || !product} className={btnPrimary}><Save className="h-4 w-4" />{isOut ? 'Çıkış yap' : 'Giriş yap'}</button></>}>
      <Field label="Ürün"><ProductPicker value={product} onChange={setProduct} /></Field>
      {warehouses.length > 0 && <Field label="Depo"><WarehouseSelect warehouses={warehouses} value={warehouseId} onChange={setWarehouseId} /></Field>}
      <Field label="Miktar"><input type="number" min="1" className="premium-input" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
      <Field label="Sebep (isteğe bağlı)"><input className="premium-input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isOut ? 'Örn. kırık/fire' : 'Örn. tedarikçi sevkiyatı'} /></Field>
    </Modal>
  );
};

// ─── Sayım ──────────────────────────────────────────────────────────────────
const CountModal = ({ warehouses, onClose, onDone, showAlert }) => {
  const [product, setProduct] = useState(null);
  const [warehouseId, setWarehouseId] = useState(warehouses.find((w) => w.isDefault)?.id || warehouses[0]?.id || null);
  const [counted, setCounted] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!product || counted === '' || parseInt(counted) < 0) return;
    setBusy(true);
    try {
      const r = await api.post('/warehouses/count', { productId: product.id, warehouseId, counted: parseInt(counted) });
      showAlert({ type: 'success', title: 'Sayım', message: r.data.message });
      onDone();
    } catch (err) {
      showAlert({ type: 'error', title: 'Yapılamadı', message: errorMessage(err, 'Sayım işlenemedi.') });
    } finally { setBusy(false); }
  };
  return (
    <Modal as="form" onSubmit={submit} icon={ClipboardCheck} title="Sayım" subtitle="Fiili miktarı gir; fark düzeltme olarak işlenir" onClose={onClose}
      footer={<><button type="button" onClick={onClose} className={btnGhost}>Vazgeç</button><button disabled={busy || !product} className={btnPrimary}><Save className="h-4 w-4" />Sayımı işle</button></>}>
      <Field label="Ürün"><ProductPicker value={product} onChange={setProduct} /></Field>
      {warehouses.length > 0 && <Field label="Depo"><WarehouseSelect warehouses={warehouses} value={warehouseId} onChange={setWarehouseId} /></Field>}
      <Field label="Sayılan (fiili) miktar"><input type="number" min="0" className="premium-input" value={counted} onChange={(e) => setCounted(e.target.value)} /></Field>
    </Modal>
  );
};

// ─── Transfer ─────────────────────────────────────────────────────────────────
const TransferModal = ({ warehouses, onClose, onDone, showAlert }) => {
  const [product, setProduct] = useState(null);
  const [fromWarehouseId, setFrom] = useState(warehouses[0]?.id || null);
  const [toWarehouseId, setTo] = useState(warehouses[1]?.id || null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!product || !(parseInt(quantity) > 0) || fromWarehouseId === toWarehouseId) return;
    setBusy(true);
    try {
      const r = await api.post('/warehouses/transfer', { productId: product.id, fromWarehouseId, toWarehouseId, quantity: parseInt(quantity), reason });
      showAlert({ type: 'success', title: 'Transfer', message: r.data.message });
      onDone();
    } catch (err) {
      showAlert({ type: 'error', title: 'Yapılamadı', message: errorMessage(err, 'Transfer edilemedi.') });
    } finally { setBusy(false); }
  };
  return (
    <Modal as="form" onSubmit={submit} icon={ArrowRightLeft} title="Depolar arası transfer" subtitle="Toplam stok değişmez" onClose={onClose}
      footer={<><button type="button" onClick={onClose} className={btnGhost}>Vazgeç</button><button disabled={busy || !product || fromWarehouseId === toWarehouseId} className={btnPrimary}><ArrowRightLeft className="h-4 w-4" />Transfer et</button></>}>
      <Field label="Ürün"><ProductPicker value={product} onChange={setProduct} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Çıkış deposu"><WarehouseSelect warehouses={warehouses} value={fromWarehouseId} onChange={setFrom} /></Field>
        <Field label="Varış deposu"><WarehouseSelect warehouses={warehouses} value={toWarehouseId} onChange={setTo} /></Field>
      </div>
      <Field label="Miktar"><input type="number" min="1" className="premium-input" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
      <Field label="Not (isteğe bağlı)"><input className="premium-input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
};

// ─── Stok & Hareketler sekmesi ────────────────────────────────────────────────
const StockTab = ({ warehouses, showAlert }) => {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState({ warehouseId: null, type: '', q: '' });
  const [modal, setModal] = useState(null);
  const load = useCallback(() => {
    const params = {};
    if (filter.warehouseId) params.warehouseId = filter.warehouseId;
    if (filter.type) params.type = filter.type;
    if (filter.q.trim()) params.q = filter.q.trim();
    api.get('/warehouses/movements', { params }).then((r) => setRows(r.data)).catch(() => setRows([]));
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  const done = () => { setModal(null); load(); };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setModal('in')} className={btnPrimary}><PackagePlus className="h-4 w-4" />Stok girişi</button>
        <button onClick={() => setModal('out')} className={btnGhost}><PackageMinus className="h-4 w-4" />Stok çıkışı</button>
        <button onClick={() => setModal('count')} className={btnGhost}><ClipboardCheck className="h-4 w-4" />Sayım</button>
        {warehouses.length > 1 && <button onClick={() => setModal('transfer')} className={btnGhost}><ArrowRightLeft className="h-4 w-4" />Transfer</button>}
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input className="premium-input !pl-9" placeholder="Ürün / stok kodu / barkod" value={filter.q} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} />
        </div>
        {warehouses.length > 0 && <select className="premium-input w-auto" value={filter.warehouseId || ''} onChange={(e) => setFilter((f) => ({ ...f, warehouseId: e.target.value ? parseInt(e.target.value) : null }))}>
          <option value="">Tüm depolar</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>}
        <select className="premium-input w-auto" value={filter.type} onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value }))}>
          <option value="">Tüm hareketler</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {!rows ? <div className="text-gray-400 text-sm py-8 text-center">Yükleniyor…</div>
        : rows.length === 0 ? <EmptyState icon={History}>Hareket yok. Stok girişi / çıkışı yaptıkça burada listelenir.</EmptyState>
        : (
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase"><tr>
                <th className="text-left p-3">Tarih</th><th className="text-left p-3">Ürün</th><th className="text-left p-3">Hareket</th>
                <th className="text-right p-3">Miktar</th><th className="text-right p-3">Kalan</th><th className="text-left p-3">Depo</th><th className="text-left p-3">Açıklama</th>
              </tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-t border-gray-50">
                    <td className="p-3 whitespace-nowrap text-gray-500">{formatDate(m.createdAt)}</td>
                    <td className="p-3"><b>{m.product?.name}</b><span className="text-gray-400"> · {m.product?.sku}</span></td>
                    <td className={`p-3 font-semibold ${typeTone(m.type)}`}>{m.typeLabel}</td>
                    <td className={`p-3 text-right font-bold ${typeTone(m.type)}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                    <td className="p-3 text-right text-gray-500">{m.balanceAfter ?? '—'}</td>
                    <td className="p-3 text-gray-500">{m.warehouse?.name || '—'}{m.bin ? ` · ${m.bin.code}` : ''}</td>
                    <td className="p-3 text-gray-500">{m.reason || (m.refType === 'ORDER' ? `Sipariş #AK-${m.refId}` : m.refType === 'RETURN' ? `İade #RMA-${m.refId}` : '—')}{m.by ? ` · ${m.by}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {modal === 'in' && <AdjustModal warehouses={warehouses} direction="IN" onClose={() => setModal(null)} onDone={done} showAlert={showAlert} />}
      {modal === 'out' && <AdjustModal warehouses={warehouses} direction="OUT" onClose={() => setModal(null)} onDone={done} showAlert={showAlert} />}
      {modal === 'count' && <CountModal warehouses={warehouses} onClose={() => setModal(null)} onDone={done} showAlert={showAlert} />}
      {modal === 'transfer' && <TransferModal warehouses={warehouses} onClose={() => setModal(null)} onDone={done} showAlert={showAlert} />}
    </div>
  );
};

// ─── Depolar sekmesi ────────────────────────────────────────────────────────
const WarehouseModal = ({ existing, onClose, onDone, showAlert }) => {
  const [form, setForm] = useState({ name: existing?.name || '', code: existing?.code || '', city: existing?.city || '', isDefault: existing?.isDefault || false });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = existing ? await api.patch(`/warehouses/${existing.id}`, form) : await api.post('/warehouses', form);
      showAlert({ type: 'success', title: 'Tamam', message: r.data.message });
      onDone();
    } catch (err) {
      showAlert({ type: 'error', title: 'Yapılamadı', message: errorMessage(err, 'Depo kaydedilemedi.') });
    } finally { setBusy(false); }
  };
  return (
    <Modal as="form" onSubmit={submit} icon={Warehouse} title={existing ? 'Depo düzenle' : 'Depo ekle'} onClose={onClose}
      footer={<><button type="button" onClick={onClose} className={btnGhost}>Vazgeç</button><button disabled={busy} className={btnPrimary}><Save className="h-4 w-4" />Kaydet</button></>}>
      <Field label="Depo adı"><input className="premium-input" maxLength={60} autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Merkez depo" /></Field>
      <Field label="Kod" hint="ERP eşleştirmesi için kısa kod (ör. IST, ANK)"><input className="premium-input" maxLength={12} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="IST" /></Field>
      <Field label="Şehir (isteğe bağlı)"><input className="premium-input" maxLength={40} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Varsayılan depo (yeni giriş buraya)</label>
    </Modal>
  );
};

const WarehousesTab = ({ warehouses, reload, showAlert, confirm }) => {
  const [modal, setModal] = useState(null);
  const del = async (w) => {
    if (!(await confirm({ title: 'Depo silinsin mi?', message: `${w.name}: stoğu diğer depoya taşınır.`, confirmText: 'Sil', danger: true }))) return;
    try { const r = await api.delete(`/warehouses/${w.id}`); showAlert({ type: 'success', title: 'Silindi', message: r.data.message }); reload(); }
    catch (err) { showAlert({ type: 'error', title: 'Yapılamadı', message: errorMessage(err, 'Silinemedi.') }); }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={() => setModal({})} className={btnPrimary}><Plus className="h-4 w-4" />Depo ekle</button></div>
      {warehouses.length === 0
        ? <EmptyState icon={Warehouse} action={<button onClick={() => setModal({})} className={btnPrimary}><Plus className="h-4 w-4" />İlk depoyu ekle</button>}>Henüz depo yok; stok tek toplam olarak tutuluyor. İlk depoyu eklediğinizde mevcut stoklar bu depoya aktarılır.</EmptyState>
        : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {warehouses.map((w) => (
              <div key={w.id} className="card-premium p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-gray-900">{w.name}{w.isDefault && <Star className="h-4 w-4 text-amber-500 fill-amber-400" />}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{w.code}{w.city ? ` · ${w.city}` : ''}</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setModal(w)} className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => del(w)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-4 flex gap-6 text-sm">
                  <div><div className="text-2xl font-black text-gray-900">{w.totalQuantity.toLocaleString('tr-TR')}</div><div className="text-xs text-gray-400">toplam adet</div></div>
                  <div><div className="text-2xl font-black text-gray-900">{w.productCount.toLocaleString('tr-TR')}</div><div className="text-xs text-gray-400">ürün çeşidi</div></div>
                </div>
              </div>
            ))}
          </div>
        )}
      {modal && <WarehouseModal existing={modal.id ? modal : null} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} showAlert={showAlert} />}
    </div>
  );
};

// ─── Raflar sekmesi ───────────────────────────────────────────────────────────
const BinModal = ({ warehouseId, onClose, onDone, showAlert }) => {
  const [form, setForm] = useState({ code: '', name: '', isDefault: false });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await api.post('/warehouses/bins', { warehouseId, ...form }); showAlert({ type: 'success', title: 'Tamam', message: r.data.message }); onDone(); }
    catch (err) { showAlert({ type: 'error', title: 'Yapılamadı', message: errorMessage(err, 'Raf eklenemedi.') }); }
    finally { setBusy(false); }
  };
  return (
    <Modal as="form" onSubmit={submit} icon={Boxes} title="Raf / göz ekle" onClose={onClose}
      footer={<><button type="button" onClick={onClose} className={btnGhost}>Vazgeç</button><button disabled={busy} className={btnPrimary}><Save className="h-4 w-4" />Kaydet</button></>}>
      <Field label="Raf kodu" hint="Barkodla okunur, ör. A-01-03"><input className="premium-input" maxLength={24} autoFocus value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="A-01" /></Field>
      <Field label="Açıklama (isteğe bağlı)"><input className="premium-input" maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Giriş kat, A koridoru" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Varsayılan yerleştirme rafı</label>
    </Modal>
  );
};

const PutawayModal = ({ bins, onClose, onDone, showAlert }) => {
  const [mode, setMode] = useState('put'); // put | move
  const [product, setProduct] = useState(null);
  const [binId, setBinId] = useState(bins[0]?.id || null);
  const [toBinId, setToBinId] = useState(bins[1]?.id || null);
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!product || !(parseInt(quantity) > 0)) return;
    setBusy(true);
    try {
      const r = mode === 'put'
        ? await api.post('/warehouses/bins/putaway', { binId, productId: product.id, quantity: parseInt(quantity) })
        : await api.post('/warehouses/bins/relocate', { fromBinId: binId, toBinId, productId: product.id, quantity: parseInt(quantity) });
      showAlert({ type: 'success', title: 'Tamam', message: r.data.message }); onDone();
    } catch (err) { showAlert({ type: 'error', title: 'Yapılamadı', message: errorMessage(err, 'İşlenemedi.') }); }
    finally { setBusy(false); }
  };
  return (
    <Modal as="form" onSubmit={submit} icon={MapPin} title="Rafa yerleştir / taşı" onClose={onClose}
      footer={<><button type="button" onClick={onClose} className={btnGhost}>Vazgeç</button><button disabled={busy || !product} className={btnPrimary}><Save className="h-4 w-4" />Uygula</button></>}>
      <div className="flex gap-2">
        <button type="button" onClick={() => setMode('put')} className={mode === 'put' ? btnPrimary : btnGhost}>Yerleştir</button>
        <button type="button" onClick={() => setMode('move')} className={mode === 'move' ? btnPrimary : btnGhost}>Raftan rafa taşı</button>
      </div>
      <Field label="Ürün"><ProductPicker value={product} onChange={setProduct} /></Field>
      <Field label={mode === 'put' ? 'Raf' : 'Kaynak raf'}>
        <select className="premium-input" value={binId || ''} onChange={(e) => setBinId(parseInt(e.target.value))}>{bins.map((b) => <option key={b.id} value={b.id}>{b.code}{b.name ? ` · ${b.name}` : ''}</option>)}</select>
      </Field>
      {mode === 'move' && <Field label="Hedef raf">
        <select className="premium-input" value={toBinId || ''} onChange={(e) => setToBinId(parseInt(e.target.value))}>{bins.map((b) => <option key={b.id} value={b.id}>{b.code}{b.name ? ` · ${b.name}` : ''}</option>)}</select>
      </Field>}
      <Field label="Miktar"><input type="number" min="1" className="premium-input" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
    </Modal>
  );
};

const BinsTab = ({ warehouses, showAlert, confirm }) => {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || null);
  const [bins, setBins] = useState(null);
  const [contents, setContents] = useState({ id: null, rows: null });
  const [modal, setModal] = useState(null);
  const load = useCallback(() => {
    if (!warehouseId) { setBins([]); return; }
    api.get('/warehouses/bins', { params: { warehouseId } }).then((r) => setBins(r.data)).catch(() => setBins([]));
  }, [warehouseId]);
  useEffect(() => { load(); }, [load]);
  const openContents = (b) => {
    if (contents.id === b.id) return setContents({ id: null, rows: null });
    setContents({ id: b.id, rows: null });
    api.get(`/warehouses/bins/${b.id}/contents`).then((r) => setContents({ id: b.id, rows: r.data })).catch(() => setContents({ id: b.id, rows: [] }));
  };
  const del = async (b) => {
    if (!(await confirm({ title: 'Raf silinsin mi?', message: `${b.code} rafı silinecek.`, confirmText: 'Sil', danger: true }))) return;
    try { const r = await api.delete(`/warehouses/bins/${b.id}`); showAlert({ type: 'success', title: 'Silindi', message: r.data.message }); load(); }
    catch (err) { showAlert({ type: 'error', title: 'Yapılamadı', message: errorMessage(err, 'Silinemedi.') }); }
  };
  if (warehouses.length === 0) return <EmptyState icon={Boxes}>Önce bir depo ekleyin; raflar depoya bağlıdır.</EmptyState>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <select className="premium-input w-auto" value={warehouseId || ''} onChange={(e) => setWarehouseId(parseInt(e.target.value))}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        <div className="flex gap-2">
          <button onClick={() => setModal('put')} className={btnGhost} disabled={!(bins && bins.length)}><MapPin className="h-4 w-4" />Yerleştir / taşı</button>
          <button onClick={() => setModal('bin')} className={btnPrimary}><Plus className="h-4 w-4" />Raf ekle</button>
        </div>
      </div>
      {!bins ? <div className="text-gray-400 text-sm py-8 text-center">Yükleniyor…</div>
        : bins.length === 0 ? <EmptyState icon={Boxes}>Bu depoda raf yok. Raf ekleyip ürünleri yerleştirin; böylece hangi ürün nerede bulunur.</EmptyState>
        : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bins.map((b) => (
              <div key={b.id} className="card-premium p-4">
                <div className="flex items-start justify-between">
                  <div><div className="flex items-center gap-2 font-bold text-gray-900">{b.code}{b.isDefault && <Star className="h-4 w-4 text-amber-500 fill-amber-400" />}</div>{b.name && <div className="text-xs text-gray-400">{b.name}</div>}</div>
                  <button onClick={() => del(b)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="mt-3 text-sm text-gray-500">{b.totalQuantity.toLocaleString('tr-TR')} adet · {b.productCount} çeşit</div>
                <button onClick={() => openContents(b)} className="mt-2 text-xs font-semibold text-brand-600 hover:underline">{contents.id === b.id ? 'Gizle' : 'İçeriği gör'}</button>
                {contents.id === b.id && (
                  <div className="mt-2 border-t border-gray-100 pt-2 text-sm">
                    {!contents.rows ? <span className="text-gray-400 text-xs">Yükleniyor…</span>
                      : contents.rows.length === 0 ? <span className="text-gray-400 text-xs">Raf boş.</span>
                      : contents.rows.map((c) => <div key={c.productId} className="flex justify-between py-0.5"><span className="truncate">{c.product?.name}</span><b className="shrink-0 ml-2">{c.quantity}</b></div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      {modal === 'bin' && <BinModal warehouseId={warehouseId} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} showAlert={showAlert} />}
      {modal === 'put' && <PutawayModal bins={bins || []} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); if (contents.id) setContents({ id: null, rows: null }); }} showAlert={showAlert} />}
    </div>
  );
};

// ─── Toplama sekmesi ──────────────────────────────────────────────────────────
const PickTab = ({ warehouses }) => {
  const [warehouseId, setWarehouseId] = useState(null);
  const [data, setData] = useState(null);
  useEffect(() => {
    const params = warehouseId ? { warehouseId } : {};
    api.get('/warehouses/picklist', { params }).then((r) => setData(r.data.orders)).catch(() => setData([]));
  }, [warehouseId]);
  return (
    <div className="space-y-4">
      {warehouses.length > 1 && (
        <select className="premium-input w-auto" value={warehouseId || ''} onChange={(e) => setWarehouseId(e.target.value ? parseInt(e.target.value) : null)}>
          <option value="">Tüm depolar</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      )}
      {!data ? <div className="text-gray-400 text-sm py-8 text-center">Yükleniyor…</div>
        : data.length === 0 ? <EmptyState icon={ListChecks}>Hazırlanacak sipariş yok. Onaylanan siparişler burada toplama listesi olarak görünür.</EmptyState>
        : data.map((o) => (
          <div key={o.id} className="card-premium p-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="font-bold text-gray-900">#AK-{o.id} · {o.company?.name}</div>
              <div className="text-xs text-gray-400">{o.warehouse?.name || 'Depo seçilmedi'} · {formatDate(o.createdAt)}{o.deliveryMethod === 'PICKUP' ? ' · Gel-Al' : ''}</div>
            </div>
            <table className="w-full text-sm mt-3">
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.id} className="border-t border-gray-50">
                    <td className="py-2"><b>{i.product?.name}</b><span className="text-gray-400"> · {i.product?.sku}{i.product?.barcode ? ` · ${i.product.barcode}` : ''}</span>{i.variantLabel && <div className="text-xs text-gray-400">{i.variantLabel}</div>}</td>
                    <td className="py-2 text-right whitespace-nowrap"><b>{i.remaining}</b> adet</td>
                    <td className="py-2 pl-3 text-xs text-gray-500">{i.bins.length ? i.bins.map((b) => `${b.code} (${b.quantity})`).join(', ') : 'raf atanmamış'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
};

// ─── Ara / Barkod sekmesi ───────────────────────────────────────────────────
const LookupTab = ({ showAlert }) => {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [low, setLow] = useState(null);
  const [scan, setScan] = useState(false);
  const lookup = async (e, scanned) => {
    e?.preventDefault();
    const c = (scanned ?? code).trim();
    if (!c) return;
    try { const r = await api.get(`/warehouses/barcode/${encodeURIComponent(c)}`); setResult(r.data); }
    catch (err) { setResult(null); showAlert({ type: 'error', title: 'Bulunamadı', message: errorMessage(err, 'Koda ait ürün ya da raf yok.') }); }
  };
  const onScan = (c) => { setScan(false); setCode(c); lookup(null, c); };
  const loadLow = () => api.get('/warehouses/low-stock', { params: { below: 5 } }).then((r) => setLow(r.data.products)).catch(() => setLow([]));
  useEffect(() => { loadLow(); }, []);
  return (
    <div className="space-y-6">
      <form onSubmit={lookup} className="flex gap-2">
        <div className="relative flex-1">
          <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input className="premium-input !pl-9" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Barkod, stok kodu ya da raf kodu okutun / yazın" autoFocus />
        </div>
        <button type="button" onClick={() => setScan(true)} title="Kamerayla barkod okut" className={btnGhost}><Camera className="h-4 w-4" />Tara</button>
        <button className={btnPrimary}><Search className="h-4 w-4" />Ara</button>
      </form>
      {scan && <BarcodeScanner onCode={onScan} onClose={() => setScan(false)} />}
      {result?.kind === 'PRODUCT' && (
        <div className="card-premium p-5">
          <div className="font-bold text-gray-900">{result.product.name} <span className="text-gray-400 font-normal">· {result.product.sku}</span></div>
          <div className="text-sm text-gray-500 mt-1">Toplam stok: <b>{result.product.stock}</b> {result.product.unit || 'adet'}</div>
          {result.stocks?.length > 0 && <div className="mt-3 text-sm"><div className="text-xs text-gray-400 uppercase mb-1">Depolar</div>{result.stocks.map((s, idx) => <div key={idx} className="flex justify-between py-0.5"><span>{s.warehouse?.name}</span><b>{s.quantity}</b></div>)}</div>}
          {result.bins?.length > 0 && <div className="mt-3 text-sm"><div className="text-xs text-gray-400 uppercase mb-1">Raflar</div>{result.bins.map((b, idx) => <div key={idx} className="flex justify-between py-0.5"><span>{b.code}{b.name ? ` · ${b.name}` : ''}</span><b>{b.quantity}</b></div>)}</div>}
        </div>
      )}
      {result?.kind === 'BIN' && (
        <div className="card-premium p-5">
          <div className="font-bold text-gray-900">Raf {result.bin.code} <span className="text-gray-400 font-normal">· {result.bin.warehouse?.name}</span></div>
          {result.contents.length === 0 ? <div className="text-sm text-gray-400 mt-2">Raf boş.</div>
            : <div className="mt-3 text-sm">{result.contents.map((c, idx) => <div key={idx} className="flex justify-between py-0.5"><span>{c.product?.name} <span className="text-gray-400">· {c.product?.sku}</span></span><b>{c.quantity}</b></div>)}</div>}
        </div>
      )}
      <div>
        <div className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Düşük stok (≤ 5)</div>
        {!low ? <div className="text-gray-400 text-sm">Yükleniyor…</div>
          : low.length === 0 ? <div className="text-gray-400 text-sm">Düşük stoklu ürün yok.</div>
          : <div className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-50">
              {low.map((p) => <div key={p.id} className="flex justify-between px-4 py-2 text-sm"><span>{p.name} <span className="text-gray-400">· {p.sku}</span></span><b className={p.stock <= 0 ? 'text-red-600' : 'text-amber-600'}>{p.stock} {p.unit || ''}</b></div>)}
            </div>}
      </div>
    </div>
  );
};

// ─── Sayfa ────────────────────────────────────────────────────────────────────
const WarehousePage = () => {
  const { alertElement, showAlert, confirm } = useAlert();
  const [tab, setTab] = useState('stock');
  const [warehouses, setWarehouses] = useState([]);
  const reload = useCallback(() => api.get('/warehouses').then((r) => setWarehouses(r.data)).catch(() => setWarehouses([])), []);
  useEffect(() => { reload(); }, [reload]);
  return (
    <div className="space-y-6">
      {alertElement}
      <PageHeader icon={Warehouse} title="Depo" subtitle="Stok giriş/çıkış, sayım, raf yönetimi, depolar arası transfer ve sipariş toplama" />
      <div className="flex gap-1 overflow-x-auto border-b border-gray-100">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 -mb-px transition ${tab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>
      {tab === 'stock' && <StockTab warehouses={warehouses} showAlert={showAlert} />}
      {tab === 'warehouses' && <WarehousesTab warehouses={warehouses} reload={reload} showAlert={showAlert} confirm={confirm} />}
      {tab === 'bins' && <BinsTab warehouses={warehouses} showAlert={showAlert} confirm={confirm} />}
      {tab === 'pick' && <PickTab warehouses={warehouses} />}
      {tab === 'lookup' && <LookupTab showAlert={showAlert} />}
    </div>
  );
};

export default WarehousePage;
