'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../lib/app');
const { createMockProvider } = require('../lib/providers/mock');
const { quiet, orderBody, req, parse } = require('./helpers');

const ENV = { PAYMENT_PROVIDER: 'mock', MOCK_SECRET: 'test-secret', SITE_URL: 'https://joy.example/' };

async function start(notes) {
  const app = createApp(ENV, { log: quiet, notify: async e => notes.push(e) });
  const created = parse(await app(req('POST', '/api/orders', { body: orderBody() })));
  const url = new URL(created.url);
  return { app, created, token: url.searchParams.get('t'), url };
}

test('mock provider is refused in production', () => {
  assert.throws(() => createMockProvider({ NODE_ENV: 'production' }), /disabled in production/);
  assert.throws(() => createMockProvider({ VERCEL_ENV: 'production' }), /disabled in production/);
  const app = createApp({ PAYMENT_PROVIDER: 'mock', NODE_ENV: 'production' }, { log: quiet });
  return app(req('GET', '/api/config')).then(res => assert.equal(parse(res).payments, null));
});

test('checkout → test payment page → paid → back to the site', async () => {
  const notes = [];
  const { app, created, token, url } = await start(notes);
  assert.equal(created.kind, 'redirect');
  assert.equal(url.origin + url.pathname, 'https://shop.test/api/pay/mock/');

  const page = await app(req('GET', '/api/pay/mock/', { query: { t: token } }));
  assert.equal(page.status, 200);
  assert.match(page.body, /TEST PAYMENT · NO MONEY IS TAKEN/);
  assert.match(page.body, /₪400/);
  assert.match(page.body, new RegExp(created.orderId));

  const done = await app(req('POST', '/api/pay/mock/complete', { raw: new URLSearchParams({ t: token, action: 'pay' }).toString() }));
  assert.equal(done.status, 303);
  assert.equal(done.headers.location, `https://joy.example/?paid=${created.orderId}#order`);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].metadata.total_ils, '400');
  assert.equal(notes[0].orderId, created.orderId);

  await app(req('POST', '/api/pay/mock/complete', { raw: new URLSearchParams({ t: token, action: 'pay' }).toString() }));
  assert.equal(notes.length, 1, 'paying the same test link twice announces once');
});

test('cancel goes back to the checkout; tampered links are refused', async () => {
  const notes = [];
  const { app, token } = await start(notes);
  const cancel = await app(req('POST', '/api/pay/mock/complete', { raw: new URLSearchParams({ t: token, action: 'cancel' }).toString() }));
  assert.equal(cancel.headers.location, 'https://joy.example/?canceled=1#order');
  assert.equal(notes.length, 0);
  assert.equal((await app(req('GET', '/api/pay/mock/', { query: { t: token.slice(0, -2) } }))).status, 400);
  assert.equal((await app(req('POST', '/api/pay/mock/complete', { raw: 't=abc.def&action=pay' }))).status, 400);
  assert.equal(notes.length, 0);
});

test('order text on the test page is escaped', async () => {
  const app = createApp(ENV, { log: quiet, notify: async () => {} });
  const created = parse(await app(req('POST', '/api/orders', { body: orderBody({ name: '<script>x</script>' }) })));
  const t = new URL(created.url).searchParams.get('t');
  const page = await app(req('GET', '/api/pay/mock/', { query: { t } }));
  assert.ok(!page.body.includes('<script>x'));
});
