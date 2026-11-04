import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Truck, RotateCcw, RotateCw, Package, Camera, X, Loader2, Printer, ExternalLink, MapPin, Store, Clock, Ban, MessageSquareText, UserCheck, FileText } from 'lucide-react';
import { trackingUrl, carrierName } from '../../utils/cargo';
import api, { errorMessage } from '../../services/api';
import OrderTimeline from '../../components/OrderTimeline';
import useReorder from '../../hooks/useReorder';
import useAlert from '../../hooks/useAlert';
import InvoicePanel from '../../components/shared/InvoicePanel';
import { formatAddress } from '../../utils/turkey';
import { formatTRY, formatDate, firstImage, ORDER_STATUS, RETURN_STATUS } from '../../utils/format';
import { t } from '../../i18n';
import usePortalSettings from '../../hooks/usePortalSettings';
import ModalHeader from '../../components/shared/ModalHeader';

// Gel-Al siparişi: planlanan teslim alma zamanı ve adresi
const PickupCard = ({ order }) => {
  const { pickup } = usePortalSettings();
  const ready = order.status === 'READY_FOR_PICKUP';
  return (
    <div className={`card-premium p-5 flex items-start gap-3 ${ready ? 'ring-2 ring-violet-200' : ''}`}>
      <Store className="h-5 w-5 text-violet-500 shrink-0 mt-0.5" />
      <div className="text-sm space-y-0.5">
        <p className="font-black text-gray-900">{t('Gel-Al')} {ready && <span className="ml-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[11px]">{t('Siparişiniz hazır, teslim alabilirsiniz')}</span>}</p>
        {order.pickupAt && <p className="text-gray-700 flex items-center"><Clock className="h-3.5 w-3.5 mr-1.5 text-gray-400" /> {t('Teslim alma:')} <b className="ml-1">{new Date(order.pickupAt).toLocaleString('tr-TR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}</b></p>}
        {pickup.address && <p className="text-gray-600 flex items-start"><MapPin className="h-3.5 w-3.5 mr-1.5 mt-0.5 text-gray-400 shrink-0" /> {pickup.address}</p>}
        {pickup.hours && <p className="text-xs text-gray-400">{pickup.hours}</p>}
      </div>
    </div>
  );
};

const RETURNABLE = ['SHIPPED', 'COMPLETED'];

const ReturnForm = ({ item, maxQty, onClose, onCreated }) => {
  const [form, setForm] = useState({ type: 'RETURN', quantity: 1, reason: '' });
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const upload = async (e) => {
    const files = [...e.target.files].slice(0, 6 - photos.length);
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const data = new FormData();
        data.append('file', file);
        const res = await api.post('/returns/upload-photo', data);
        setPhotos((prev) => [...prev, res.data.imageUrl]);
      }
    } catch (err) {
      setError(errorMessage(err, t('Fotoğraf yüklenemedi.')));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post('/returns', { orderItemId: item.id, ...form, photos });
      onCreated(res.data.message);
    } catch (err) {
      setError(errorMessage(err, t('Talep oluşturulamadı.')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <form onSubmit={submit} className="modal-panel w-full max-w-lg">
        <ModalHeader icon={RotateCcw} title={t('İade / Değişim Talebi')} subtitle={<>{item.product.parent?.name || item.product.name}{item.variantLabel && ` · ${item.variantLabel}`}</>} onClose={onClose} closeLabel={t('Kapat')} />

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="premium-label">{t('Talep Tipi')}</label>
              <div className="flex bg-gray-100 p-1 rounded-xl">
                {[['RETURN', t('İade')], ['EXCHANGE', t('Değişim')]].map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setForm({ ...form, type: value })}
                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${form.type === value ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-400'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="premium-label">{t('Miktar (en fazla {n})', { n: maxQty })}</label>
              <input type="number" min={1} max={maxQty} required className="premium-input" value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)) })} />
            </div>
          </div>

          <div>
            <label className="premium-label">{t('Neden')}</label>
            <textarea required minLength={10} className="premium-input h-28 resize-none" placeholder={t('Ürünle ilgili sorunu kısaca açıklayın (en az 10 karakter)')}
              value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>

          <div>
            <label className="premium-label">{t('Fotoğraflar ({n}/6)', { n: photos.length })}</label>
            <div className="flex flex-wrap gap-3">
              {photos.map((url) => (
                <div key={url} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-100">
                  <img src={url} className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setPhotos(photos.filter((p) => p !== url))} className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 text-red-500"><X className="h-3 w-3" /></button>
                </div>
              ))}
              {photos.length < 6 && (
                <label className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-brand-300 hover:text-brand-500 cursor-pointer transition-colors">
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={upload} disabled={uploading} />
                </label>
              )}
            </div>
          </div>

          {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        </div>

        <div className="p-6 pt-0 flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">{t('Vazgeç')}</button>
          <button type="submit" disabled={submitting || uploading} className="flex-1 btn-gradient disabled:opacity-60">{t('Talebi Gönder')}</button>
        </div>
      </form>
    </div>
  );
};

