import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import prisma from '../utils/prisma.js';
import { tenantPortalUrl } from '../config.js';
import { sendStatementMail } from '../services/mailService.js';
import { notifyAdmins, safeNotify } from '../services/notificationService.js';
import { audit, clientIp } from '../services/auditService.js';
import { listTransactions } from '../services/partnerLedgerService.js';
import { formatMoney } from '../services/money.js';
import { PARTNER_DOC_DIR, PARTNER_DOC_TYPES } from '../middlewares/upload.js';
import { fail, loadPartner, PartnerError } from './partnerController.js';

const str = (v, max) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

// ─── Görüşme notları ve hatırlatmalar ───────────────────────────────────────

export const addNote = async (req, res) => {
  try {
    const company = await loadPartner(req.params.id);
    const body = str(req.body.body, 2000);
    if (!body) throw new PartnerError('Not yazın.');
    const remindAt = req.body.remindAt ? new Date(req.body.remindAt) : null;
    if (remindAt && Number.isNaN(remindAt.getTime())) throw new PartnerError('Hatırlatma tarihi geçersiz.');
    const note = await prisma.partnerNote.create({ data: { companyId: company.id, userId: req.user.id, body, remindAt }, include: { user: { select: { id: true, name: true } } } });
    res.locals.auditEntityId = company.id;
    res.status(201).json(note);
  } catch (error) {
    fail(res, error, 'Not kaydedilemedi.');
  }
};

// Tamamlandı işaretleme / geri alma; yalnızca not sahibi veya firma sahibi siler
export const updateNote = async (req, res) => {
  const note = await prisma.partnerNote.findFirst({ where: { id: parseInt(req.params.noteId) || 0, companyId: parseInt(req.params.id) || 0 } });
  if (!note) return res.status(404).json({ message: 'Not bulunamadı.' });
  await prisma.partnerNote.update({ where: { id: note.id }, data: { doneAt: req.body.done ? new Date() : null } });
  res.json({ message: req.body.done ? 'Tamamlandı olarak işaretlendi.' : 'Yeniden açıldı.' });
};

export const deleteNote = async (req, res) => {
  const note = await prisma.partnerNote.findFirst({ where: { id: parseInt(req.params.noteId) || 0, companyId: parseInt(req.params.id) || 0 } });
  if (!note) return res.status(404).json({ message: 'Not bulunamadı.' });
  if (note.userId !== req.user.id && !req.user.isOwner) return res.status(403).json({ message: 'Yalnızca notu yazan kişi silebilir.' });
  await prisma.partnerNote.delete({ where: { id: note.id } });
  res.json({ message: 'Not silindi.' });
};

// ─── Belgeler ───────────────────────────────────────────────────────────────

export const uploadDocument = async (req, res) => {
  try {
    if (!req.file) throw new PartnerError('Dosya seçin.');
    const company = await loadPartner(req.params.id).catch(async (e) => { await fs.unlink(req.file.path).catch(() => {}); throw e; });
    const doc = await prisma.partnerDocument.create({
      data: {
        companyId: company.id,
        name: str(req.body.name, 120) || req.file.originalname.slice(0, 120),
        storedName: req.file.filename,
        mimeType: PARTNER_DOC_TYPES[path.extname(req.file.filename).toLowerCase()],
        size: req.file.size,
        uploadedBy: req.user.name
      }
    });
    res.locals.auditEntityId = company.id;
    res.status(201).json(doc);
  } catch (error) {
    fail(res, error, 'Belge yüklenemedi.');
  }
};

const findDocument = (req) => prisma.partnerDocument.findFirst({ where: { id: parseInt(req.params.docId) || 0, companyId: parseInt(req.params.id) || 0 } });

