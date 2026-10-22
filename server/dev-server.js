'use strict';
/* `npm start`: serves the website and the order/payment API together, on any Node host
   (Render, Railway, Fly.io, a VPS) or locally. Settings come from the environment or a
   .env file next to package.json. Only the public site files are served: never .env,
   server code or node_modules. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createApp } = require('./lib/app');
const { toNodeHandler } = require('./node');

const ROOT = path.resolve(__dirname, '..');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
loadDotEnv(path.join(ROOT, '.env'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '': 'application/octet-stream',
};
const PUBLIC = [/^\/index\.html$/, /^\/assets\/[\w\-./@]+$/, /^\/\.well-known\/[\w\-.]+$/];

const api = toNodeHandler(createApp(process.env));

function serveStatic(req, res) {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch (e) { p = ''; }
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!PUBLIC.some(rx => rx.test(p)) || p.includes('..') || !file.startsWith(ROOT + path.sep)) { res.writeHead(404); res.end('Not found'); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': TYPES[ext] || TYPES[''],
      'cache-control': p.startsWith('/assets/img/') ? 'public, max-age=604800' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return api(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  serveStatic(req, res);
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, () => console.log(`[joy] http://localhost:${port}  (payments: ${process.env.PAYMENT_PROVIDER || 'none'})`));
}

module.exports = { server };
