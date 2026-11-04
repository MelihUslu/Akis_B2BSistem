import { useEffect, useState } from 'react';
import { ShoppingCart, Search, Store, ChevronRight } from 'lucide-react';
import api from '../../services/api';
import Modal from '../shared/Modal';
import useActAsDealer from '../../hooks/useActAsDealer';
import { formatMoney } from '../../utils/format';

/**
 * Yönetici bayi adına sipariş verir (telefonla / WhatsApp'tan gelen sipariş): bayi seçilir, bayinin portalı o bayinin
 * fiyat, limit ve adresleriyle açılır. Sipariş yöneticinin adıyla kaydedilir ve bayiye bildirim gider.
 */
const ActAsDealer = ({ className = '' }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const act = useActAsDealer();

  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => {
      api.get('/companies', { params: { search: q || undefined, status: 'ACTIVE', limit: 20, page: 1 } })
        .then((r) => setRows(r.data.data || []))
        .catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [open, q]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`btn-gradient h-11 py-0 ${className}`}>
        <ShoppingCart className="h-4 w-4 mr-1.5" /> Bayi adına sipariş
      </button>
      {open && (
        <Modal icon={Store} title="Bayi adına sipariş" subtitle="Bayiyi seçin; portalı o bayinin fiyatları ve limitiyle açılır." onClose={() => setOpen(false)}>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Unvan veya vergi no ara" className="premium-input !pl-11" aria-label="Bayi ara" />
          </div>
          <ul className="divide-y divide-gray-100 rounded-2xl ring-1 ring-gray-100 overflow-hidden">
            {rows.length === 0 && <li className="p-6 text-center text-sm text-gray-400">Aktif bayi bulunamadı.</li>}
            {rows.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => act(c)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-50/50">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-gray-900 truncate">{c.name}</span>
                    <span className="block text-xs text-gray-500">{c.dealerGroup} · bakiye {formatMoney(c.currentBalance || 0, c.currency)}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
};

export default ActAsDealer;