export const downloadDocument = async (req, res) => {
  const doc = await findDocument(req);
  if (!doc) return res.status(404).json({ message: 'Belge bulunamadı.' });
  const file = path.resolve(PARTNER_DOC_DIR, doc.storedName);
  if (!file.startsWith(path.resolve(PARTNER_DOC_DIR))) return res.status(404).end();
  res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(file, doc.name.includes('.') ? doc.name : `${doc.name}${path.extname(doc.storedName)}`, (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'Dosya bulunamadı.' });
  });
};

export const deleteDocument = async (req, res) => {
  const doc = await findDocument(req);
  if (!doc) return res.status(404).json({ message: 'Belge bulunamadı.' });
  await prisma.partnerDocument.delete({ where: { id: doc.id } });
  await fs.unlink(path.join(PARTNER_DOC_DIR, doc.storedName)).catch(() => {});
  res.json({ message: 'Belge silindi.' });
};

// ─── Ekstre bağlantısı ve mutabakat ─────────────────────────────────────────

const tokenHash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Cariye ekstre bağlantısı (30 gün geçerli). Bağlantıdaki anahtar tahmin edilemez ve yalnızca özeti saklanır.
 * E-posta istenirse cari e-postası / birincil yetkiliye gönderilir; gerçekten gittiyse "gönderildi" işaretlenir.
 */
export const createStatementLink = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: parseInt(req.params.id) || 0 }, include: { contacts: { orderBy: { isPrimary: 'desc' } } } });
    if (!company) throw new PartnerError('Cari bulunamadı.', 404);
    const typed = String(req.body.to || '').split(/[,;\s]+/).filter(Boolean);
    if (typed.some((e) => !EMAIL.test(e))) throw new PartnerError('Geçersiz e-posta adresi.');
    const recipients = req.body.send
      ? (typed.length ? typed : [company.email, ...company.contacts.map((c) => c.email)].filter(Boolean)).slice(0, 5)
      : [];
    if (req.body.send && !recipients.length) throw new PartnerError('Carinin kayıtlı e-postası yok; alıcı adresini yazın.');

    const token = crypto.randomBytes(24).toString('base64url');
    const link = await prisma.statementRequest.create({
      data: { companyId: company.id, tokenHash: tokenHash(token), balance: company.currentBalance, periodEnd: new Date(), sentTo: recipients.join(', ') || null, createdByName: req.user.name, expiresAt: new Date(Date.now() + 30 * 86400000) }
    });
    const url = `${tenantPortalUrl(req.tenant)}/ekstre/${token}`;
    let delivered = 0;
    for (const to of recipients) {
      const money = formatMoney(Math.abs(company.currentBalance), company.currency);
      const r = await sendStatementMail({ to, tenant: req.tenant, companyName: company.name, balanceText: company.currentBalance < 0 ? `${money} (borç)` : company.currentBalance > 0 ? `${money} (alacak)` : money, url, message: str(req.body.message, 1000) })
        .catch(() => ({ delivered: false }));
      if (r.delivered) delivered++;
    }
    if (delivered) await prisma.statementRequest.update({ where: { id: link.id }, data: { emailed: true } });
    res.locals.auditEntityId = company.id;
    res.status(201).json({
      url, delivered, total: recipients.length,
      message: !recipients.length ? 'Ekstre bağlantısı oluşturuldu (30 gün geçerli).'
        : delivered === recipients.length ? `Ekstre ${delivered} alıcıya e-postayla gönderildi.`
          : delivered ? `${recipients.length} alıcıdan ${delivered} tanesine gönderildi.` : 'E-posta gönderilemedi (sunucuda e-posta ayarı yok veya hata oluştu). Bağlantıyı kopyalayıp iletebilirsiniz.'
    });
  } catch (error) {
    fail(res, error, 'Ekstre bağlantısı oluşturulamadı.');
  }
};

const findLink = async (token) => {
  if (!token || String(token).length < 20 || String(token).length > 100) return null;
  return prisma.statementRequest.findUnique({ where: { tokenHash: tokenHash(token) }, include: { company: true } });
};

