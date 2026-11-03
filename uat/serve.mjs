// Derlenmiş frontend'i sunar (canlıdaki gibi: bilinmeyen yollar index.html'e düşer). Playwright başlatır.
import http from 'http';
import fs from 'fs';
import path from 'path';

const [dir = '.data/web', port = '5174'] = process.argv.slice(2);
const root = path.resolve(dir);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(root, url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(Number(port), () => console.log(`UAT frontend: http://uat.localhost:${port}`));
