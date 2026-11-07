/**
 * Bayilere XML ürün beslemesi: e-ticaret sitesi olan bayi, firmanın ürünlerini kendi fiyatlarıyla sitesine aktarır.
 * Firma Ayarlar'dan açar (dealer_feed); bayinin ana kullanıcısı Profilim'den kendine özel gizli bir adres üretir.
 * Adres, bayinin katalogda gördüğü ürünleri (grup görünürlüğü, pasif ürünler hariç) bayinin net fiyatıyla verir:
 * özel / kademeli fiyat, bayi ve grup iskontosu uygulanmış, KDV hariç, TL. Fiyatı gizli ürünlerde fiyat alanı yoktur.
 * Stok, onay bekleyen siparişler düşülmüş miktardır; 100'den fazlası 100 yazılır. Yanıt 10 dakika önbellekte tutulur.
 */
import crypto from 'crypto';
import prisma, { basePrisma, runWithTenant } from '../utils/prisma.js';
import { API_PUBLIC_URL } from '../config.js';
import { tenantAccess } from '../middlewares/tenantMiddleware.js';
import { getSettingsMap, flag } from './settingsService.js';
import { accessFor, visibleProductWhere, reservedQuantities } from './catalogAccess.js';
import { buildPricingContext, loadSpecialPrices, effectiveProduct, unitPriceFor, variantLabelOf, VARIANT_VALUES_INCLUDE, round2 } from './pricingService.js';
import { toTRY } from './exchangeRateService.js';

const CACHE_MS = 10 * 60 * 1000;
const BATCH = 1000;
const STOCK_CAP = 100;
const cache = new Map(); // token → { at, xml }

export const newFeedToken = () => crypto.randomBytes(24).toString('hex');
export const feedUrl = (token) => `${API_PUBLIC_URL}/api/public/feed/${token}`;
export const forgetFeed = (token) => { if (token) cache.delete(token); };
export const feedEnabled = async () => flag((await getSettingsMap()).dealer_feed);

