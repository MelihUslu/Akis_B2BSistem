import prisma from '../utils/prisma.js';
import xlsx from 'xlsx';
import { availableCredit, round2 } from '../services/pricingService.js';
import { notifyAdmins, notifyCompany, safeNotify } from '../services/notificationService.js';
import { postEntry, rateOrCurrent, CurrencyError } from '../services/accountPosting.js';
import { formatMoney } from '../services/money.js';
import { getExchangeRates } from '../services/exchangeRateService.js';

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
    const company = await prisma.company.findUnique({ where: { id: parseInt(companyId) || 0 } });
    if (!company) return res.status(404).json({ message: 'Cari bulunamadı.' });

    // Tutar carinin para birimindedir; dövizli caride kur elle verilebilir (TL karşılığı için), yoksa güncel kur
    const rate = await rateOrCurrent(company.currency, req.body.rate);
    const transaction = await prisma.$transaction((tx) => postEntry(tx, {
      company, type, amount: value, rate, description, source: 'MANUAL', createdByName: req.user.name
    }));

    safeNotify(notifyCompany(company.id, {
      type: 'PAYMENT',
      title: type === 'CREDIT' ? 'Hesabınıza alacak kaydedildi' : 'Hesabınıza borç kaydedildi',
      message: `${formatMoney(transaction.amount, company.currency)} — ${description || 'Manuel cari işlem'}`,
      link: '/bayi/finance'
    }));

    res.status(201).json(transaction);
  } catch (error) {
    if (error instanceof CurrencyError) return res.status(error.status).json({ message: error.message });
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
      currency: company.currency,
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
      message: `${company.name} ${formatMoney(company.currentBalance, company.currency)} bakiye ile mutabık olduğunu onayladı.`,
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
      include: { company: { select: { id: true, name: true } }, user: { select: { name: true } } }, // bağlantıyla verilen mutabakatta user boş, responderName dolu
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
        order: { select: { totalAmount: true, subtotal: true, company: { select: { id: true, name: true } } } }
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
      'Bakiye': t.balanceAfter,
      'Para Birimi': statement.company.currency === 'TRY' ? 'TL' : statement.company.currency
    }));
    rows.unshift({ 'Tarih': '', 'Açıklama': 'Açılış bakiyesi', 'Borç': '', 'Alacak': '', 'Bakiye': statement.openingBalance, 'Para Birimi': statement.company.currency === 'TRY' ? 'TL' : statement.company.currency });

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

/**
 * Finans özeti: alacak / borç toplamları, vadesi geçen ve yaklaşan ödemeler, en borçlu cariler, son tahsilatlar.
 * Bakiye ve hareketler carinin kendisinde (Cari Hesaplar); bu uç yalnızca takip için özet verir.
 * Vade, onaylanan siparişin vade tarihinden gelir ve yalnızca borçlu (bakiyesi eksi) cariler için gösterilir.
 */
export const getFinanceSummary = async (req, res) => {
  try {
    const now = new Date();
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const debtorWhere = { kind: { in: ['DEALER', 'CUSTOMER'] }, currentBalance: { lt: 0 } };
    const companySelect = { id: true, name: true, kind: true, currency: true };
    const [receivable, payable, debtors, dueOrders, payments, fx] = await Promise.all([
      prisma.company.groupBy({ by: ['currency'], where: debtorWhere, _sum: { currentBalance: true }, _count: { _all: true } }),
      prisma.company.groupBy({ by: ['currency'], where: { kind: 'SUPPLIER', currentBalance: { gt: 0 } }, _sum: { currentBalance: true }, _count: { _all: true } }),
      prisma.company.findMany({ where: debtorWhere, select: { ...companySelect, currentBalance: true, riskLimit: true, phone: true }, orderBy: { currentBalance: 'asc' }, take: 100 }),
      prisma.order.findMany({
        where: { dueDate: { not: null, lte: horizon }, status: { in: ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'COMPLETED'] }, company: debtorWhere },
        select: { id: true, dueDate: true, totalAmount: true, company: { select: companySelect } },
        orderBy: { dueDate: 'asc' },
        take: 50
      }),
      prisma.payment.findMany({
        where: { status: 'COMPLETED', direction: 'IN' },
        select: { id: true, amount: true, currency: true, method: true, paymentDate: true, receiptNo: true, company: { select: companySelect } },
        orderBy: { paymentDate: 'desc' },
        take: 8
      }),
      getExchangeRates()
    ]);
    const rateOf = (cur) => (cur === 'TRY' ? 1 : fx.rates?.[cur] || null);
    // Farklı para birimleri toplanmaz: para birimi başına tutar + güncel kurla TL karşılığı toplamı
    const byCurrency = (groups, sign) => {
      const list = groups.map((g) => ({ currency: g.currency, amount: round2(sign * (g._sum.currentBalance || 0)), count: g._count._all }))
        .sort((a, b) => (a.currency === 'TRY' ? -1 : b.currency === 'TRY' ? 1 : a.currency.localeCompare(b.currency)));
      return {
        byCurrency: list,
        count: list.reduce((s, g) => s + g.count, 0),
        amountTRY: round2(list.reduce((s, g) => s + g.amount * (rateOf(g.currency) || 0), 0)),
        // Geriye uyumluluk: TL karşılığı toplam
        amount: round2(list.reduce((s, g) => s + g.amount * (rateOf(g.currency) || 0), 0))
      };
    };
    const overdue = dueOrders.filter((o) => o.dueDate < now);
    const upcoming = dueOrders.filter((o) => o.dueDate >= now);
    const sum = (list) => round2(list.reduce((s, o) => s + o.totalAmount, 0));
    const ranked = debtors
      .map((d) => ({ ...d, balanceTRY: rateOf(d.currency) ? round2(d.currentBalance * rateOf(d.currency)) : null }))
      .sort((a, b) => (a.balanceTRY ?? 0) - (b.balanceTRY ?? 0))
      .slice(0, 8);
    res.json({
      receivable: byCurrency(receivable, -1),
      payable: byCurrency(payable, 1),
      overdue: { amount: sum(overdue), count: overdue.length, orders: overdue },
      upcoming: { amount: sum(upcoming), count: upcoming.length, orders: upcoming },
      debtors: ranked,
      payments,
      rates: fx.rates || {}
    });
  } catch (error) {
    console.error('getFinanceSummary error:', error);
    res.status(500).json({ message: 'Finans özeti getirilemedi.' });
  }
};
