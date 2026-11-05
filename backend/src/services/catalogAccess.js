/**
 * Bayiye katalog erişimi: grup bazlı görünürlük ve stok ayırma.
 *
 * Görünürlük: ürün ve kategori "visibleGroups" boşsa herkese açıktır; doluysa yalnızca o bayi grupları görür.
 * Kategori kısıtı alt kategorilere de geçer; varyantlar ana ürünün kısıtını kullanır. Yönetici her şeyi görür.
 *
 * Stok ayırma: onay bekleyen siparişlerdeki miktarlar stoktan ayrılmış sayılır. Stok onayda düşer;
 * o zamana kadar bayiye gösterilen ve sipariş edilebilen miktar "stok − bekleyen siparişler"dir.
 */
export const RESERVING_STATUS = 'PENDING';

// Grubun göremediği kategoriler (alt kategorileriyle)
export const hiddenCategoryIds = async (prisma, group) => {
  const cats = await prisma.category.findMany({ select: { id: true, parentId: true, visibleGroups: true } });
  const hidden = new Set(cats.filter((c) => c.visibleGroups?.length && !c.visibleGroups.includes(group)).map((c) => c.id));
  let added = hidden.size > 0;
  while (added) {
    added = false;
    for (const c of cats) if (c.parentId && hidden.has(c.parentId) && !hidden.has(c.id)) { hidden.add(c.id); added = true; }
  }
  return hidden;
};

/** Bayinin göremediği kategoriler; firma yoksa (yönetici) kısıt yok. */
export const accessFor = async (prisma, company) => {
  if (!company) return null;
  const group = company.dealerGroup || 'STANDART';
  return { group, hiddenCategories: await hiddenCategoryIds(prisma, group) };
};

/** Ana ürün sorgusu için koşul (katalog listesi, filtreler). */
export const visibleProductWhere = (access) => {
  if (!access) return {};
  return {
    AND: [
      { OR: [{ visibleGroups: { isEmpty: true } }, { visibleGroups: { has: access.group } }] },
      ...(access.hiddenCategories.size ? [{ OR: [{ categoryId: null }, { categoryId: { notIn: [...access.hiddenCategories] } }] }] : [])
    ]
  };
};

/** Tek ürün (ya da varyant; parent yüklü olmalı) bayiye görünür mü? */
export const isVisibleTo = (product, access) => {
  if (!access || !product) return true;
  const master = product.parent || product;
  if (master.visibleGroups?.length && !master.visibleGroups.includes(access.group)) return false;
  return !(master.categoryId && access.hiddenCategories.has(master.categoryId));
};

/**
 * Bayinin numarasıyla tek ürüne yaptığı işlemler için (stok bildirimi, favori): ürün yoksa, pasifse ya da bayinin
 * grubuna kapalıysa null. Hepsi aynı yanıtı alır; numara denenerek gizli ürün bulunamaz.
 */
export const findVisibleProduct = async (prisma, company, id, where = {}) => {
  if (!Number.isInteger(id)) return null;
  const product = await prisma.product.findFirst({
    where: { id, isActive: true, ...where },
    include: { parent: { select: { isActive: true, visibleGroups: true, categoryId: true } } }
  });
  if (!product || product.parent?.isActive === false) return null;
  return isVisibleTo(product, await accessFor(prisma, company)) ? product : null;
};

/**
 * Onay bekleyen siparişlerde ayrılmış miktarlar: Map<productId, adet>.
 * excludeOrderId: kendi siparişi hesaba katılmasın (onay anında).
 */
export const reservedQuantities = async (prisma, productIds, { excludeOrderId } = {}) => {
  const ids = [...new Set(productIds.filter(Boolean))];
  const map = new Map();
  if (ids.length === 0) return map;
  const rows = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: { productId: { in: ids }, status: 'APPROVED', order: { status: RESERVING_STATUS, ...(excludeOrderId && { id: { not: excludeOrderId } }) } },
    _sum: { quantity: true }
  });
  for (const r of rows) map.set(r.productId, r._sum.quantity || 0);
  return map;
};