// XML'de geçersiz kontrol karakterleri atılır, özel karakterler kaçırılır
const esc = (v) => String(v ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const tag = (name, value) => (value === null || value === undefined || value === '' ? '' : `<${name}>${esc(value)}</${name}>`);
const absolute = (url) => (/^https?:\/\//i.test(url) ? url : `${API_PUBLIC_URL}${url.startsWith('/') ? '' : '/'}${url}`);
const imagesOf = (p) => { try { return (JSON.parse(p.images || '[]') || []).filter(Boolean).map(absolute); } catch { return []; } };

const categoryPaths = async () => {
  const cats = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
  const byId = new Map(cats.map((c) => [c.id, c]));
  const path = (id, seen = new Set()) => {
    const c = byId.get(id);
    if (!c || seen.has(id)) return [];
    seen.add(id);
    return [...(c.parentId ? path(c.parentId, seen) : []), c.name];
  };
  return new Map(cats.map((c) => [c.id, path(c.id).join(' > ')]));
};

const productXml = (raw, parent, ctx, categories) => {
  const p = effectiveProduct(raw, parent);
  const hidden = ctx.globalHide || p.hidePrice || toTRY(p.price, p.currency, ctx.rates) === null;
  const price = hidden ? null : unitPriceFor(p, Math.max(1, p.moq || 1), ctx);
  const list = hidden ? null : toTRY(p.price, p.currency, ctx.rates);
  const stock = Math.max(0, Math.min(STOCK_CAP, (raw.stock || 0) - (ctx.reserved.get(raw.id) || 0)));
  const images = imagesOf(p);
  return [
    '<Urun>',
    tag('Id', raw.id),
    tag('StokKodu', raw.sku),
    tag('Barkod', raw.barcode),
    tag('UrunAdi', parent ? [parent.name, variantLabelOf(raw)].filter(Boolean).join(' ') : raw.name),
    parent ? tag('AnaUrunKodu', parent.sku) + tag('Varyant', variantLabelOf(raw)) : '',
    tag('Marka', raw.brand || parent?.brand),
    tag('Kategori', categories.get((parent || raw).categoryId)),
    tag('Aciklama', raw.shortDesc || parent?.shortDesc),
    tag('Birim', p.unit),
    tag('MinSiparis', Math.max(1, p.moq || 1)),
    tag('SiparisKatsayisi', Math.max(1, p.stepQuantity || 1)),
    tag('Stok', stock),
    tag('StokDurumu', stock > 0 ? 'VAR' : 'YOK'),
    hidden ? '<FiyatGizli>true</FiyatGizli>' : [
      tag('ListeFiyati', round2(list).toFixed(2)),
      tag('BayiFiyati', price ? price.unit.toFixed(2) : null),
      tag('ParaBirimi', 'TRY')
    ].join(''),
    tag('KdvOrani', p.vatRate),
    images.length ? `<Resimler>${images.map((u) => tag('Resim', u)).join('')}</Resimler>` : '',
    '</Urun>'
  ].join('');
};

/** Bayinin gördüğü bütün ürünlerin XML'i (kiracı bağlamında çağrılır) */
const buildXml = async (company, tenant) => {
  const access = await accessFor(prisma, company);
  const ctx = await buildPricingContext(company);
  const categories = await categoryPaths();
  const parts = [`<?xml version="1.0" encoding="UTF-8"?>\n<Urunler firma="${esc(tenant.name)}" bayi="${esc(company.name)}" olusturma="${new Date().toISOString()}">`];
  let cursor = 0;
  for (;;) {
    const masters = await prisma.product.findMany({
      where: { isActive: true, parentId: null, id: { gt: cursor }, ...visibleProductWhere(access) },
      include: { variants: { where: { isActive: true }, include: VARIANT_VALUES_INCLUDE, orderBy: { id: 'asc' } } },
      orderBy: { id: 'asc' },
      take: BATCH
    });
    if (!masters.length) break;
    cursor = masters.at(-1).id;
    const ids = masters.flatMap((m) => [m.id, ...m.variants.map((v) => v.id)]);
    ctx.specialPrices = await loadSpecialPrices(prisma, company, ids);
    ctx.reserved = await reservedQuantities(prisma, ids);
    for (const m of masters) {
      // Varyantlı ürünün her varyantı ayrı satır (ana ürün kodu ve varyant etiketiyle); ana ürün satırı yazılmaz
      if (m.variants.length) for (const v of m.variants) parts.push(productXml(v, m, ctx, categories));
      else parts.push(productXml(m, null, ctx, categories));
    }
  }
  parts.push('</Urunler>\n');
  return parts.join('\n');
};

/**
 * Adresteki anahtarla beslemeyi döndürür; anahtar geçersizse, firma kapattıysa, bayi aktif değilse ya da firmanın
 * erişimi bittiyse null (hepsi aynı yanıt: anahtar denenerek bilgi çıkarılamaz).
 */
export const feedXmlForToken = async (token) => {
  if (!/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
  // Erişim her istekte denetlenir (kapatma, pasif bayi, yenilenen anahtar hemen geçerli); yalnızca XML önbellekte
  const company = await basePrisma.company.findUnique({ where: { feedToken: token } });
  if (!company || company.kind !== 'DEALER' || company.status !== 'ACTIVE') return null;
  const tenant = await basePrisma.tenant.findUnique({ where: { id: company.tenantId } });
  if (!tenantAccess(tenant).active) return null;
  return runWithTenant(tenant.id, async () => {
    if (!(await feedEnabled())) return null;
    const hit = cache.get(token);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.xml;
    const xml = await buildXml(company, tenant);
    if (cache.size > 500) cache.clear();
    cache.set(token, { at: Date.now(), xml });
    return xml;
  });
};
