import crypto from 'crypto';
import prisma, { runAsPlatform, runWithTenant } from '../utils/prisma.js';
import { encrypt, decrypt } from '../utils/secretBox.js';
import { API_PUBLIC_URL } from '../config.js';
import { aiStatus, consumeAiQuota, AiError } from '../services/ai/index.js';
import { fetchPhoneInfo, sendText, validSignature, handleWebhook, previewAnswer, WhatsappError, WINDOW_MS } from '../services/whatsappService.js';

const fail = (res, error, fallback) => {
  if (error instanceof WhatsappError || error instanceof AiError) return res.status(error.status).json({ message: error.message });
  console.error(fallback, error);
  res.status(500).json({ message: fallback });
};

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const webhookUrl = (c) => `${API_PUBLIC_URL.replace(/\/$/, '')}/api/whatsapp/webhook/${c.webhookKey}`;

const channelView = (c) => c && ({
  phoneNumberId: c.phoneNumberId, wabaId: c.wabaId, displayPhone: c.displayPhone, verifiedName: c.verifiedName,
  aiEnabled: c.aiEnabled, knowledge: c.knowledge, handoffMessage: c.handoffMessage,
  lastWebhookAt: c.lastWebhookAt, lastError: c.lastError, webhookUrl: webhookUrl(c), verifyToken: c.verifyToken,
  tokenHint: `…${decrypt(c.accessTokenEnc).slice(-4)}`
});

// ─── Bağlantı ve yapay zekâ ayarları ─────────────────────────────────────────

export const getChannel = async (req, res) => {
  const channel = await prisma.whatsappChannel.findFirst();
  res.json({ connected: Boolean(channel), channel: channelView(channel), ai: aiStatus(), publicUrlOk: !/localhost|127\.0\.0\.1/.test(API_PUBLIC_URL) });
};

/**
 * Bağlan / bilgileri güncelle. Meta'ya numara bilgisi sorularak erişim anahtarı doğrulanır.
 * Güncellemede boş bırakılan anahtar ve gizli anahtar eskisi gibi kalır.
 */
export const connectChannel = async (req, res) => {
  try {
    const existing = await prisma.whatsappChannel.findFirst();
    const phoneNumberId = str(req.body.phoneNumberId, 40).replace(/\s/g, '');
    const token = str(req.body.accessToken, 1000) || (existing && decrypt(existing.accessTokenEnc));
    const appSecret = str(req.body.appSecret, 200) || (existing && decrypt(existing.appSecretEnc));
    if (!/^\d{5,30}$/.test(phoneNumberId)) return res.status(400).json({ message: 'Telefon numarası kimliğini (Phone number ID) Meta panelinden kopyalayın; yalnızca rakamlardan oluşur.' });
    if (!token) return res.status(400).json({ message: 'Erişim anahtarını (access token) girin.' });
    if (!appSecret) return res.status(400).json({ message: 'Uygulama gizli anahtarını (App secret) girin.' });

    const taken = await runAsPlatform(() => prisma.whatsappChannel.findUnique({ where: { phoneNumberId }, select: { tenantId: true } }));
    if (taken && taken.tenantId !== req.tenant.id) return res.status(409).json({ message: 'Bu WhatsApp numarası başka bir firmaya bağlı.' });

    const info = await fetchPhoneInfo(phoneNumberId, token);
    const data = {
      phoneNumberId, wabaId: str(req.body.wabaId, 40), displayPhone: info.displayPhone, verifiedName: info.verifiedName,
      accessTokenEnc: encrypt(token), appSecretEnc: encrypt(appSecret), lastError: ''
    };
    const channel = existing
      ? await prisma.whatsappChannel.update({ where: { id: existing.id }, data })
      : await prisma.whatsappChannel.create({ data: { ...data, webhookKey: crypto.randomBytes(18).toString('base64url'), verifyToken: crypto.randomBytes(18).toString('base64url') } });
    res.json({ channel: channelView(channel), message: existing ? 'Bağlantı bilgileri güncellendi.' : `${info.displayPhone || 'Numara'} bağlandı. Şimdi webhook adresini Meta paneline girin.` });
  } catch (error) {
    fail(res, error, 'WhatsApp bağlanamadı.');
  }
};

