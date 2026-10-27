import { trackExternal } from '../monitoring.js';
/**
 * Paraşüt API v4 istemcisi (https://apidocs.parasut.com).
 * Akış: OAuth (password grant) → cari bul/oluştur → ürün bul/oluştur → satış faturası →
 * alıcı e-fatura mükellefiyse e-fatura, değilse e-arşiv → kuyruktaki işin bitmesini bekle.
 *
 * creds: { clientId, clientSecret, username, password, companyId }
 */
const BASE = process.env.PARASUT_API_URL || 'https://api.parasut.com';
const tokens = new Map(); // `${clientId}:${username}` -> { token, expiresAt }

export class ParasutError extends Error {}

const getToken = async (creds) => {
  const key = `${creds.clientId}:${creds.username}`;
  const hit = tokens.get(key);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
  return trackExternal('Paraşüt', 'oauth/token', () => fetchToken(creds, key));
};

const fetchToken = async (creds, key) => {
  const res = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password', client_id: creds.clientId, client_secret: creds.clientSecret,
      username: creds.username, password: creds.password, redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'
    }),
    signal: AbortSignal.timeout(15_000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new ParasutError(`Paraşüt girişi başarısız: ${data.error_description || data.error || `HTTP ${res.status}`}`);
  tokens.set(key, { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 7200) * 1000 });
  return data.access_token;
};

const errorText = (data, status) =>
  (Array.isArray(data?.errors) ? data.errors.map((e) => e.detail || e.title).filter(Boolean).join(' · ') : '') || `HTTP ${status}`;

const request = async (creds, path, opts = {}) => {
  const token = await getToken(creds);
  return trackExternal('Paraşüt', `${opts.method || 'GET'} ${path.split('?')[0].replace(/\/\d+/g, '/:id')}`, () => requestRaw(creds, token, path, opts));
};

