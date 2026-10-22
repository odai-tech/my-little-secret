'use strict';
/* Turn what the browser sent into a trusted order: every field is checked and the
   total is computed here from the catalog. Nothing price-related comes from the client. */
const crypto = require('crypto');
const CATALOG = require('../../assets/js/catalog.js');

const LANGS = ['en', 'ar', 'he', 'fr', 'de', 'ru'];
const MAX_UNITS = CATALOG.maxUnits;      // per order, across all lines
const MAX_PER_LINE = CATALOG.maxPerLine;
const TZ = CATALOG.timeZone;   // "today" is today in Haifa, whatever the server's clock zone

const byId = id => CATALOG.items.find(i => i.id === id);
const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '');

/* YYYY-MM-DD of `now` in Israel, plus n days */
function israelDate(now, plusDays = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toISOString().slice(0, 10);
}

/* JOY-YYMMDD-XXXXXX. With a seed (the checkout's idempotency key) the same attempt always
   gets the same id, so a retried request can't create a second payment. */
function newOrderId(now, seed) {
  const tail = seed ? crypto.createHash('sha256').update(String(seed)).digest('hex').slice(0, 6) : crypto.randomBytes(3).toString('hex');
  return `JOY-${israelDate(now).slice(2).replace(/-/g, '')}-${tail.toUpperCase()}`;
}

/**
 * @param {object} input  JSON body from the checkout
 * @param {object} opts   { now: Date, requirePhone: boolean, idSeed: string }
 * @returns {{ ok: true, order: object } | { ok: false, errors: string[] }}
 */
function validateOrder(input, opts = {}) {
  const now = opts.now || new Date();
  const errors = [];
  const body = input && typeof input === 'object' ? input : {};

  // items: [{ id, size, qty }], merged by id + size
  const lines = new Map();
  for (const raw of Array.isArray(body.items) ? body.items.slice(0, 50) : []) {
    const item = raw && byId(raw.id);
    const size = raw && CATALOG.sizes[raw.size] ? raw.size : null;
    const qty = Number.isInteger(raw && raw.qty) ? raw.qty : NaN;
    if (!item || !size || !(qty >= 1 && qty <= MAX_PER_LINE)) { errors.push('items'); continue; }
    const key = `${item.id}|${size}`;
    lines.set(key, Math.min(MAX_PER_LINE, (lines.get(key) || 0) + qty));
  }
  const items = [...lines].map(([key, qty]) => {
    const [id, size] = key.split('|');
    const unit = CATALOG.sizes[size].price;
    return { id, size, qty, unit, subtotal: unit * qty };
  });
  const units = items.reduce((a, l) => a + l.qty, 0);
  if (!items.length || units > MAX_UNITS) errors.push('items');

  const method = body.method === 'pickup' ? 'pickup' : body.method === 'delivery' ? 'delivery' : null;
  if (!method) errors.push('method');
  const address = text(body.address, 200);
  if (method === 'delivery' && address.length < 4) errors.push('address');

  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : '';
  if (!date || date < israelDate(now, CATALOG.minNoticeDays) || date > israelDate(now, CATALOG.maxDaysAhead)) errors.push('date');

  const name = text(body.name, 80);
  if (name.length < 2) errors.push('name');
  const phone = text(body.phone, 24);
  if ((opts.requirePhone || phone) && !/^\+?[0-9 ()\-]{7,20}$/.test(phone)) errors.push('phone');

  const notes = text(body.notes, 500);
  const lang = LANGS.includes(body.lang) ? body.lang : 'en';

  const uniq = [...new Set(errors)];
  if (uniq.length) return { ok: false, errors: uniq };
  const total = items.reduce((a, l) => a + l.subtotal, 0);
  return {
    ok: true,
    order: { id: newOrderId(now, opts.idSeed), items, total, currency: CATALOG.currency, method, address: method === 'delivery' ? address : '', date, name, phone, notes, lang, createdAt: now.toISOString() },
  };
}

/* A plain-text summary for notifications and the payment provider's records. */
function summarize(order) {
  const lines = order.items.map(l => `${l.qty} × ${byId(l.id).label} (${CATALOG.sizes[l.size].label}) · ₪${l.subtotal}`);
  return [
    `Order ${order.id}`,
    ...lines,
    `Total: ₪${order.total}`,
    `${order.method === 'delivery' ? 'Delivery' : 'Pickup'} on ${order.date}`,
    order.method === 'delivery' ? `Address: ${order.address}` : null,
    `Name: ${order.name}`,
    order.phone ? `Phone: ${order.phone}` : null,
    order.notes ? `Notes: ${order.notes}` : null,
  ].filter(Boolean).join('\n');
}

/* Compact metadata (payment providers cap key/value sizes). */
function toMetadata(order) {
  const clip = (v, n = 490) => String(v || '').slice(0, n);
  return {
    order_id: order.id,
    items: clip(order.items.map(l => `${l.qty}x${l.id}|${l.size}`).join(';')),
    total_ils: String(order.total),
    method: order.method,
    date: order.date,
    name: clip(order.name, 80),
    phone: clip(order.phone, 24),
    address: clip(order.address, 200),
    notes: clip(order.notes),
    lang: order.lang,
  };
}

/* Rebuild a readable summary from metadata (what a payment provider sends back in its webhook). */
function describeMetadata(md) {
  const m = md || {};
  const lines = String(m.items || '').split(';').filter(Boolean).map(part => {
    const [qty, rest] = part.split('x'); const [id, size] = String(rest || '').split('|');
    const item = byId(id), sz = CATALOG.sizes[size];
    return `${qty} × ${item ? item.label : id} (${sz ? sz.label : size})${sz ? ` · ₪${Number(qty) * sz.price}` : ''}`;
  });
  return [
    `Order ${m.order_id || '?'}`,
    ...lines,
    `Total: ₪${m.total_ils || '?'}`,
    `${m.method === 'pickup' ? 'Pickup' : 'Delivery'} on ${m.date || '?'}`,
    m.address ? `Address: ${m.address}` : null,
    m.name ? `Name: ${m.name}` : null,
    m.phone ? `Phone: ${m.phone}` : null,
    m.notes ? `Notes: ${m.notes}` : null,
  ].filter(Boolean).join('\n');
}

module.exports = { validateOrder, summarize, toMetadata, describeMetadata, israelDate, CATALOG };
