import prisma from '../utils/prisma.js';

export class LimitError extends Error {
  constructor(message) {
    super(message);
    this.status = 403;
    this.code = 'PLAN_LIMIT';
  }
}

const LIMITS = {
  // Onay bekleyen başvurular limite sayılmaz
  dealers: { field: 'maxDealers', label: 'bayi', count: () => prisma.company.count({ where: { kind: 'DEALER', status: { not: 'PENDING' } } }) },
  products: { field: 'maxProducts', label: 'ürün', count: () => prisma.product.count({ where: { isMaster: true } }) },
  admins: { field: 'maxAdmins', label: 'yönetici', count: () => prisma.user.count({ where: { role: 'ADMIN' } }) }
};

export const getUsage = async () => {
  const [dealers, products, admins] = await Promise.all(Object.values(LIMITS).map(l => l.count()));
  return { dealers, products, admins };
};

/**
 * Paket limitini aşacak işlemleri engeller. `adding`: eklenecek kayıt sayısı. Limit -1 ise sınırsızdır.
 * Kiracı bağlamında çağrılmalıdır (sayımlar otomatik olarak o kiracıya göre yapılır).
 */
export const assertWithinLimit = async (tenant, kind, adding = 1) => {
  const def = LIMITS[kind];
  const max = tenant.plan?.[def.field];
  if (max === undefined || max < 0) return;
  const used = await def.count();
  if (used + adding > max) {
    throw new LimitError(`${tenant.plan.name} paketiniz en fazla ${max} ${def.label} ile sınırlı (şu an ${used}). Daha fazlası için paketinizi yükseltin.`);
  }
};
