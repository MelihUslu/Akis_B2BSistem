import { basePrisma as db } from '../utils/prisma.js';
import { publicSiteSettings, getSiteSettings, saveSiteSettings } from '../services/siteSettings.js';
import { createSession, visitorMessage, submitContact, agentMessage, createFormLead, MAX_USER_MESSAGES } from '../services/chatbot.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanUtm = (u) => (u && typeof u === 'object'
  ? Object.fromEntries(Object.entries(u).filter(([k]) => /^(utm_\w+|gclid|fbclid|ref)$/.test(k)).map(([k, v]) => [k, String(v).slice(0, 200)]))
  : undefined);

// ─── Herkese açık (tanıtım sitesi) ───────────────────────────────────────────
export const getPublicSite = async (req, res) => res.json(await publicSiteSettings());

const loadSession = async (req, res) => {
  const session = await db.chatSession.findUnique({ where: { id: String(req.params.id || '') } });
  if (!session) { res.status(404).json({ message: 'Sohbet bulunamadı.' }); return null; }
  return session;
};
const view = (m) => ({ id: m.id, role: m.role, text: m.text, createdAt: m.createdAt });

export const startChat = async (req, res) => {
  const settings = await getSiteSettings();
  if (!settings.chatbot.enabled) return res.status(503).json({ message: 'Canlı sohbet şu an kapalı.' });
  const { session, messages } = await createSession({ pageUrl: req.body?.pageUrl, utm: cleanUtm(req.body?.utm), ip: req.ip });
  res.status(201).json({ id: session.id, status: session.status, messages: messages.map(view) });
};

export const getChat = async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return;
  const after = parseInt(req.query.after) || 0;
  const [messages, lead] = await Promise.all([
    db.chatMessage.findMany({ where: { sessionId: session.id, id: { gt: after } }, orderBy: { id: 'asc' }, take: 200 }),
    db.lead.findUnique({ where: { chatSessionId: session.id }, select: { id: true } })
  ]);
  res.json({ status: session.status, hasLead: Boolean(lead), messages: messages.map(view) });
};

export const postChat = async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return;
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ message: 'Mesaj boş olamaz.' });
  if (session.status === 'CLOSED') return res.status(409).json({ message: 'Bu sohbet kapatıldı. Yeni bir sohbet başlatabilirsiniz.' });
  if (session.userMessages >= MAX_USER_MESSAGES) return res.status(429).json({ message: 'Bu sohbette mesaj sınırına ulaşıldı. Ekibimiz size e-postayla ya da telefonla dönebilir.' });
  const { messages, askContact, hasLead } = await visitorMessage(session, text);
  res.json({ messages: messages.map(view), askContact, hasLead });
};

// Sohbetteki hızlı "Beni arayın" formu
const PHONE_DIGITS = /^\+?[\d\s()-]{10,20}$/;
export const postChatContact = async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return;
  const { name, phone, company, callTime } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ message: 'Adınızı yazın.' });
  if (!PHONE_DIGITS.test(String(phone || '').trim()) || String(phone).replace(/\D/g, '').length < 10) return res.status(400).json({ message: 'Geçerli bir telefon numarası yazın.' });
  if (session.status === 'CLOSED') return res.status(409).json({ message: 'Bu sohbet kapatıldı. Yeni bir sohbet başlatabilirsiniz.' });
  const messages = await submitContact(session, { name, phone, company, callTime });
  res.status(201).json({ messages: messages.map(view), hasLead: true });
};

export const postLead = async (req, res) => {
  const { name, company, phone, email, message, consent } = req.body || {};
  if (!consent) return res.status(400).json({ message: 'Devam etmek için aydınlatma metnini onaylayın.' });
  if (!String(name || '').trim()) return res.status(400).json({ message: 'Adınızı yazın.' });
  if (!String(phone || '').trim() && !EMAIL.test(String(email || ''))) return res.status(400).json({ message: 'Size ulaşabilmemiz için telefon ya da e-posta yazın.' });
  const lead = await createFormLead({ name, company, phone, email, message, utm: cleanUtm(req.body?.utm) });
  res.status(201).json({ id: lead.id, message: 'Talebiniz alındı. Ekibimiz en kısa sürede size ulaşacak.' });
};

// ─── Platform paneli ─────────────────────────────────────────────────────────
export const getSiteAdmin = async (req, res) => res.json(await getSiteSettings());
export const putSiteAdmin = async (req, res) => res.json(await saveSiteSettings(req.body || {}));

export const listChats = async (req, res) => {
  const where = {
    userMessages: { gt: 0 }, // yalnızca açılıp hiç yazılmamış sohbetler listelenmez
    ...(req.query.filter === 'waiting' && { OR: [{ needsHuman: true }, { unread: true, status: 'HUMAN' }] }),
    ...(req.query.filter === 'lead' && { lead: { isNot: null } })
  };
  const rows = await db.chatSession.findMany({
    where, orderBy: { lastMessageAt: 'desc' }, take: 100,
    include: { lead: { select: { id: true, name: true, company: true, phone: true, email: true, status: true } }, messages: { orderBy: { id: 'desc' }, take: 1 } }
  });
  const [waiting, unread] = await Promise.all([
    db.chatSession.count({ where: { userMessages: { gt: 0 }, needsHuman: true } }),
    db.chatSession.count({ where: { userMessages: { gt: 0 }, unread: true } })
  ]);
  res.json({
    stats: { waiting, unread },
    data: rows.map(({ messages, ...s }) => ({ ...s, last: messages[0] ? view(messages[0]) : null }))
  });
};

export const getChatAdmin = async (req, res) => {
  const session = await db.chatSession.findUnique({ where: { id: req.params.id }, include: { lead: true, messages: { orderBy: { id: 'asc' } } } });
  if (!session) return res.status(404).json({ message: 'Sohbet bulunamadı.' });
  if (session.unread) await db.chatSession.update({ where: { id: session.id }, data: { unread: false } });
  res.json(session);
};

export const replyChat = async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 2000);
  if (!text) return res.status(400).json({ message: 'Mesaj boş olamaz.' });
  const exists = await db.chatSession.findUnique({ where: { id: req.params.id } });
  if (!exists) return res.status(404).json({ message: 'Sohbet bulunamadı.' });
  res.json(view(await agentMessage(req.params.id, text)));
};

// status: BOT (bota geri ver), HUMAN (devral), CLOSED
export const updateChat = async (req, res) => {
  const status = ['BOT', 'HUMAN', 'CLOSED'].includes(req.body?.status) ? req.body.status : undefined;
  const session = await db.chatSession.update({ where: { id: req.params.id }, data: { ...(status && { status }), ...(status && status !== 'HUMAN' && { needsHuman: false }) } });
  res.json(session);
};

export const listLeads = async (req, res) => {
  const where = req.query.status ? { status: String(req.query.status) } : {};
  const [rows, counts] = await Promise.all([
    db.lead.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
    db.lead.groupBy({ by: ['status'], _count: true })
  ]);
  res.json({ counts: Object.fromEntries(counts.map((c) => [c.status, c._count])), data: rows });
};

export const updateLead = async (req, res) => {
  const data = {};
  if (['NEW', 'CONTACTED', 'WON', 'LOST'].includes(req.body?.status)) data.status = req.body.status;
  if (typeof req.body?.note === 'string') data.note = req.body.note.slice(0, 4000);
  res.json(await db.lead.update({ where: { id: parseInt(req.params.id) }, data }));
};