export const updateAiSettings = async (req, res) => {
  const channel = await prisma.whatsappChannel.findFirst();
  if (!channel) return res.status(404).json({ message: 'Önce WhatsApp numaranızı bağlayın.' });
  const data = {};
  if (req.body.aiEnabled !== undefined) data.aiEnabled = Boolean(req.body.aiEnabled);
  if (req.body.knowledge !== undefined) data.knowledge = str(req.body.knowledge, 8000);
  if (req.body.handoffMessage !== undefined) data.handoffMessage = str(req.body.handoffMessage, 300);
  const updated = await prisma.whatsappChannel.update({ where: { id: channel.id }, data });
  res.json({ channel: channelView(updated), message: 'Kaydedildi.' });
};

export const disconnectChannel = async (req, res) => {
  await prisma.whatsappChannel.deleteMany({});
  res.json({ message: 'WhatsApp bağlantısı kaldırıldı. Eski konuşmalar panelde kalır.' });
};

// "Yapay zekâyı dene": ekrandaki (henüz kaydedilmemiş olabilir) bilgilerle örnek cevap; WhatsApp'a gönderilmez
export const previewReply = async (req, res) => {
  try {
    const question = str(req.body.question, 1000);
    if (!question) return res.status(400).json({ message: 'Bir müşteri sorusu yazın.' });
    await consumeAiQuota(req.tenant.id);
    const out = await previewAnswer({ tenantId: req.tenant.id, knowledge: str(req.body.knowledge, 8000), handoffMessage: str(req.body.handoffMessage, 300) }, question);
    res.json(out);
  } catch (error) {
    fail(res, error, 'Örnek cevap üretilemedi.');
  }
};

// ─── Gelen kutusu ──────────────────────────────────────────────────────────

const FILTERS = {
  waiting: { needsHuman: true, status: { not: 'CLOSED' } },
  bot: { status: 'BOT' },
  human: { status: 'HUMAN' },
  closed: { status: 'CLOSED' }
};

export const listConversations = async (req, res) => {
  try {
    const q = str(req.query.q, 60);
    const digits = q.replace(/\D/g, '');
    const search = q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, ...(digits.length >= 3 ? [{ waId: { contains: digits } }] : []), { lastPreview: { contains: q, mode: 'insensitive' } }] } : {};
    const where = { ...(FILTERS[req.query.filter] || { status: { not: 'CLOSED' } }), ...search };
    const [items, counts] = await Promise.all([
      prisma.waConversation.findMany({ where, orderBy: { lastMessageAt: 'desc' }, take: 100 }),
      Promise.all(Object.entries(FILTERS).map(async ([k, w]) => [k, await prisma.waConversation.count({ where: w })]))
    ]);
    res.json({ items, counts: Object.fromEntries(counts) });
  } catch (error) {
    fail(res, error, 'Konuşmalar getirilemedi.');
  }
};

const loadConversation = async (id) => {
  const conv = await prisma.waConversation.findFirst({ where: { id: parseInt(id) || 0 } });
  if (!conv) throw new WhatsappError('Konuşma bulunamadı.', 404);
  return conv;
};

export const getConversation = async (req, res) => {
  try {
    const conv = await loadConversation(req.params.id);
    const messages = await prisma.waMessage.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'desc' }, take: 200 });
    messages.reverse();
    const ids = [...new Set(messages.map((m) => m.agentId).filter(Boolean))];
    const agents = ids.length ? Object.fromEntries((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name])) : {};
    if (conv.unread) await prisma.waConversation.update({ where: { id: conv.id }, data: { unread: 0 } });
    const lead = conv.customerLeadId ? await prisma.customerLead.findFirst({ where: { id: conv.customerLeadId }, select: { id: true, status: true, request: true } }) : null;
    res.json({
      conversation: { ...conv, unread: 0 }, lead,
      messages: messages.map((m) => ({ ...m, agentName: m.agentId ? agents[m.agentId] || '' : '' })),
      windowOpen: Boolean(conv.lastInboundAt && Date.now() - conv.lastInboundAt.getTime() < WINDOW_MS)
    });
  } catch (error) {
    fail(res, error, 'Konuşma getirilemedi.');
  }
};

