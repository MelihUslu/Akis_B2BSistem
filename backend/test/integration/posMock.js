import http from 'http';

/**
 * Testler için firmanın sanal POS'u taklidi: iyzico ödeme formu (başlat / sonuç sorgula) ve PayTR token ucu.
 * iyzico isteklerinin gövdesi (iyzicoInit) ve PayTR formları (paytr) kaydedilir.
 * details: iyzico sonuç sorgusunda token → döndürülecek ödeme sonucu (testte doldurulur).
 */
export const startPosMock = () => new Promise((resolve) => {
  const iyzicoInit = [];
  const paytr = [];
  const details = {};
  let seq = 0;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (req.url === '/payment/iyzipos/checkoutform/initialize/auth/ecom') {
        if (!String(req.headers.authorization || '').startsWith('IYZWSv2 ')) return send(401, { status: 'failure', errorMessage: 'imza yok' });
        const body = JSON.parse(raw);
        iyzicoInit.push(body);
        const token = `tok-${++seq}`;
        return send(200, { status: 'success', token, checkoutFormContent: '<script></script>', paymentPageUrl: `http://iyzico.test/pay/${token}` });
      }
      if (req.url === '/payment/iyzipos/checkoutform/auth/ecom/detail') {
        const { token } = JSON.parse(raw);
        const d = details[token];
        return d ? send(200, { status: 'success', token, ...d }) : send(200, { status: 'failure', errorMessage: 'Ödeme bulunamadı' });
      }
      if (req.url === '/odeme/api/get-token') {
        const form = Object.fromEntries(new URLSearchParams(raw));
        paytr.push(form);
        return send(200, { status: 'success', token: `ptok-${++seq}` });
      }
      send(404, { status: 'failure', errorMessage: 'bilinmeyen uç' });
    });
  });
  server.listen(0, () => resolve({ server, iyzicoInit, paytr, details, url: `http://127.0.0.1:${server.address().port}` }));
});
