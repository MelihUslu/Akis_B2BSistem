import http from 'http';

/**
 * Testler için Netgsm SMS REST v2 taklidi. Gönderilen istekleri kaydeder (sent).
 * Geçerli hesap: "8501234567" / "dogru-sifre"; onaylı gönderici adı: "TESTFIRMA".
 * Yanıt kodları Netgsm'inki gibi: 00 başarılı, 30 kimlik hatası, 40 tanımsız başlık.
 */
export const startNetgsmMock = () => new Promise((resolve) => {
  const sent = [];
  let seq = 0;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      const auth = Buffer.from(String(req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString();
      if (auth !== '8501234567:dogru-sifre') return send(406, { code: '30', description: 'Invalid credentials' });
      if (req.method === 'GET' && req.url.startsWith('/sms/rest/v2/msgheader')) return send(200, { code: '00', msgheaders: ['TESTFIRMA'] });
      if (req.method === 'POST' && req.url === '/sms/rest/v2/send') {
        const body = JSON.parse(raw || '{}');
        if (body.msgheader !== 'TESTFIRMA') return send(406, { code: '40', description: 'Header not defined' });
        sent.push(body);
        return send(200, { code: '00', description: 'queued', jobid: `JOB${++seq}` });
      }
      send(404, { code: '70', description: 'Not found' });
    });
  });
  server.listen(0, () => resolve({ server, sent, url: `http://127.0.0.1:${server.address().port}` }));
});
