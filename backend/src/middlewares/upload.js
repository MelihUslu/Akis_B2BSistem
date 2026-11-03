import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { PUBLIC_URL } from '../config.js';
import { currentTenantId } from '../utils/prisma.js';

fs.mkdirSync('uploads/images', { recursive: true });
fs.mkdirSync('uploads/support', { recursive: true });
// Cari belgeleri: /uploads/private altı herkese açık sunulmaz (app.js), yalnızca yetkiyle indirilir
export const PARTNER_DOC_DIR = 'uploads/private/partners';
fs.mkdirSync(PARTNER_DOC_DIR, { recursive: true });
// Gelir-gider fiş / faturaları: aynı şekilde yalnızca yetkiyle indirilir
export const CASH_DOC_DIR = 'uploads/private/cash';
fs.mkdirSync(CASH_DOC_DIR, { recursive: true });

// SVG kabul edilmez: içine script gömülebilir ve /uploads üzerinden açıldığında XSS'e yol açar
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/images/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Dosya adında kiracı numarası bulunur (yedekleme / temizlik için)
    cb(null, `t${currentTenantId() ?? 'p'}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});

export const imageUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMAGE_TYPES.includes(file.mimetype) && IMAGE_EXTS.includes(ext)) return cb(null, true);
    cb(Object.assign(new Error('Sadece görsel dosyaları (JPG, PNG, WEBP, GIF) yüklenebilir.'), { status: 400 }));
  }
});

export const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

export const publicFileUrl = (req, filename) => {
  const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  return `${base}/uploads/images/${filename}`;
};

export const uploadImage = (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Dosya yüklenmedi.' });
  res.json({ imageUrl: publicFileUrl(req, req.file.filename) });
};

// ─── Destek talebi ekleri ───────────────────────────────────────────────────
// Yalnızca güvenli türler (HTML/SVG/JS gibi tarayıcıda çalışabilecek dosyalar kabul edilmez).
// Dosya adı tahmin edilemez (16 bayt rastgele) çünkü /uploads herkese açık sunulur.
const SUPPORT_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xls': 'application/vnd.ms-excel',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};
export const SUPPORT_FILE_RE = /\/uploads\/support\/[a-z0-9-]+\.(jpg|jpeg|png|webp|gif|pdf|txt|csv|xlsx|xls|docx)$/i;

export const supportUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/support/'),
    filename: (req, file, cb) => cb(null, `t${currentTenantId() ?? 'p'}-${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (SUPPORT_TYPES[path.extname(file.originalname).toLowerCase()]) return cb(null, true);
    cb(Object.assign(new Error('Bu dosya türü eklenemez. Görsel, PDF, Excel, Word, CSV veya TXT yükleyin.'), { status: 400 }));
  }
});

export const uploadSupportFile = (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Dosya yüklenmedi.' });
  const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const ext = path.extname(req.file.filename).toLowerCase();
  res.json({
    url: `${base}/uploads/support/${req.file.filename}`,
    name: req.file.originalname.slice(0, 120),
    type: SUPPORT_TYPES[ext],
    size: req.file.size
  });
};

// ─── Cari belgeleri (vergi levhası, sözleşme…) ───────────────────────────────
export const PARTNER_DOC_TYPES = SUPPORT_TYPES;
export const partnerDocUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, `${PARTNER_DOC_DIR}/`),
    filename: (req, file, cb) => cb(null, `t${currentTenantId() ?? 'p'}-${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }, // 15 MB
  fileFilter: (req, file, cb) => {
    if (SUPPORT_TYPES[path.extname(file.originalname).toLowerCase()]) return cb(null, true);
    cb(Object.assign(new Error('Bu dosya türü eklenemez. PDF, görsel, Excel, Word, CSV veya TXT yükleyin.'), { status: 400 }));
  }
});

// ─── Gelir-gider fiş / faturası ──────────────────────────────────────────────
export const CASH_DOC_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };
export const cashDocUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, `${CASH_DOC_DIR}/`),
    filename: (req, file, cb) => cb(null, `t${currentTenantId() ?? 'p'}-${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (CASH_DOC_TYPES[path.extname(file.originalname).toLowerCase()]) return cb(null, true);
    cb(Object.assign(new Error('Fiş / fatura için PDF ya da görsel (JPG, PNG, WEBP) yükleyin.'), { status: 400 }));
  }
});
