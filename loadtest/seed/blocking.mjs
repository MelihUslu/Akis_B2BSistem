// Olay döngüsü tıkanması ölçümü: ağır istek sürerken backend'e 25 ms'de bir hafif istek (/health) gider; en uzun bekleme,
// ağır işin bir işçi süreci ne kadar kilitlediğini gösterir. Yük testi backend'inin içinde çalışır:
//   docker exec -w /app akis_loadtest_backend node /loadtest/seed/blocking.mjs [/uç ...]   (varsayılan: ağır uçların hepsi)
import fs from 'fs';
import http from 'http';
// Her kontrol isteği yeni bağlantıyla gider: cluster bağlantıları işçilere dağıttığı için tıkanan işçi de ölçülür
const ping = () => new Promise((ok) => { const r = http.get({ host: 'localhost', port: 5001, path: '/health', agent: false }, (res) => { res.resume(); res.on('end', ok); }); r.on('error', ok); });
const BASE = 'http://localhost:5001/api';
const { admins, companies } = JSON.parse(fs.readFileSync('/loadtest/.data/tokens.json', 'utf8'));
const H = { 'X-Tenant': 'yuktest', Authorization: `Bearer ${admins[0]}` };
const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const paths = process.argv.slice(2).length ? process.argv.slice(2) : [`/reports/sales?from=${d(365)}&to=${d(0)}`, `/reports/sales/export?from=${d(365)}&to=${d(0)}`, '/orders/export', '/finance/aging', '/partners/export', `/finance/statement/${companies[0]}/export`, '/account/export'];
for (const p of paths) {
  let done = false;
  const lat = [];
  const pinger = (async () => {
    while (!done) {
      const t = performance.now();
      await ping();
      lat.push(performance.now() - t);
      await new Promise((r) => setTimeout(r, 25));
    }
  })();
  const t0 = performance.now();
  const res = await fetch(BASE + p, { headers: H });
  await res.arrayBuffer();
  const ms = performance.now() - t0;
  done = true; await pinger;
  lat.sort((a, b) => a - b);
  const q = (x) => lat[Math.min(lat.length - 1, Math.floor(x * lat.length))];
  console.log(`${p.split('?')[0].padEnd(34)} ${res.status} ${String(Math.round(ms)).padStart(6)} ms · hafif istek: ortanca ${q(0.5).toFixed(0)} ms, %99 ${q(0.99).toFixed(0)} ms, en uzun ${lat[lat.length - 1].toFixed(0)} ms (${lat.length} ölçüm)`);
}
