import prisma, { currentTenantId } from '../utils/prisma.js';
import { assertWithinLimit, LimitError } from '../services/limitService.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { sendCredentialsMail, sendMail } from '../services/mailService.js';
import { notifyAdmins, safeNotify } from '../services/notificationService.js';
import { emitEvent } from '../services/webhookService.js';
import { normalizeCurrency, assertCurrencyChangeAllowed } from '../services/accountPosting.js';
import { tenantUrl, tenantPortalUrl } from '../config.js';

const generatePassword = () => crypto.randomBytes(9).toString('base64url').slice(0, 12);

const parseOptionalFloat = (v) => (v !== undefined && v !== '' ? parseFloat(v) : undefined);
const parseOptionalInt = (v) => (v !== undefined && v !== '' && v !== null ? parseInt(v) : undefined);

export const getCompanies = async (req, res) => {
  try {
    const { search, status } = req.query;
    // Varsayılan: yalnızca bayiler (Bayi Yönetimi, kampanya, finans). ?kind=DEALER,CUSTOMER gibi birden çok tür istenebilir.
    const kinds = String(req.query.kind || 'DEALER').split(',').filter((k) => ['DEALER', 'CUSTOMER', 'SUPPLIER'].includes(k));

    const where = {
      kind: { in: kinds.length ? kinds : ['DEALER'] },
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { taxNumber: { contains: search, mode: 'insensitive' } },
          { authorizedPerson: { contains: search, mode: 'insensitive' } },
          { externalCode: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(status && { status })
    };

    const include = {
      users: { select: { id: true, name: true, email: true, role: true, isOwner: true, isActive: true } },
      plasiyer: { select: { id: true, name: true } },
      reconciliations: { orderBy: { createdAt: 'desc' }, take: 1 }
    };

    // ?page verilirse sayfalı yanıt
    if (req.query.page) {
      const take = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
      const page = Math.max(parseInt(req.query.page) || 1, 1);
      // Sekme sayıları: aramaya uyan bayilerin durum dağılımı (durum filtresi uygulanmadan)
      const { status: _ignored, ...searchWhere } = where; // eslint-disable-line no-unused-vars
      const [data, total, pendingCount, groups] = await Promise.all([
        prisma.company.findMany({ where, include, orderBy: [{ status: 'desc' }, { createdAt: 'desc' }], take, skip: (page - 1) * take }),
        prisma.company.count({ where }),
        prisma.company.count({ where: { status: 'PENDING', kind: 'DEALER' } }),
        prisma.company.groupBy({ by: ['status'], where: searchWhere, _count: { _all: true } })
      ]);
      const statusCounts = Object.fromEntries(groups.map(g => [g.status, g._count._all]));
      statusCounts.ALL = groups.reduce((sum, g) => sum + g._count._all, 0);
      return res.json({ data, pagination: { total, page, pages: Math.max(1, Math.ceil(total / take)) }, pendingCount, statusCounts });
    }

    const companies = await prisma.company.findMany({
      where,
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true }
        },
        plasiyer: { select: { id: true, name: true } },
        reconciliations: { orderBy: { createdAt: 'desc' }, take: 1 }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(companies);
  } catch (error) {
    res.status(500).json({ message: 'Bayiler getirilirken hata oluştu.' });
  }
};

export const createCompany = async (req, res) => {
  try {
    const {
      name, taxNumber, taxOffice, authorizedPerson, phone, address,
      email, password, // Boş bırakılırsa güçlü bir şifre otomatik üretilir
      riskLimit, dealerGroup, netDiscount, minOrderAmount, paymentTermDays, plasiyerId
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'Firma unvanı ve e-posta zorunludur.' });
    }
    if (password && password.length < 8) {
      return res.status(400).json({ message: 'Şifre en az 8 karakter olmalıdır.' });
    }

    await assertWithinLimit(req.tenant, 'dealers');

    const plainPassword = password || generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const company = await prisma.company.create({
      data: {
        name,
        taxNumber: taxNumber || null,
        taxOffice,
        authorizedPerson,
        phone,
        address,
        status: 'ACTIVE', // Admin manuel eklediği için direkt aktif yapıyoruz
        riskLimit: parseFloat(riskLimit) || 0,
        dealerGroup: dealerGroup || 'STANDART',
        netDiscount: parseFloat(netDiscount) || 0,
        minOrderAmount: parseFloat(minOrderAmount) || 0,
        paymentTermDays: parseInt(paymentTermDays) || 30,
        currency: normalizeCurrency(req.body.currency) || 'TRY',
        plasiyerId: parseOptionalInt(plasiyerId) ?? null,
        externalCode: req.body.externalCode || null,
        users: {
          create: {
            tenantId: currentTenantId(), // İç içe kayıtlarda kiracı otomatik eklenmez
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            name: authorizedPerson || name,
            role: 'BAYI',
            isOwner: true, // Bayinin ana kullanıcısı (alt kullanıcıları yönetir)
            emailVerifiedAt: new Date()
          }
        }
      },
      include: { users: { select: { id: true, name: true, email: true, role: true } } }
    });

    const mail = await sendCredentialsMail({ to: email, name: authorizedPerson || name, password: plainPassword, tenant: req.tenant })
      .catch(err => { console.error('[MAIL] Gönderim hatası:', err.message); return { delivered: false }; });

    emitEvent(req.tenant.id, 'company.created', { id: company.id, name: company.name, taxNumber: company.taxNumber, externalCode: company.externalCode, source: 'ADMIN' });

    res.status(201).json({
      ...company,
      message: mail.delivered
        ? 'Bayi oluşturuldu, giriş bilgileri e-posta ile gönderildi.'
        : 'Bayi oluşturuldu ancak e-posta gönderilemedi (SMTP ayarlarını kontrol edin).'
    });
  } catch (error) {
    if (error instanceof LimitError) return res.status(error.status).json({ message: error.message, code: error.code });
    console.error(error);
    res.status(400).json({ message: 'Bayi oluşturulurken hata oluştu. E-posta veya Vergi No benzersiz olmalıdır.' });
  }
};

