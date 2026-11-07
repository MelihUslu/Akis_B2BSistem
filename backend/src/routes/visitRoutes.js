import express from 'express';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';
import { visitReport, VisitError } from '../services/visitService.js';

// Yönetim → Saha Ziyaretleri (Bayiler yetkisi): plasiyerlerin ziyaretleri ve ziyaret edilmeyen bayiler
const router = express.Router();
router.use(verifyToken, checkRole(['ADMIN']), requirePermission('DEALERS'));
router.get('/', async (req, res) => {
  try {
    res.json(await visitReport(req.query));
  } catch (error) {
    if (error instanceof VisitError) return res.status(error.status).json({ message: error.message });
    console.error('visitReport error:', error);
    res.status(500).json({ message: 'Ziyaret raporu hazırlanamadı.' });
  }
});

export default router;