const BayiOrderDetail = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [returnItem, setReturnItem] = useState(null);
  const reorder = useReorder();
  const { alertElement, showAlert, confirm } = useAlert();

  const load = () =>
    api.get(`/orders/${id}`)
      .then((res) => setOrder(res.data))
      .catch((err) => setError(errorMessage(err, t('Sipariş bulunamadı.'))));

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="p-8 text-center text-gray-400 font-bold">{error}</div>;
  if (!order) return <div className="p-8 text-center text-gray-400">{t('Yükleniyor...')}</div>;

  const status = ORDER_STATUS[order.status] || ORDER_STATUS.PENDING;
  const requestedQty = (itemId) =>
    order.returnRequests.filter((r) => r.orderItemId === itemId && r.status !== 'REJECTED').reduce((s, r) => s + r.quantity, 0);

  // Onay bekleyen sipariş bayi tarafından iptal edilebilir (stok ve cari henüz işlenmedi)
  const handleCancel = async () => {
    if (!(await confirm({ title: t('Sipariş iptal edilsin mi?'), message: t('#AK-{id} numaralı sipariş iptal edilecek. Bu işlem geri alınamaz; gerekirse yeniden sipariş verebilirsiniz.', { id: order.id }), confirmText: t('Siparişi iptal et'), cancelText: t('Vazgeç') }))) return;
    try {
      const res = await api.patch(`/orders/${order.id}/cancel`);
      showAlert({ type: 'success', title: t('Sipariş iptal edildi'), message: res.data.message });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: t('İptal edilemedi'), message: errorMessage(err, t('Sipariş iptal edilemedi.')) });
    }
  };

  // Kısmi sevkiyat: kalem bazında kaç adet gönderildi
  const shippedOf = (itemId) => (order.shipments || []).reduce((sum, sh) => sum + ((sh.items || []).find((x) => x.orderItemId === itemId)?.quantity || 0), 0);

  const handleReorder = async () => {
    try {
      const { added, skipped } = await reorder(order);
      if (skipped.length > 0) {
        showAlert({ type: added > 0 ? 'warning' : 'error', title: t('Bazı ürünler eklenemedi'), message: t('Şu an sipariş edilemeyenler: {list}', { list: skipped.join(', ') }) });
      }
    } catch (err) {
      showAlert({ type: 'error', title: t('Hata'), message: err.message });
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto">
      {alertElement}
      {returnItem && (
        <ReturnForm
          item={returnItem}
          maxQty={returnItem.quantity - requestedQty(returnItem.id)}
          onClose={() => setReturnItem(null)}
          onCreated={(message) => {
            setReturnItem(null);
            load();
            showAlert({ type: 'success', title: t('Talebiniz Alındı'), message });
          }}
        />
      )}

      <Link to="/bayi/orders" className="inline-flex items-center text-xs font-black text-gray-400 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4 mr-2" /> {t('Siparişlerim')}
      </Link>

      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">{t('Sipariş')} #AK-{order.id}</h1>
          <p className="text-sm text-gray-400 font-medium mt-1">{formatDate(order.createdAt, true)} · {order.paymentMethod === 'WIRE_TRANSFER' ? t('Havale / EFT') : t('Cari Hesap')}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase ${status.className}`}>{t(status.label)}</span>
          <Link to={`/print/order/${order.id}`} className="flex items-center px-4 py-2 rounded-xl text-xs font-black text-gray-600 bg-gray-100 hover:bg-gray-200"><Printer className="h-3.5 w-3.5 mr-1.5" /> {t('Yazdır / PDF')}</Link>
          {order.status !== 'CANCELLED' && (
            <button onClick={handleReorder} className="flex items-center px-4 py-2 rounded-xl text-xs font-black text-brand-600 bg-brand-50 hover:bg-brand-100">
              <RotateCw className="h-3.5 w-3.5 mr-1.5" /> {t('Yeniden Sipariş Ver')}
            </button>
          )}
          {order.status === 'PENDING' && (
            <button onClick={handleCancel} className="flex items-center px-4 py-2 rounded-xl text-xs font-black text-red-600 bg-red-50 hover:bg-red-100">
              <Ban className="h-3.5 w-3.5 mr-1.5" /> {t('Siparişi iptal et')}
            </button>
          )}
        </div>
      </div>

      {order.status === 'CANCELLED' && order.cancelledBy === 'DEALER' && (
        <p className="text-sm font-bold text-red-600 bg-red-50 rounded-2xl px-5 py-3">{t('Bu siparişi siz iptal ettiniz')}{order.cancelledAt ? ` · ${formatDate(order.cancelledAt, true)}` : ''}.</p>
      )}

      {(order.note || order.customerRef || (order.channel && order.channel !== 'PORTAL')) && (
        <div className="card-premium p-5 grid gap-3 sm:grid-cols-2 text-sm">
          {order.customerRef && <p className="flex items-start gap-2"><FileText className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" /><span><span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('Referans numaranız')}</span><b className="font-mono">{order.customerRef}</b></span></p>}
          {order.note && <p className="flex items-start gap-2"><MessageSquareText className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" /><span><span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('Sipariş notu')}</span>{order.note}</span></p>}
          {order.channel && order.channel !== 'PORTAL' && order.channel !== 'QUOTE' && (
            <p className="flex items-start gap-2"><UserCheck className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" /><span><span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('Siparişi giren')}</span>{order.user?.name} ({order.channel === 'PLASIYER' ? t('plasiyer') : t('firma yetkilisi')}, {t('sizin adınıza')})</span></p>
          )}
        </div>
      )}

      {order.deliveryMethod === 'PICKUP' && <PickupCard order={order} />}

      {order.shippingAddress && (
        <div className="card-premium p-5 flex items-start gap-3">
          <MapPin className="h-5 w-5 text-brand-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-black text-gray-900">{t('Teslimat:')} {order.shippingAddress.title}</p>
            <p className="text-gray-600 mt-0.5">{formatAddress(order.shippingAddress)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{order.shippingAddress.contactName} · {order.shippingAddress.phone}</p>
          </div>
        </div>
      )}

      {order.invoice?.status === 'ISSUED' && (
        <InvoicePanel orderId={order.id} orderStatus={order.status} onError={(message) => showAlert({ type: 'error', title: t('Fatura'), message })} />
      )}

      <div className="card-premium p-5 md:p-8 overflow-x-auto">
        <OrderTimeline order={order} />
        {/* Birden fazla gönderi (kısmi sevkiyat): her birinin takip numarası */}
        {(order.shipments?.length > 1 || (order.shipments?.length === 1 && order.status !== 'SHIPPED' && order.status !== 'COMPLETED')) ? (
          <div className="mt-8 space-y-2">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{t('Gönderiler')}</p>
            {order.shipments.map((sh, i) => (
              <div key={sh.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-brand-50 px-5 py-3 rounded-2xl border border-brand-100 text-sm">
                <Truck className="h-4 w-4 text-brand-600" />
                <b>{t('{n}. gönderi', { n: i + 1 })}</b>
                <span className="text-gray-600">{carrierName(sh.cargoCompany) || t('Kargo')} · <span className="font-mono font-bold text-brand-700">{sh.trackingNumber}</span></span>
                <span className="text-xs text-gray-500">{formatDate(sh.createdAt, true)} · {t('{n} kalem', { n: (sh.items || []).length })}</span>
                {trackingUrl(sh.cargoCompany, sh.trackingNumber) && <a href={trackingUrl(sh.cargoCompany, sh.trackingNumber)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center text-xs font-black text-brand-600 hover:underline">{t('Kargom nerede?')} <ExternalLink className="h-3 w-3 ml-1" /></a>}
              </div>
            ))}
          </div>
        ) : order.trackingNumber && (
          <div className="mt-8 flex items-center bg-brand-50 px-5 py-4 rounded-2xl border border-brand-100">
            <Truck className="h-5 w-5 text-brand-600 mr-3" />
            <div>
              <p className="text-[11px] font-black text-brand-400 uppercase tracking-widest">{carrierName(order.cargoCompany) || t('Kargo')} · Takip No</p>
              <p className="text-sm font-black text-brand-700">{order.trackingNumber}</p>
              {trackingUrl(order.cargoCompany, order.trackingNumber) && (
                <a href={trackingUrl(order.cargoCompany, order.trackingNumber)} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs font-black text-brand-600 mt-1 hover:underline">{t('Kargom nerede?')} <ExternalLink className="h-3 w-3 ml-1" /></a>
              )}
            </div>
          </div>
        )}
        {order.dueDate && (
          <p className="mt-4 text-xs font-bold text-gray-500">{t('Ödeme vadesi:')} <span className="text-gray-900">{formatDate(order.dueDate)}</span></p>
        )}
        {order.despatchNumber && (
          <p className="mt-2 text-xs font-bold text-gray-500">{t('İrsaliye No:')} <span className="text-gray-900 font-mono">{order.despatchNumber}</span>{order.despatchDate && ` · ${formatDate(order.despatchDate)}`}</p>
        )}
      </div>

      <div className="card-premium">
        <div className="p-6 border-b border-gray-50">
          <h3 className="font-black text-gray-900">{t('Sipariş Kalemleri')}</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {order.items.map((item) => {
            const img = firstImage(item.product.images) || firstImage(item.product.parent?.images);
            const remaining = item.quantity - requestedQty(item.id);
            const returns = order.returnRequests.filter((r) => r.orderItemId === item.id);
            return (
              <div key={item.id} className={`p-6 flex flex-col md:flex-row md:items-center gap-4 ${item.status === 'CANCELLED' ? 'opacity-50' : ''}`}>
                <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {img ? <img src={img} className="w-full h-full object-cover" /> : <Package className="h-6 w-6 text-gray-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900">{item.product.parent?.name || item.product.name}</p>
                  {item.variantLabel && <p className="text-xs font-black text-brand-600 mt-0.5">{item.variantLabel}</p>}
                  <p className="text-xs text-gray-400 font-semibold mt-1">{t('SKU:')} {item.product.sku} · {item.quantity} {item.product.unit} × {formatTRY(item.price)} + KDV %{item.vatRate}</p>
                  {item.status === 'CANCELLED' && <p className="text-xs font-black text-red-500 mt-1">{t('Bu kalem stok yetersizliği nedeniyle iptal edildi.')}</p>}
                  {item.status === 'APPROVED' && shippedOf(item.id) > 0 && shippedOf(item.id) < item.quantity && (
                    <p className="text-xs font-black text-brand-600 mt-1">{t('{sent} / {total} {unit} kargoya verildi; kalanı ayrıca gönderilecek.', { sent: shippedOf(item.id), total: item.quantity, unit: item.product.unit })}</p>
                  )}
                  {returns.map((r) => (
                    <p key={r.id} className="text-[11px] font-bold mt-1">
                      <span className={`px-2 py-0.5 rounded-full ${RETURN_STATUS[r.status].className}`}>#RMA-{r.id} · {r.quantity} adet · {t(RETURN_STATUS[r.status].label)}</span>
                    </p>
                  ))}
                </div>
                <div className="flex items-center gap-4">
                  <p className="font-black text-gray-900">{formatTRY(item.price * item.quantity)}</p>
                  {item.status === 'APPROVED' && RETURNABLE.includes(order.status) && remaining > 0 && (
                    <button onClick={() => setReturnItem(item)} className="flex items-center px-3 py-2 rounded-xl text-[11px] font-black text-orange-600 bg-orange-50 hover:bg-orange-100">
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> {t('İade / Değişim')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-6 bg-gray-50/60 space-y-2 text-sm">
          <div className="flex justify-between font-bold text-gray-500"><span>{t('Ara Toplam (KDV hariç)')}</span><span className="text-gray-900">{formatTRY(order.subtotal || order.totalAmount / 1.2)}</span></div>
          {order.discountAmount > 0 && <div className="flex justify-between font-bold text-pink-600"><span>{t('Kupon')} {order.couponCode}</span><span>−{formatTRY(order.discountAmount)}</span></div>}
          {order.shippingFee > 0 && <div className="flex justify-between font-bold text-gray-500"><span>{t('Kargo (KDV hariç)')}</span><span className="text-gray-900">{formatTRY(order.shippingFee)}</span></div>}
          <div className="flex justify-between font-bold text-gray-500"><span>{t('KDV')}</span><span className="text-gray-900">{formatTRY(order.vatAmount || order.totalAmount - order.totalAmount / 1.2)}</span></div>
          <div className="flex justify-between font-black text-gray-900 text-lg pt-2"><span>{t('Genel Toplam')}</span><span>{formatTRY(order.totalAmount)}</span></div>
        </div>
      </div>
    </div>
  );
};

export default BayiOrderDetail;
