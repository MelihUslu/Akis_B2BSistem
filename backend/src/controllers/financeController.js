import prisma from '../utils/prisma.js';
import xlsx from 'xlsx';
import { availableCredit, round2 } from '../services/pricingService.js';
import { notifyAdmins, notifyCompany, safeNotify } from '../services/notificationService.js';

export const createTransaction = async (req, res) => {
  try {
    const { companyId, type, amount, description } = req.body;
    const value = parseFloat(amount);

    if (!['DEBT', 'CREDIT'].includes(type)) {
      return res.status(400).json({ message: 'İşlem tipi BORÇ veya ALACAK olmalıdır.' });
    }
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ message: 'Tutar sıfırdan büyük olmalıdır.' });
    }

    const transaction = await prisma.$transaction(async (tx) => {
      // 1. İşlemi kaydet
      const t = await tx.financialTransaction.create({
        data: {
          companyId: parseInt(companyId),
          type, // DEBT (Borç), CREDIT (Alacak)
          amount: value,
          description
        }
      });

      // 2. Şirket bakiyesini güncelle
      await tx.company.update({
        where: { id: parseInt(companyId) },
        data: {
          currentBalance: { increment: type === 'CREDIT' ? value : -value }
        }
      });

      return t;
    });

    safeNotify(notifyCompany(parseInt(companyId), {
      type: 'PAYMENT',
      title: type === 'CREDIT' ? 'Hesabınıza alacak kaydedildi' : 'Hesabınıza borç kaydedildi',
      message: `₺${value.toLocaleString('tr-TR')} — ${description || 'Manuel cari işlem'}`,
      link: '/bayi/finance'
    }));

    res.status(201).json(transaction);
  } catch (error) {
    res.status(400).json({ message: 'Finansal işlem kaydedilemedi.' });
  }
};

/**
 * Cari ekstre: işlemler tarih sırasıyla, her satırda yürüyen bakiye ile.
 * Bakiye artı = alacaklı, eksi = borçlu.
 */
const buildStatement = async (companyId) => {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { plasiyer: { select: { name: true, email: true } } }
  });
  if (!company) return null;

  const transactions = await prisma.financialTransaction.findMany({
    where: { companyId },
    orderBy: [{ date: 'asc' }, { id: 'asc' }]
  });

  // Ekstre dışı (ör. seed ile girilmiş) açılış bakiyesini hesapla
  const movement = transactions.reduce((s, t) => s + (t.type === 'CREDIT' ? t.amount : -t.amount), 0);
  const openingBalance = round2(company.currentBalance - movement);

  let running = openingBalance;
  const rows = transactions.map(t => {
    running = round2(running + (t.type === 'CREDIT' ? t.amount : -t.amount));
    return { ...t, balanceAfter: running };
  });

  const [credit, lastReconciliation, upcomingDue] = await Promise.all([
    availableCredit(prisma, company),
    prisma.reconciliation.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } }
    }),
    prisma.order.findFirst({
      where: { companyId, dueDate: { not: null }, status: { in: ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'COMPLETED'] } },
      orderBy: { dueDate: 'asc' },
      select: { id: true, dueDate: true, totalAmount: true }
    })
  ]);

  return {
    company: {
      id: company.id,
      name: company.name,
      riskLimit: company.riskLimit,
      currentBalance: company.currentBalance,
      paymentTermDays: company.paymentTermDays,
      plasiyer: company.plasiyer
    },
    credit,
    openingBalance,
    transactions: rows.reverse(), // En yeni en üstte
    lastReconciliation,
    upcomingDue: company.currentBalance < 0 ? upcomingDue : null
  };
};

export const getMyStatement = async (req, res) => {
  try {
    const statement = await buildStatement(req.user.companyId);
    if (!statement) return res.status(404).json({ message: 'Firma bulunamadı.' });
    res.json(statement);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Cari ekstre getirilemedi.' });
  }
};

export const getCompanyStatement = async (req, res) => {
  try {
    const statement = await buildStatement(parseInt(req.params.companyId));
    if (!statement) return res.status(404).json({ message: 'Firma bulunamadı.' });
    res.json(statement);
  } catch (error) {
    res.status(500).json({ message: 'Cari ekstre getirilemedi.' });
  }
};

// Bayi "Mutabıkım" butonuna bastığında güncel bakiye ile mutabakat kaydı oluşur
export const reconcile = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
    const reconciliation = await prisma.reconciliation.create({
      data: {
        companyId: company.id,
        userId: req.user.id,
        balance: company.currentBalance,
        periodEnd: new Date()
      }
    });

    safeNotify(notifyAdmins({
      type: 'PAYMENT',
      title: 'Cari mutabakat onayı',
      message: `${company.name} ₺${company.currentBalance.toLocaleString('tr-TR')} bakiye ile mutabık olduğunu onayladı.`,
      link: '/admin/finance'
    }));

    res.status(201).json({ message: 'Mutabakatınız kaydedildi. Teşekkür ederiz.', reconciliation });
  } catch (error) {
    res.status(500).json({ message: 'Mutabakat kaydedilemedi.' });
  }
};

export const getReconciliations = async (req, res) => {
  try {
    const list = await prisma.reconciliation.findMany({
      include: { company: { select: { name: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: 'Mutabakatlar getirilemedi.' });
  }
};

export const getPlasiyerPoints = async (req, res) => {
  try {
    const points = await prisma.plasiyerPoint.findMany({
      include: {
        user: { select: { name: true, email: true } },
        order: { select: { totalAmount: true, subtotal: true, company: { select: { name: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(points);
  } catch (error) {
    res.status(500).json({ message: 'Puanlar getirilirken hata oluştu.' });
  }
};

// Ekstre Excel çıktısı (bayi kendi ekstresini, FINANCE yetkili admin herhangi bir bayininkini alır)
export const exportStatement = async (req, res) => {
  try {
    const companyId = req.user.role === 'BAYI' ? req.user.companyId : parseInt(req.params.companyId);
    const statement = await buildStatement(companyId);
    if (!statement) return res.status(404).json({ message: 'Firma bulunamadı.' });

    const rows = [...statement.transactions].reverse().map(t => ({
      'Tarih': new Date(t.date).toLocaleString('tr-TR'),
      'Açıklama': t.description || '',
      'Borç': t.type === 'DEBT' ? t.amount : '',
      'Alacak': t.type === 'CREDIT' ? t.amount : '',
      'Bakiye': t.balanceAfter
    }));
    rows.unshift({ 'Tarih': '', 'Açıklama': 'Açılış bakiyesi', 'Borç': '', 'Alacak': '', 'Bakiye': statement.openingBalance });

    const ws = xlsx.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 50 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Ekstre');
    const safeName = statement.company.name.replace(/[^\w\-ğüşöçıİĞÜŞÖÇ ]/g, '').slice(0, 40).trim().replace(/\s+/g, '-');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`ekstre-${safeName}-${new Date().toISOString().slice(0, 10)}.xlsx`)}`);
    res.send(xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  } catch (error) {
    res.status(500).json({ message: 'Ekstre Excel\'i oluşturulamadı.' });
  }
};