export const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, taxNumber, taxOffice, authorizedPerson, phone, address, status,
      riskLimit, dealerGroup, netDiscount, minOrderAmount, paymentTermDays, plasiyerId
    } = req.body;

    if (status && !['ACTIVE', 'PASSIVE', 'PENDING'].includes(status)) {
      return res.status(400).json({ message: 'Geçersiz durum.' });
    }

    const before = await prisma.company.findUnique({ where: { id: parseInt(id) }, include: { users: { where: { role: 'BAYI' } } } });
    if (!before || before.kind !== 'DEALER') return res.status(404).json({ message: 'Bayi bulunamadı.' });
    const approving = before.status === 'PENDING' && status === 'ACTIVE';
    const currency = req.body.currency !== undefined ? normalizeCurrency(req.body.currency) : undefined;
    if (req.body.currency !== undefined && !currency) return res.status(400).json({ message: 'Para birimi TL, USD veya EUR olmalı.' });
    if (currency && currency !== before.currency) {
      try { await assertCurrencyChangeAllowed(before, currency); } catch (e) { return res.status(400).json({ message: e.message }); }
    }
    if (approving) await assertWithinLimit(req.tenant, 'dealers');

    const company = await prisma.company.update({
      where: { id: parseInt(id) },
      data: {
        name, taxNumber: taxNumber === undefined ? undefined : (taxNumber || null), taxOffice, authorizedPerson, phone, address, status,
        riskLimit: parseOptionalFloat(riskLimit),
        dealerGroup,
        netDiscount: parseOptionalFloat(netDiscount),
        minOrderAmount: parseOptionalFloat(minOrderAmount),
        paymentTermDays: parseOptionalInt(paymentTermDays),
        plasiyerId: plasiyerId === '' || plasiyerId === null ? null : parseOptionalInt(plasiyerId),
        externalCode: req.body.externalCode === undefined ? undefined : (req.body.externalCode || null),
        currency,
      },
    });

    // Başvuru onaylandı: bayiye haber ver
    if (approving) {
      for (const u of before.users) {
        sendMail({
          to: u.email,
          fromName: req.tenant.name,
          subject: `${req.tenant.name} bayilik başvurunuz onaylandı`,
          html: `<p>Merhaba ${u.name},</p><p><b>${req.tenant.name}</b> bayilik başvurunuz onaylandı. Başvuruda belirlediğiniz şifreyle giriş yapabilirsiniz.</p><p><a href="${tenantPortalUrl(req.tenant)}/login">Portala giriş yap</a></p>`
        }).catch(() => {});
      }
    }

    res.json(company);
  } catch (error) {
    if (error instanceof LimitError) return res.status(error.status).json({ message: error.message, code: error.code });
    res.status(400).json({ message: error.code === 'P2002' ? 'Vergi no veya cari kodu başka bir bayide kayıtlı.' : 'Güncelleme başarısız.' });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { companyId } = req.params;

    const company = await prisma.company.findUnique({
      where: { id: parseInt(companyId) },
      include: { users: { where: { role: 'BAYI' } } }
    });

    if (!company || company.users.length === 0) {
      return res.status(404).json({ message: 'Bayi kullanıcısı bulunamadı.' });
    }

    const user = company.users[0];
    const newPassword = generatePassword();

    await prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(newPassword, 10) }
    });

    const mail = await sendCredentialsMail({ to: user.email, name: user.name, password: newPassword, isReset: true, tenant: req.tenant })
      .catch(err => { console.error('[MAIL] Gönderim hatası:', err.message); return { delivered: false }; });

    res.json({
      message: mail.delivered
        ? `Şifre sıfırlandı ve ${user.email} adresine gönderildi.`
        : 'Şifre sıfırlandı ancak e-posta gönderilemedi (SMTP ayarlarını kontrol edin).'
    });
  } catch (error) {
    res.status(500).json({ message: 'Şifre sıfırlama hatası.' });
  }
};

