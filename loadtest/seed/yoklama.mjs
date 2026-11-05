// Uzun süre testinde yoklama (uzun.sh 5 dk'da bir çalıştırır; yük testi backend'inin içinde):
// aynı istekleri sırayla atar (yükten bağımsız sabit ölçü) ve işçi süreçlerin belleğini okur. Tek satır CSV yazar:
//   katalog_ms,siparisler_ms,panel_ms,isci_rss_mb_toplam,isci_rss_mb_en_cok,isci_sayisi
import fs from 'fs';

const { admins, dealers } = JSON.parse(fs.readFileSync('/loadtest/.data/tokens.json', 'utf8'));
const B = 'http://localhost:5001/api';
const h = (t) => ({ 'X-Tenant': process.env.TENANT || 'yuktest', Authorization: `Bearer ${t}` });
const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
const time = async (path, token, n = 10) => {
  const ms = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    const r = await fetch(B + path, { headers: h(token) }).catch(() => null);
    if (r) await r.arrayBuffer();
    ms.push(r?.ok ? performance.now() - t : 60000);
  }
  return Math.round(median(ms));
};

const rss = fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p)).map((p) => {
  try {
    if (!fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').includes('src/server.js')) return null;
    const ppid = Number(fs.readFileSync(`/proc/${p}/stat`, 'utf8').split(') ')[1].split(' ')[1]);
    const kb = Number(/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${p}/status`, 'utf8'))[1]);
    return { pid: Number(p), ppid, mb: Math.round(kb / 1024) };
  } catch { return null; }
}).filter(Boolean);
const pids = new Set(rss.map((r) => r.pid));
const workers = rss.filter((r) => pids.has(r.ppid)); // ebeveyni de server.js olanlar

const row = [
  await time('/products?page=1&limit=24&sort=default', dealers[3]),
  await time('/orders?page=1&limit=20', admins[3]),
  await time('/dashboard', admins[4]),
  workers.reduce((t, w) => t + w.mb, 0),
  Math.max(0, ...workers.map((w) => w.mb)),
  workers.length
];
console.log(row.join(','));
