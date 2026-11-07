import { listCheques, changeChequeStatus } from '../services/chequeService.js';
import { LedgerError } from '../services/partnerLedgerService.js';

// Çek / senet portföyü (Finans yetkisi)
export const getCheques = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80) || null;
    const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
    res.json(await listCheques({ status: req.query.status, kind: req.query.kind, from: date(req.query.from), to: date(req.query.to), q }));
  } catch (error) {
    console.error('getCheques error:', error);
    res.status(500).json({ message: 'Çek / senet listesi alınamadı.' });
  }
};

export const updateCheque = async (req, res) => {
  try {
    const cheque = await changeChequeStatus(parseInt(req.params.id) || 0, req.params.action, req.body || {}, req.user);
    res.locals.auditEntityId = cheque.id;
    res.json({ message: `${cheque.kindLabel} durumu: ${cheque.statusLabel}.`, cheque });
  } catch (error) {
    if (error instanceof LedgerError) return res.status(error.status).json({ message: error.message });
    console.error('updateCheque error:', error);
    res.status(500).json({ message: 'Çek / senet güncellenemedi.' });
  }
};