/**
 * Bayilik başvurusu (giriş ekranındaki form, oturum gerektirmez).
 * Firma "Bekliyor" durumunda oluşur; admin onaylayana kadar giriş yapılamaz.
 */
export const applyAsDealer = async (req, res) => {
  try {
    const b = req.body;
    const email = String(b.email || '').toLowerCase().trim();
    const required = [b.companyName, b.authorizedPerson, b.phone, b.taxNumber];
    if (required.some(v => !String(v || '').trim())) {
      return res.status(400).json({ message: 'Firma unvanı, yetkili kişi, telefon ve vergi numarası zorunludur.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Geçerli bir e-posta girin.' });
    if (!b.password || b.password.length < 8) return res.status(400).json({ message: 'Şifre en az 8 karakter olmalıdır.' });
    if (!b.kvkkConsent) return res.status(400).json({ message: 'Kişisel verilerin işlenmesine onay vermeniz gerekiyor.' });

    if (await prisma.user.findFirst({ where: { email } })) {
      return res.status(400).json({ message: 'Bu e-posta ile daha önce başvuru yapılmış veya kayıtlı bir hesap var.' });
    }
    if (await prisma.company.findFirst({ where: { taxNumber: String(b.taxNumber).trim() } })) {
      return res.status(400).json({ message: 'Bu vergi numarasıyla kayıtlı bir bayi var. Lütfen firma yetkilisiyle iletişime geçin.' });
    }

    const company = await prisma.$transaction(async (tx) => {
      const c = await tx.company.create({
        data: {
          name: b.companyName.trim(), taxNumber: String(b.taxNumber).trim(), taxOffice: b.taxOffice || null,
          authorizedPerson: b.authorizedPerson.trim(), phone: b.phone, address: b.address || null,
          status: 'PENDING', source: 'APPLICATION', applicationNote: String(b.note || '').slice(0, 1000) || null
        }
      });
      await tx.user.create({
        data: {
          email, name: b.authorizedPerson.trim(), role: 'BAYI', companyId: c.id, isOwner: true,
          password: await bcrypt.hash(b.password, 10), emailVerifiedAt: new Date()
        }
      });
      return c;
    });

    safeNotify(notifyAdmins({ type: 'SYSTEM', title: 'Yeni bayilik başvurusu', message: `${company.name} bayi olmak için başvurdu.`, link: '/admin/dealers?status=PENDING' }));
    emitEvent(req.tenant.id, 'company.created', { id: company.id, name: company.name, taxNumber: company.taxNumber, source: 'APPLICATION', status: 'PENDING' });

    res.status(201).json({ message: 'Başvurunuz alındı. Onaylandığında e-posta ile bilgilendirileceksiniz.' });
  } catch (error) {
    console.error('applyAsDealer error:', error);
    res.status(400).json({ message: 'Başvuru alınamadı.' });
  }
};
