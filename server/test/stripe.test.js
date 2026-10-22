'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const { createStripeProvider } = require('../lib/providers/stripe');
const { createApp } = require('../lib/app');
const { validateOrder } = require('../lib/order');
const { NOW, quiet, orderBody, req, parse } = require('./helpers');

const ENV = { STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_PUBLISHABLE_KEY: 'pk_test_123', STRIPE_WEBHOOK_SECRET: 'whsec_test_123' };
const real = Stripe('sk_test_123');                          // only its offline webhook helpers are used

function fakeStripe() {
  const created = [];
  return {
    created,
    paymentIntents: { async create(params, opts) { created.push({ params, opts }); return { id: 'pi_1', client_secret: 'pi_1_secret_abc' }; } },
    webhooks: real.webhooks,
  };
}

function signed(event, secret = ENV.STRIPE_WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  return { payload, header: real.webhooks.generateTestHeaderString({ payload, secret }) };
}

const intentEvent = (type, metadata, amount = 40000) => ({ id: `evt_${type}`, type, data: { object: { id: 'pi_1', amount, amount_received: amount, metadata } } });

test('Stripe needs all three keys', () => {
  assert.throws(() => createStripeProvider({ STRIPE_SECRET_KEY: 'sk' }), /STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET/);
});

test('the browser gets the publishable key only', () => {
  const cfg = createStripeProvider(ENV, { stripe: fakeStripe() }).publicConfig();
  assert.deepEqual(cfg, { provider: 'stripe', kind: 'elements', publishableKey: 'pk_test_123', currency: 'ils' });
  assert.ok(!JSON.stringify(cfg).includes('sk_test'));
});

test('a PaymentIntent in agorot with wallets and cards enabled', async () => {
  const stripe = fakeStripe();
  const { order } = validateOrder(orderBody({ date: '2026-10-25' }), { now: NOW });
  const out = await createStripeProvider(ENV, { stripe }).createPayment(order, { idempotencyKey: 'k-400' });
  assert.deepEqual(out, { kind: 'elements', clientSecret: 'pi_1_secret_abc' });
  const { params, opts } = stripe.created[0];
  assert.equal(params.amount, 40000);
  assert.equal(params.currency, 'ils');
  assert.deepEqual(params.automatic_payment_methods, { enabled: true });
  assert.equal(params.metadata.order_id, order.id);
  assert.equal(params.metadata.items, '1xtrilece|l;2xcc-mango|s');
  assert.deepEqual(opts, { idempotencyKey: 'k-400' });
});

test('webhooks: genuine events are read, forged ones throw', async () => {
  const p = createStripeProvider(ENV, { stripe: fakeStripe() });
  const md = { order_id: 'JOY-261022-ABCDEF', total_ils: '400' };

  const ok = signed(intentEvent('payment_intent.succeeded', md));
  const paid = await p.parseWebhook(Buffer.from(ok.payload), { 'stripe-signature': ok.header });
  assert.deepEqual(paid, { status: 'paid', eventId: 'evt_payment_intent.succeeded', orderId: 'JOY-261022-ABCDEF', metadata: md, amount: 400, amountMatches: true });

  const short = signed(intentEvent('payment_intent.succeeded', md, 100));
  assert.equal((await p.parseWebhook(Buffer.from(short.payload), { 'stripe-signature': short.header })).amountMatches, false);

  const failed = signed(intentEvent('payment_intent.payment_failed', md));
  assert.equal((await p.parseWebhook(Buffer.from(failed.payload), { 'stripe-signature': failed.header })).status, 'failed');

  const other = signed({ id: 'evt_x', type: 'charge.updated', data: { object: {} } });
  assert.equal((await p.parseWebhook(Buffer.from(other.payload), { 'stripe-signature': other.header })).status, 'ignored');

  const forged = signed(intentEvent('payment_intent.succeeded', md), 'whsec_someone_else');
  await assert.rejects(p.parseWebhook(Buffer.from(forged.payload), { 'stripe-signature': forged.header }));
  await assert.rejects(p.parseWebhook(Buffer.from(ok.payload.replace('400', '1')), { 'stripe-signature': ok.header }), 'altered body');
  await assert.rejects(p.parseWebhook(Buffer.from(ok.payload), {}), 'no signature');
});

test('end to end: order → PaymentIntent → signed webhook → shop notified', async () => {
  const stripe = fakeStripe();
  const notes = [];
  const app = createApp(ENV, { log: quiet, provider: createStripeProvider(ENV, { stripe }), notify: async e => notes.push(e) });
  const created = parse(await app(req('POST', '/api/orders', { body: orderBody({ idempotencyKey: 'attempt_0001' }) })));
  assert.equal(created.kind, 'elements');
  const { params } = stripe.created[0];

  const hook = signed(intentEvent('payment_intent.succeeded', params.metadata, params.amount));
  const res = await app(req('POST', '/api/payments/webhook', { raw: hook.payload, headers: { 'stripe-signature': hook.header } }));
  assert.equal(res.status, 200);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].orderId, created.orderId);
  assert.equal(notes[0].amountMatches, true);

  const bad = await app(req('POST', '/api/payments/webhook', { raw: hook.payload, headers: { 'stripe-signature': 't=1,v1=00' } }));
  assert.equal(bad.status, 400);
});
