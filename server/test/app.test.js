'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../lib/app');
const { quiet, orderBody, req, parse } = require('./helpers');

function fakeProvider(over = {}) {
  const calls = [];
  return {
    calls,
    name: 'fake',
    publicConfig: () => ({ provider: 'fake', kind: 'elements', publishableKey: 'pk_public' }),
    async createPayment(order, ctx) { calls.push({ order, ctx }); return { kind: 'elements', clientSecret: `cs_${order.id}` }; },
    async parseWebhook(raw) {
      const e = JSON.parse(raw.toString());
      if (e.sig !== 'good') throw new Error('bad signature');
      return e.event;
    },
    ...over,
  };
}

const appWith = (env = {}, deps = {}) => createApp(env, { log: quiet, ...deps });

test('without a payment provider the site is told to use pay-later', async () => {
  const app = appWith({}, {});
  const cfg = parse(await app(req('GET', '/api/config')));
  assert.deepEqual(cfg, { payments: null, payLater: true, currency: 'ILS', minNoticeDays: 2 });
  assert.equal((await app(req('POST', '/api/orders', { body: orderBody() }))).status, 503);
  assert.equal((await app(req('POST', '/api/payments/webhook', { raw: '{}' }))).status, 404);
  assert.deepEqual(parse(await app(req('GET', '/api/health'))), { ok: true, payments: null });
  assert.equal(parse(await app(req('GET', '/api/config'))).payLater, true);
  assert.equal(parse(await appWith({ PAY_LATER: 'false' })(req('GET', '/api/config'))).payLater, false);
});

test('a misconfigured provider turns payments off instead of breaking the API', async () => {
  const errors = [];
  const app = createApp({ PAYMENT_PROVIDER: 'stripe' }, { log: { ...quiet, error: m => errors.push(m) } });
  assert.equal(parse(await app(req('GET', '/api/config'))).payments, null);
  assert.deepEqual(parse(await app(req('GET', '/api/health'))), { ok: true, payments: null, problem: 'payment_setup' });
  assert.match(errors[0], /Stripe is missing: STRIPE_SECRET_KEY/);
  const unknown = createApp({ PAYMENT_PROVIDER: 'paypal' }, { log: quiet });
  assert.equal(parse(await unknown(req('GET', '/api/config'))).payments, null);
});

test('a provider that is not ready yet is not offered', async () => {
  const app = appWith({}, { provider: fakeProvider({ ready: false }) });
  assert.equal(parse(await app(req('GET', '/api/config'))).payments, null);
  assert.equal((await app(req('POST', '/api/orders', { body: orderBody() }))).status, 503);
});

test('config exposes only public settings', async () => {
  const app = appWith({}, { provider: fakeProvider() });
  const res = await app(req('GET', '/api/config'));
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(parse(res).payments, { provider: 'fake', kind: 'elements', publishableKey: 'pk_public' });
});

test('POST /orders prices the order on the server and starts the payment', async () => {
  const provider = fakeProvider();
  const app = appWith({ SITE_URL: 'https://joy.example/' }, { provider });
  const body = orderBody({ items: [{ id: 'trilece', size: 'l', qty: 1, price: 0 }, { id: 'cc-mango', size: 's', qty: 2 }], total: 1, idempotencyKey: 'try_ABCdef123' });
  const res = await app(req('POST', '/api/orders', { body }));
  assert.equal(res.status, 201);
  const out = parse(res);
  assert.match(out.orderId, /^JOY-\d{6}-[0-9A-F]{6}$/);
  assert.equal(out.total, 400);
  assert.equal(out.currency, 'ILS');
  assert.equal(out.kind, 'elements');
  assert.equal(out.clientSecret, `cs_${out.orderId}`);

  const { order, ctx } = provider.calls[0];
  assert.equal(order.total, 400);
  assert.equal(ctx.idempotencyKey, 'try_ABCdef123-400');
  assert.equal(ctx.successUrl(order.id), `https://joy.example/?paid=${order.id}#order`);
  assert.equal(ctx.cancelUrl, 'https://joy.example/?canceled=1#order');
  assert.equal(ctx.webhookUrl, 'https://shop.test/api/payments/webhook');

  const again = parse(await app(req('POST', '/api/orders', { body })));
  assert.equal(again.orderId, out.orderId, 'a retried attempt keeps its order id');
});

