import http from 'http';

/**
 * Testler için Meta WhatsApp Cloud API (Graph) taklidi. Gönderilen mesajları kaydeder (sent).
 * Geçerli erişim anahtarı: "good-token".
 */
export const startWhatsappMock = () => new Promise((resolve) => {
  const sent = [];
  let seq = 0;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (req.headers.authorization !== 'Bearer good-token') return send(401, { error: { code: 190, message: 'Invalid OAuth access token' } });
      const url = new URL(req.url, 'http://x');
      if (req.method === 'GET') return send(200, { display_phone_number: '+90 555 000 00 00', verified_name: 'Test Firma', id: url.pathname.slice(1) });
      const body = JSON.parse(raw || '{}');
      if (body.status === 'read') return send(200, { success: true });
      sent.push(body);
      send(200, { messaging_product: 'whatsapp', messages: [{ id: `wamid.OUT${++seq}` }] });
    });
  });
  server.listen(0, () => resolve({ server, sent, url: `http://127.0.0.1:${server.address().port}` }));
});