const requestRaw = async (creds, token, path, { method = 'GET', body, company = true } = {}) => {
  const url = `${BASE}/v4${company ? `/${creds.companyId}` : ''}${path}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ParasutError(`Paraşüt: ${errorText(data, res.status)}`);
  return data;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Kuyruktaki e-belge işi bitene kadar bekler (en fazla ~60 sn)
const waitForJob = async (creds, jobId) => {
  for (let i = 0; i < 20; i++) {
    const { data } = await request(creds, `/trackable_jobs/${jobId}`);
    const status = data?.attributes?.status;
    if (status === 'done') return;
    if (status === 'error') throw new ParasutError(`Paraşüt e-belge hatası: ${(data.attributes.errors || []).join(' · ') || 'bilinmeyen hata'}`);
    await sleep(3000);
  }
  throw new ParasutError('Paraşüt e-belge işlemi zaman aşımına uğradı; birkaç dakika sonra durumu yenileyin.');
};

/** Anahtarları doğrular ve kullanıcının erişebildiği şirketleri döndürür */
export const testConnection = async (creds) => {
  const data = await request(creds, '/me?include=companies', { company: false });
  return (data.included || []).filter((x) => x.type === 'companies').map((c) => ({ id: c.id, name: c.attributes?.name }));
};

const findOrCreateContact = async (creds, buyer) => {
  if (buyer.taxNumber) {
    const found = await request(creds, `/contacts?filter[tax_number]=${encodeURIComponent(buyer.taxNumber)}&page[size]=1`);
    if (found.data?.[0]) return found.data[0].id;
  }
  const created = await request(creds, '/contacts', {
    method: 'POST',
    body: {
      data: {
        type: 'contacts',
        attributes: {
          name: buyer.name, email: buyer.email || undefined, tax_number: buyer.taxNumber || undefined, tax_office: buyer.taxOffice || undefined,
          address: buyer.address || undefined, phone: buyer.phone || undefined,
          contact_type: String(buyer.taxNumber || '').length === 11 ? 'person' : 'company', account_type: 'customer'
        }
      }
    }
  });
  return created.data.id;
};

const productCache = new Map(); // `${companyId}:${code}` -> id
const findOrCreateProduct = async (creds, line) => {
  const key = `${creds.companyId}:${line.code}`;
  if (productCache.has(key)) return productCache.get(key);
  const found = await request(creds, `/products?filter[code]=${encodeURIComponent(line.code)}&page[size]=1`);
  let id = found.data?.[0]?.id;
  if (!id) {
    const created = await request(creds, '/products', {
      method: 'POST',
      body: { data: { type: 'products', attributes: { name: line.name, code: line.code, vat_rate: line.vatRate, unit: line.unit || 'Adet', list_price: line.unitPrice, currency: 'TRL' } } }
    });
    id = created.data.id;
  }
  productCache.set(key, id);
  return id;
};

/**
 * Faturayı keser ve e-belge olarak gönderir.
 * invoice: { buyer: { name, taxNumber, taxOffice, address, email, phone }, lines: [{ code, name, quantity, unitPrice, vatRate, unit }],
 *            discount (TL, KDV hariç), description, issueDate (YYYY-MM-DD), dueDays }
 * → { externalId, number, documentType }
 */
export const issueInvoice = async (creds, invoice) => {
  const contactId = await findOrCreateContact(creds, invoice.buyer);
  const details = [];
  for (const line of invoice.lines) {
    const productId = await findOrCreateProduct(creds, line);
    details.push({
      type: 'sales_invoice_details',
      attributes: { quantity: line.quantity, unit_price: line.unitPrice, vat_rate: line.vatRate, description: line.name },
      relationships: { product: { data: { id: productId, type: 'products' } } }
    });
  }
  const issueDate = invoice.issueDate || new Date().toLocaleDateString('sv-SE');
  const due = new Date(Date.now() + (invoice.dueDays || 0) * 86400000).toLocaleDateString('sv-SE');
  const created = await request(creds, '/sales_invoices', {
    method: 'POST',
    body: {
      data: {
        type: 'sales_invoices',
        attributes: {
          item_type: 'invoice', description: invoice.description, issue_date: issueDate, due_date: due, currency: 'TRL',
          ...(invoice.discount > 0 && { invoice_discount_type: 'amount', invoice_discount: invoice.discount })
        },
        relationships: { contact: { data: { id: contactId, type: 'contacts' } }, details: { data: details } }
      }
    }
  });
  const salesInvoiceId = created.data.id;

  // Alıcı e-fatura mükellefi mi? (GİB kayıtlı kullanıcı listesi)
  let documentType = 'E_ARSIV';
  let job;
  const inboxes = invoice.buyer.taxNumber
    ? await request(creds, `/e_invoice_inboxes?filter[vkn]=${encodeURIComponent(invoice.buyer.taxNumber)}`)
    : { data: [] };
  if (inboxes.data?.length) {
    documentType = 'E_FATURA';
    job = await request(creds, '/e_invoices', {
      method: 'POST',
      body: {
        data: {
          type: 'e_invoices',
          attributes: { scenario: 'basic', to: inboxes.data[0].attributes.e_invoice_address },
          relationships: { invoice: { data: { id: salesInvoiceId, type: 'sales_invoices' } } }
        }
      }
    });
  } else {
    job = await request(creds, '/e_archives', {
      method: 'POST',
      body: { data: { type: 'e_archives', attributes: {}, relationships: { sales_invoice: { data: { id: salesInvoiceId, type: 'sales_invoices' } } } } }
    });
  }
  if (job?.data?.type === 'trackable_jobs') await waitForJob(creds, job.data.id);

  const full = await request(creds, `/sales_invoices/${salesInvoiceId}?include=active_e_document`);
  const eDoc = (full.included || []).find((x) => x.type === 'e_invoices' || x.type === 'e_archives');
  return {
    externalId: salesInvoiceId,
    number: eDoc?.attributes?.invoice_number || full.data?.attributes?.invoice_no || null,
    documentType
  };
};

/** E-belge PDF bağlantısı (Paraşüt geçici bir adres verir) */
export const invoicePdfUrl = async (creds, salesInvoiceId) => {
  const full = await request(creds, `/sales_invoices/${salesInvoiceId}?include=active_e_document`);
  const eDoc = (full.included || []).find((x) => x.type === 'e_invoices' || x.type === 'e_archives');
  if (!eDoc) throw new ParasutError('Faturanın e-belgesi henüz oluşmadı.');
  const pdf = await request(creds, `/${eDoc.type}/${eDoc.id}/pdf`);
  const url = pdf.data?.attributes?.url;
  if (!url) throw new ParasutError('PDF henüz hazır değil, biraz sonra tekrar deneyin.');
  return url;
};