// Ekip cevabı: konuşma ekipte kalır (yapay zekâ bu konuşmaya karışmaz)
export const sendAgentMessage = async (req, res) => {
  try {
    const conv = await loadConversation(req.params.id);
    const text = str(req.body.text, 4000);
    if (!text) return res.status(400).json({ message: 'Mesaj boş olamaz.' });
    const channel = await prisma.whatsappChannel.findFirst();
    if (!channel) return res.status(400).json({ message: 'WhatsApp bağlantısı yok.' });
    if (!conv.lastInboundAt || Date.now() - conv.lastInboundAt.getTime() >= WINDOW_MS) {
      return res.status(400).json({ message: 'Müşterinin son mesajının üzerinden 24 saat geçti. WhatsApp bu durumda yalnızca onaylı şablon mesaja izin veriyor; müşteriyi telefonla arayabilirsiniz.' });
    }
    const waMessageId = await sendText(channel, conv.waId, text);
    const message = await prisma.waMessage.create({ data: { conversationId: conv.id, direction: 'OUT', author: 'AGENT', agentId: req.user.id, body: text, waMessageId, status: 'sent' } });
    await prisma.waConversation.update({ where: { id: conv.id }, data: { status: 'HUMAN', needsHuman: false, unread: 0, lastMessageAt: new Date(), lastPreview: text.replace(/\s+/g, ' ').slice(0, 120) } });
    res.status(201).json({ message: { ...message, agentName: req.user.name || '' } });
  } catch (error) {
    fail(res, error, 'Mesaj gönderilemedi.');
  }
};

// Devral (HUMAN), yapay zekâya bırak (BOT), kapat (CLOSED)
export const setConversationStatus = async (req, res) => {
  try {
    const conv = await loadConversation(req.params.id);
    const status = req.body.status;
    if (!['BOT', 'HUMAN', 'CLOSED'].includes(status)) return res.status(400).json({ message: 'Geçersiz durum.' });
    if (status === 'BOT') {
      const channel = await prisma.whatsappChannel.findFirst();
      if (!channel?.aiEnabled) return res.status(400).json({ message: 'Yapay zekâ cevapları kapalı. WhatsApp ayarlarından açın.' });
    }
    const updated = await prisma.waConversation.update({ where: { id: conv.id }, data: { status, needsHuman: status === 'HUMAN' ? conv.needsHuman : false } });
    res.json({ conversation: updated });
  } catch (error) {
    fail(res, error, 'Durum değiştirilemedi.');
  }
};

// ─── Meta webhook (oturum yok; firma adresteki anahtardan bulunur) ───────────

const channelByKey = (key) => runAsPlatform(() => prisma.whatsappChannel.findUnique({ where: { webhookKey: String(key || '') } }));

// Meta panelinde "Doğrula ve kaydet" denince gelen istek
export const verifyWebhook = async (req, res) => {
  const channel = await channelByKey(req.params.key);
  if (channel && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === channel.verifyToken) {
    return res.type('text/plain').send(String(req.query['hub.challenge'] || ''));
  }
  res.sendStatus(403);
};

export const receiveWebhook = async (req, res) => {
  const channel = await channelByKey(req.params.key);
  if (!channel) return res.sendStatus(404);
  if (!validSignature(req.rawBody, req.get('x-hub-signature-256'), decrypt(channel.appSecretEnc))) return res.sendStatus(401);
  // Meta hızlı yanıt bekler; işleme arka planda sürer
  res.sendStatus(200);
  runWithTenant(channel.tenantId, () => handleWebhook(channel, req.body))
    .catch((err) => console.error('[WhatsApp] Webhook işlenemedi:', err.message));
};
