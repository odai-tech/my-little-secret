'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { toNodeHandler } = require('../node');

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

test('Node adapter passes the exact body, client IP and public host to the app', async t => {
  let seen;
  const server = http.createServer(toNodeHandler(async r => { seen = r; return { status: 201, headers: { 'content-type': 'text/plain' }, body: 'ok' }; }));
  const base = await listen(server);
  t.after(() => server.close());
  const res = await fetch(`${base}/api/orders?x=1`, { method: 'POST', body: '{"a": 1 }', headers: { 'x-forwarded-for': '5.6.7.8, 10.0.0.1', 'x-forwarded-host': 'joy.example', 'x-forwarded-proto': 'https' } });
  assert.equal(res.status, 201);
  assert.equal(seen.rawBody.toString(), '{"a": 1 }');
  assert.deepEqual([seen.method, seen.path, seen.query.x, seen.ip, seen.host, seen.proto], ['POST', '/api/orders', '1', '5.6.7.8', 'joy.example', 'https']);
  const big = await fetch(`${base}/api/orders`, { method: 'POST', body: 'x'.repeat(70 * 1024) });
  assert.equal(big.status, 413);
});

test('the dev server serves the site and API but never private files', async t => {
  delete process.env.PAYMENT_PROVIDER;
  const { server } = require('../dev-server');
  const base = await listen(server);
  t.after(() => server.close());
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/assets/js/catalog.js`)).status, 200);
  assert.equal((await (await fetch(`${base}/api/health`)).json()).ok, true);
  for (const p of ['/.env', '/package.json', '/server/lib/app.js', '/node_modules/stripe/package.json', '/assets/../server/lib/app.js', '/%2e%2e/package.json', '/.git/config']) {
    assert.equal((await fetch(`${base}${p}`)).status, 404, p);
  }
  assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
});
