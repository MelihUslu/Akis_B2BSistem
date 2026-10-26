import React, { useState } from 'react';
import { X, FileSignature, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { t } from '../../i18n';

/**
 * Teklif talebi. items: [{ productId, name, variantLabel, sku, quantity, unit }]
 */
const QuoteRequestModal = ({ items: initialItems, onClose, onDone }) => {
  const [items, setItems] = useState(initialItems);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await api.post('/quotes', { items: items.map(i => ({ productId: i.productId, quantity: i.quantity })), note });
      onDone(res.data.message);
    } catch (err) {
      setError(errorMessage(err, t('Teklif talebi gönderilemedi.')));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <form onSubmit={submit} className="modal-panel w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="modal-header items-center">
          <div>
            <h3 className="modal-title flex items-center"><FileSignature className="h-5 w-5 mr-2 text-indigo-600" /> {t('Teklif İste')}</h3>
            <p className="text-xs text-gray-400 font-semibold mt-1">{t('Firma yetkilisi fiyatlandırınca bildirim alırsınız; onaylarsanız sipariş oluşur.')}</p>
          </div>
          <button type="button" onClick={onClose} className="modal-close" aria-label={t('Kapat')}><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-3 overflow-y-auto">
          {items.map((item, i) => (
            <div key={`${item.productId}-${i}`} className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{item.name}</p>
                <p className="text-[11px] text-gray-500 font-semibold">{item.sku}{item.variantLabel && ` · ${item.variantLabel}`}</p>
              </div>
              <input type="number" min="1" className="premium-input !bg-white !py-2 w-24" value={item.quantity}
                onChange={(e) => setItems(items.map((x, idx) => (idx === i ? { ...x, quantity: Math.max(1, parseInt(e.target.value) || 1) } : x)))} />
              <span className="text-xs text-gray-400 font-bold w-10">{item.unit}</span>
              {items.length > 1 && (
                <button type="button" onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
          ))}
          <div>
            <label className="premium-label">{t('Not (isteğe bağlı)')}</label>
            <textarea className="premium-input h-24 resize-none" placeholder={t('Teslim tarihi, toplu alım planı vb.')} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        </div>
        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50">{t('Vazgeç')}</button>
          <button type="submit" disabled={sending} className="flex-1 btn-gradient disabled:opacity-60">{sending ? t('Gönderiliyor...') : t('Talebi Gönder')}</button>
        </div>
      </form>
    </div>
  );
};

export default QuoteRequestModal;
