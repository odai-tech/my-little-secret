'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateOrder, summarize, toMetadata, describeMetadata, israelDate } = require('../lib/order');
const { NOW } = require('./helpers');

const body = (over = {}) => ({
  items: [{ id: 'trilece', size: 'l', qty: 1 }, { id: 'cc-mango', size: 's', qty: 2 }],
  method: 'delivery', address: 'Hanassi Ave 10, Haifa', date: '2026-10-25',
  name: 'Noa', phone: '050-123-4567', lang: 'he', ...over,
});

test('prices come from the catalog: Big ₪200, Small ₪100', () => {
  const r = validateOrder(body({ items: [{ id: 'trilece', size: 'l', qty: 1, price: 1 }, { id: 'cc-mango', size: 's', qty: 2, unit: 0 }], total: 3 }), { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.order.total, 400);
  assert.deepEqual(r.order.items.map(l => [l.id, l.size, l.qty, l.unit, l.subtotal]), [['trilece', 'l', 1, 200, 200], ['cc-mango', 's', 2, 100, 200]]);
  assert.equal(r.order.currency, 'ILS');
  assert.equal(r.order.lang, 'he');
});

test('the same dessert and size added twice becomes one line', () => {
  const r = validateOrder(body({ items: [{ id: 'balls', size: 's', qty: 2 }, { id: 'balls', size: 's', qty: 3 }, { id: 'balls', size: 'l', qty: 1 }] }), { now: NOW });
  assert.deepEqual(r.order.items.map(l => `${l.qty}x${l.id}|${l.size}`), ['5xballs|s', '1xballs|l']);
  assert.equal(r.order.total, 700);
});

test('bad items are rejected', () => {
  for (const items of [[], 'trilece', [{ id: 'nope', size: 'l', qty: 1 }], [{ id: 'trilece', size: 'xl', qty: 1 }],
    [{ id: 'trilece', size: 'l', qty: 0 }], [{ id: 'trilece', size: 'l', qty: 1.5 }], [{ id: 'trilece', size: 'l', qty: '2' }],
    [{ id: 'trilece', size: 'l', qty: 21 }], [{ id: 'trilece', size: 'l', qty: 20 }, { id: 'beirut', size: 'l', qty: 20 }, { id: 'balls', size: 's', qty: 1 }]]) {
    const r = validateOrder(body({ items }), { now: NOW });
    assert.equal(r.ok, false, JSON.stringify(items));
    assert.deepEqual(r.errors, ['items']);
  }
});

test('dates: at least 2 days ahead in Haifa time, at most 60', () => {
  assert.equal(israelDate(NOW), '2026-10-22');
  assert.equal(validateOrder(body({ date: '2026-10-24' }), { now: NOW }).ok, true);
  assert.equal(validateOrder(body({ date: '2026-12-21' }), { now: NOW }).ok, true);
  for (const date of ['2026-10-23', '2026-10-22', '2026-12-22', '24/10/2026', '', undefined]) {
    assert.deepEqual(validateOrder(body({ date }), { now: NOW }).errors, ['date'], String(date));
  }
});

test('"today" switches at midnight in Israel, not at UTC midnight', () => {
  const late = new Date('2026-10-22T22:30:00Z');                 // 01:30 on the 23rd in Haifa
  assert.equal(israelDate(late), '2026-10-23');
  assert.deepEqual(validateOrder(body({ date: '2026-10-24' }), { now: late }).errors, ['date']);
});

test('delivery needs an address; pickup drops it', () => {
  assert.deepEqual(validateOrder(body({ address: ' ' }), { now: NOW }).errors, ['address']);
  const r = validateOrder(body({ method: 'pickup', address: 'ignored' }), { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.order.address, '');
  assert.deepEqual(validateOrder(body({ method: 'drone' }), { now: NOW }).errors, ['method']);
});

test('name and phone', () => {
  assert.deepEqual(validateOrder(body({ name: 'N' }), { now: NOW }).errors, ['name']);
  assert.equal(validateOrder(body({ phone: '' }), { now: NOW }).ok, true);
  assert.deepEqual(validateOrder(body({ phone: '' }), { now: NOW, requirePhone: true }).errors, ['phone']);
  assert.deepEqual(validateOrder(body({ phone: 'call me' }), { now: NOW }).errors, ['phone']);
  assert.equal(validateOrder(body({ phone: '+972 50 123 4567' }), { now: NOW, requirePhone: true }).ok, true);
});

test('all problems are reported together, without duplicates', () => {
  const r = validateOrder({ items: [{ id: 'x' }, { id: 'y' }] }, { now: NOW, requirePhone: true });
  assert.deepEqual(r.errors, ['items', 'method', 'date', 'name', 'phone']);
  assert.equal(validateOrder(null, { now: NOW }).ok, false);
});

test('text is trimmed, clipped and stripped of control characters', () => {
  const r = validateOrder(body({ name: '  Noa\u0000\u0007  ', notes: 'x'.repeat(900), lang: 'xx' }), { now: NOW });
  assert.equal(r.order.name, 'Noa');
  assert.equal(r.order.notes.length, 500);
  assert.equal(r.order.lang, 'en');
});

test('order ids: readable, random by default, stable for the same checkout attempt', () => {
  const a = validateOrder(body(), { now: NOW }).order.id, b = validateOrder(body(), { now: NOW }).order.id;
  assert.match(a, /^JOY-261022-[0-9A-F]{6}$/);
  assert.notEqual(a, b);
  const s1 = validateOrder(body(), { now: NOW, idSeed: 'attempt-abc123' }).order.id;
  assert.equal(validateOrder(body(), { now: NOW, idSeed: 'attempt-abc123' }).order.id, s1);
  assert.notEqual(validateOrder(body(), { now: NOW, idSeed: 'attempt-xyz789' }).order.id, s1);
});

test('metadata fits payment-provider limits and reads back as a summary', () => {
  const { order } = validateOrder(body({ notes: 'n'.repeat(500), method: 'delivery' }), { now: NOW });
  const md = toMetadata(order);
  for (const [k, v] of Object.entries(md)) {
    assert.equal(typeof v, 'string', k);
    assert.ok(k.length <= 40 && v.length <= 500, k);
  }
  assert.equal(md.items, '1xtrilece|l;2xcc-mango|s');
  assert.equal(md.total_ils, '400');
  const text = describeMetadata(md);
  assert.match(text, /Order JOY-261022-/);
  assert.match(text, /1 × Trileçe \(Big\) · ₪200/);
  assert.match(text, /2 × Cheesecake · Mango \(Small\) · ₪200/);
  assert.match(text, /Total: ₪400/);
  assert.match(text, /Delivery on 2026-10-25/);
  assert.match(text, /Address: Hanassi Ave 10, Haifa/);
  assert.match(summarize(order), /Total: ₪400/);
  assert.match(describeMetadata({}), /Order \?/);
});
