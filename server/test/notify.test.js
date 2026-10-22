'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { notifyPaid } = require('../lib/notify');
const { quiet } = require('./helpers');

const event = { status: 'paid', orderId: 'JOY-261022-ABCDEF', amount: 400, amountMatches: true,
  metadata: { order_id: 'JOY-261022-ABCDEF', items: '1xtrilece|l;2xcc-mango|s', total_ils: '400', method: 'pickup', date: '2026-10-25', name: 'Noa', phone: '050-1234567' } };

function stubFetch(t, status = 200) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: status < 300, status }; });
  return calls;
}

test('webhook and email channels receive a readable order', async t => {
  const calls = stubFetch(t);
  await notifyPaid({ NOTIFY_WEBHOOK_URL: 'https://hooks.example/joy', RESEND_API_KEY: 're_123', NOTIFY_EMAIL: 'a@x.test, b@x.test' }, event, quiet);
  assert.equal(calls.length, 2);
  const hook = calls.find(c => c.url === 'https://hooks.example/joy');
  assert.equal(hook.body.event, 'order.paid');
  assert.match(hook.body.text, /1 × Trileçe \(Big\) · ₪200/);
  assert.match(hook.body.text, /Pickup on 2026-10-25/);
  const mail = calls.find(c => c.url === 'https://api.resend.com/emails');
  assert.equal(mail.init.headers.authorization, 'Bearer re_123');
  assert.deepEqual(mail.body.to, ['a@x.test', 'b@x.test']);
  assert.match(mail.body.subject, /JOY-261022-ABCDEF · ₪400/);
});

test('a failing channel throws (so the provider retries); a wrong amount is flagged', async t => {
  stubFetch(t, 502);
  await assert.rejects(notifyPaid({ NOTIFY_WEBHOOK_URL: 'https://hooks.example/joy' }, event, quiet), /502/);
  t.mock.restoreAll();
  const calls = stubFetch(t);
  await notifyPaid({ NOTIFY_WEBHOOK_URL: 'https://hooks.example/joy' }, { ...event, amount: 1, amountMatches: false }, quiet);
  assert.match(calls[0].body.text, /differs from the order total/);
});

test('with no channels configured the order is still logged', async t => {
  const calls = stubFetch(t);
  const lines = [];
  await notifyPaid({}, event, { ...quiet, info: m => lines.push(m) });
  assert.equal(calls.length, 0);
  assert.match(lines[0], /PAID JOY-261022-ABCDEF ₪400/);
});
