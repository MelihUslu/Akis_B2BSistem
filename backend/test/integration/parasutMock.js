import http from 'http';

/**
 * Testler için Paraşüt API v4 taklidi. Gelen istekleri kaydeder (calls) ve
 * e-fatura mükellefi olarak verilen VKN'lere e-fatura, diğerlerine e-arşiv döndürür.
 */
export const startParasutMock = ({ eInvoiceVkns = [] } = {}) => new Promise((resolve) => {
  const calls = [];
  let seq = 100;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const body = raw && req.headers['content-type']?.includes('json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
      calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
      const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      const p = url.pathname;
      if (p === '/oauth/token') return body.password === 'dogru' ? send(200, { access_token: 'tok', expires_in: 7200 }) : send(401, { error: 'invalid_grant', error_description: 'Kullanıcı adı veya şifre hatalı' });
      if (req.headers.authorization !== 'Bearer tok') return send(401, { errors: [{ detail: 'yetkisiz' }] });
      if (p === '/v4/me') return send(200, { data: { id: '1' }, included: [{ type: 'companies', id: '555', attributes: { name: 'Test Ltd' } }] });
      if (p.endsWith('/contacts') && req.method === 'GET') return send(200, { data: [] });
      if (p.endsWith('/contacts')) return send(201, { data: { id: String(++seq), type: 'contacts' } });
      if (p.endsWith('/products') && req.method === 'GET') return send(200, { data: [] });
      if (p.endsWith('/products')) return send(201, { data: { id: String(++seq), type: 'products' } });
      if (p.endsWith('/sales_invoices') && req.method === 'POST') return send(201, { data: { id: '9001', type: 'sales_invoices' } });
      if (p.endsWith('/e_invoice_inboxes')) {
        return send(200, { data: eInvoiceVkns.includes(url.searchParams.get('filter[vkn]')) ? [{ attributes: { e_invoice_address: 'urn:mail:defaultpk@x' } }] : [] });
      }
      if (p.endsWith('/e_invoices') || p.endsWith('/e_archives')) return send(202, { data: { id: 'job1', type: 'trackable_jobs' } });
      if (p.endsWith('/trackable_jobs/job1')) return send(200, { data: { attributes: { status: 'done' } } });
      if (p.endsWith('/sales_invoices/9001')) return send(200, { data: { id: '9001', attributes: { invoice_no: 'TST' } }, included: [{ type: 'e_invoices', id: '77', attributes: { invoice_number: 'GIB2026000000123' } }] });
      if (p.endsWith('/e_invoices/77/pdf')) return send(200, { data: { attributes: { url: 'https://pdf.example/77.pdf' } } });
      return send(404, { errors: [{ detail: `taklitte yok: ${req.method} ${p}` }] });
    });
  });
  server.listen(0, '127.0.0.1', () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}` }));
});