test('without SITE_URL the links point back to the host that was called', async () => {
  const provider = fakeProvider();
  await appWith({}, { provider })(req('POST', '/api/orders', { body: orderBody() }));
  const { ctx } = provider.calls[0];
  assert.equal(ctx.siteUrl, 'https://shop.test/');
  assert.equal(ctx.apiUrl, 'https://shop.test/api');
  assert.equal(ctx.idempotencyKey, null);
});

test('POST /orders rejects bad input with the fields to fix', async () => {
  const app = appWith({}, { provider: fakeProvider() });
  const bad = await app(req('POST', '/api/orders', { body: orderBody({ date: '2020-01-01', phone: '' }) }));
  assert.equal(bad.status, 422);
  assert.deepEqual(parse(bad), { error: 'invalid', fields: ['date', 'phone'] });
  const junk = await app(req('POST', '/api/orders', { raw: '{nope' }));
  assert.deepEqual([junk.status, parse(junk).error], [400, 'bad_json']);
  const weirdKey = await app(req('POST', '/api/orders', { body: orderBody({ idempotencyKey: 'x y' }) }));
  assert.equal(weirdKey.status, 201);
});

test('POST /orders is rate limited per visitor', async () => {
  const app = appWith({ RATE_LIMIT_PER_10MIN: '2' }, { provider: fakeProvider() });
  const send = ip => app(req('POST', '/api/orders', { body: orderBody(), ip }));
  assert.equal((await send('9.9.9.9')).status, 201);
  assert.equal((await send('9.9.9.9')).status, 201);
  assert.equal((await send('9.9.9.9')).status, 429);
  assert.equal((await send('8.8.8.8')).status, 201);
});

test('provider failures become a plain 500 without details', async () => {
  const errors = [];
  const provider = fakeProvider({ async createPayment() { throw new Error('secret upstream detail'); } });
  const app = createApp({}, { provider, log: { ...quiet, error: m => errors.push(m) } });
  const res = await app(req('POST', '/api/orders', { body: orderBody() }));
  assert.equal(res.status, 500);
  assert.equal(res.body, JSON.stringify({ error: 'server_error' }));
  assert.match(errors[0], /secret upstream detail/);
});

test('CORS only for the allowed origins', async () => {
  const app = appWith({ ALLOWED_ORIGINS: 'https://odai-tech.github.io, https://joy.example' }, { provider: fakeProvider() });
  const ok = await app(req('GET', '/api/config', { headers: { origin: 'https://odai-tech.github.io' } }));
  assert.equal(ok.headers['access-control-allow-origin'], 'https://odai-tech.github.io');
  const other = await app(req('GET', '/api/config', { headers: { origin: 'https://evil.example' } }));
  assert.equal(other.headers['access-control-allow-origin'], undefined);
  const pre = await app(req('OPTIONS', '/api/orders', { headers: { origin: 'https://joy.example' } }));
  assert.equal(pre.status, 204);
  assert.match(pre.headers['access-control-allow-methods'], /POST/);
});

test('webhooks: signature checked, paid orders announced once, failures retried', async () => {
  const seen = [];
  let fail = true;
  const notify = async e => { if (fail) { fail = false; throw new Error('mail down'); } seen.push(e); };
  const app = appWith({}, { provider: fakeProvider(), notify });
  const hook = (sig, event) => app(req('POST', '/api/payments/webhook', { raw: JSON.stringify({ sig, event }) }));
  const paid = { status: 'paid', eventId: 'evt_1', orderId: 'JOY-1', metadata: {}, amount: 400, amountMatches: true };

  assert.equal((await hook('forged', paid)).status, 400);
  assert.equal(seen.length, 0);
  assert.equal((await hook('good', paid)).status, 500, 'a failed notification asks the provider to retry');
  assert.equal((await hook('good', paid)).status, 200);
  assert.equal((await hook('good', paid)).status, 200);
  assert.equal(seen.length, 1, 'a re-delivered event is not announced twice');
  assert.equal((await hook('good', { status: 'failed', eventId: 'evt_2', orderId: 'JOY-2' })).status, 200);
  assert.equal((await hook('good', { status: 'ignored', eventId: 'evt_3' })).status, 200);
  assert.equal(seen.length, 1);
});

test('unknown routes are 404', async () => {
  const app = appWith({}, { provider: fakeProvider() });
  assert.equal((await app(req('GET', '/api/nope'))).status, 404);
  assert.equal((await app(req('GET', '/api/orders'))).status, 404);
});