// Herkese açık (bağlantıyla): carinin ekstresi, bağlantının oluşturulduğu ana kadar
export const viewStatementLink = async (req, res) => {
  const link = await findLink(req.params.token);
  if (!link) return res.status(404).json({ message: 'Ekstre bulunamadı veya bağlantı geçersiz.' });
  if (link.expiresAt < new Date()) return res.status(410).json({ message: 'Bu ekstre bağlantısının süresi doldu. Güncel ekstre için firmayla iletişime geçin.' });
  const { rows, openingBalance } = await listTransactions(link.company, { to: link.periodEnd.toISOString().slice(0, 10) });
  const t = req.tenant;
  res.json({
    seller: { name: t.name, address: t.address, taxOffice: t.taxOffice, taxNumber: t.taxNumber, phone: t.phone, email: t.contactEmail, logoUrl: t.logoUrl },
    company: { name: link.company.name, taxOffice: link.company.taxOffice, taxNumber: link.company.taxNumber, address: link.company.address, externalCode: link.company.externalCode, currency: link.company.currency },
    periodEnd: link.periodEnd,
    balance: link.balance,
    openingBalance,
    transactions: rows.filter((r) => r.date <= link.periodEnd).map((r) => ({ id: r.id, date: r.date, description: r.description, type: r.type, amount: r.amount, balanceAfter: r.balanceAfter })),
    response: link.response ? { type: link.response, note: link.responseNote, by: link.responderName, at: link.respondedAt } : null
  });
};

// Mutabakat yanıtı (bir kez): "Mutabıkız" mutabakat kaydı oluşturur, "İtirazımız var" ekibe bildirilir
export const respondStatementLink = async (req, res) => {
  try {
    const response = ['AGREED', 'DISPUTED'].includes(req.body.response) ? req.body.response : null;
    if (!response) throw new PartnerError('Geçersiz yanıt.');
    const name = str(req.body.name, 120);
    const note = str(req.body.note, 1000);
    if (!name || name.length < 2) throw new PartnerError('Adınızı ve soyadınızı yazın.');
    if (response === 'DISPUTED' && !note) throw new PartnerError('İtirazınızın nedenini yazın.');
    const link = await findLink(req.params.token);
    if (!link) throw new PartnerError('Ekstre bulunamadı veya bağlantı geçersiz.', 404);
    if (link.expiresAt < new Date()) throw new PartnerError('Bu ekstre bağlantısının süresi doldu.', 410);
    const claimed = await prisma.statementRequest.updateMany({ where: { id: link.id, response: null }, data: { response, responseNote: note, responderName: name, respondedAt: new Date() } });
    if (!claimed.count) throw new PartnerError('Bu ekstre için yanıt zaten verilmiş.', 409);
    if (response === 'AGREED') {
      await prisma.reconciliation.create({ data: { companyId: link.companyId, responderName: name, balance: link.balance, periodEnd: link.periodEnd } });
    }
    audit({ tenantId: req.tenant.id, actorType: 'CUSTOMER', actorName: name, action: response === 'AGREED' ? 'Cari ekstre bağlantıdan onaylandı (mutabık)' : 'Cari ekstreye bağlantıdan itiraz edildi', method: 'POST', path: '/api/statement-links/:token/respond', entity: 'partners', entityId: link.companyId, details: { note: note || undefined }, ip: clientIp(req) });
    safeNotify(notifyAdmins({
      type: 'PAYMENT',
      title: response === 'AGREED' ? 'Cari mutabakat onaylandı' : 'Cari ekstreye itiraz',
      message: `${link.company.name} (${name})${note ? `: ${note}` : ''}`,
      link: `/admin/partners?id=${link.companyId}`
    }));
    res.json({ message: response === 'AGREED' ? 'Mutabakatınız kaydedildi. Teşekkür ederiz.' : 'İtirazınız iletildi; firma sizinle iletişime geçecek.' });
  } catch (error) {
    fail(res, error, 'Yanıt iletilemedi.');
  }
};
