'use strict';
/* The order & payment API, framework-free: handle({ method, path, query, headers,
   rawBody, ip, host, proto }) → { status, headers, body }. Adapters run it on Node
   (server/node.js) and on Vercel (api/[...route].js).

   GET  /api/config             what the checkout should offer (no secrets)
   POST /api/orders             validate + price the order, start the payment
   POST /api/payments/webhook   the provider confirms a payment (signature-checked)
   GET  /api/health             liveness check */
const { validateOrder, CATALOG } = require('./order');
const { loadProvider } = require('./providers');
const { notifyPaid } = require('./notify');

function rateLimiter(max, windowMs) {
  const hits = new Map();
  return ip => {
    const now = Date.now();
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    const h = hits.get(ip);
    if (!h || h.reset < now) { hits.set(ip, { n: 1, reset: now + windowMs }); return true; }
    h.n += 1;
    return h.n <= max;
  };
}

/* Remembers recently handled webhook events so a re-delivered event isn't announced twice
   (per server instance; the provider's dashboard stays the source of truth). */
function recentSet(limit = 500) {
  const set = new Set();
  return { has: k => set.has(k), add: k => { set.add(k); if (set.size > limit) set.delete(set.values().next().value); } };
}

function createApp(env = process.env, deps = {}) {
  const log = deps.log || console;
  let provider = null, setupError = null;
  try { provider = 'provider' in deps ? deps.provider : loadProvider(env); }
  catch (e) { setupError = e.message; log.error(`[joy] payments are off: ${e.message}`); }   // the site falls back to pay-later
  const notify = deps.notify || (event => notifyPaid(env, event, log));
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allow = rateLimiter(Number(env.RATE_LIMIT_PER_10MIN) || 20, 10 * 60e3);
  const seen = recentSet();
  const payLater = env.PAY_LATER !== 'false';
  const live = Boolean(provider && provider.ready !== false);

  const json = (status, body, extra = {}) => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
    body: JSON.stringify(body),
  });

  function corsFor(origin) {
    if (!origin || !allowed.includes(origin)) return {};
    return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600', vary: 'origin' };
  }

  /* Public URLs: SITE_URL / PUBLIC_API_URL when set, otherwise the request's own host. */
  function urls(req) {
    const self = `${req.proto || 'https'}://${req.host}`;
    const site = (env.SITE_URL || `${self}/`).replace(/\/?$/, '/');
    const api = (env.PUBLIC_API_URL || `${self}/api`).replace(/\/$/, '');
    return {
      siteUrl: site,
      apiUrl: api,
      webhookUrl: `${api}/payments/webhook`,
      successUrl: id => `${site}?paid=${encodeURIComponent(id)}#order`,
      cancelUrl: `${site}?canceled=1#order`,
    };
  }

  async function onPaid(event) {
    if (event.eventId && seen.has(event.eventId)) return;
    await notify(event);   // throws → webhook answers 500 → the provider retries
    if (event.eventId) seen.add(event.eventId);
  }

  return async function handle(req) {
    const cors = corsFor(req.headers.origin);
    if (req.method === 'OPTIONS') return { status: 204, headers: cors, body: '' };
    const route = `${req.method} ${req.path.replace(/^\/api(?=\/)/, '')}`;
    try {
      if (route === 'GET /health') return json(200, { ok: true, payments: live ? provider.name : null, ...(setupError && { problem: 'payment_setup' }) });

      if (route === 'GET /config') {
        return json(200, { payments: live ? provider.publicConfig() : null, payLater, currency: CATALOG.currency, minNoticeDays: CATALOG.minNoticeDays }, cors);
      }

      if (route === 'POST /orders') {
        if (!allow(req.ip || 'unknown')) return json(429, { error: 'too_many_requests' }, cors);
        if (!live) return json(503, { error: 'payments_off' }, cors);
        let body;
        try { body = JSON.parse(req.rawBody.toString('utf8')); } catch (e) { return json(400, { error: 'bad_json' }, cors); }
        const key = typeof body.idempotencyKey === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.idempotencyKey) ? body.idempotencyKey : null;
        const result = validateOrder(body, { requirePhone: true, idSeed: key });
        if (!result.ok) return json(422, { error: 'invalid', fields: result.errors }, cors);
        const { order } = result;
        const payment = await provider.createPayment(order, { ...urls(req), idempotencyKey: key && `${key}-${order.total}` });
        log.info(`[joy] order ${order.id} ₪${order.total} → ${provider.name}`);
        return json(201, { orderId: order.id, total: order.total, currency: order.currency, ...payment }, cors);
      }

      if (route === 'POST /payments/webhook') {
        if (!live) return json(404, { error: 'not_found' });
        let event;
        try { event = await provider.parseWebhook(req.rawBody, req.headers); }
        catch (e) { log.warn(`[joy] rejected webhook: ${e.message}`); return json(400, { error: 'bad_signature' }); }
        if (event.status === 'paid') await onPaid(event);
        else if (event.status === 'failed') log.info(`[joy] payment failed for ${event.orderId || '?'}`);
        return json(200, { received: true });
      }

      const extra = live && provider.routes && provider.routes[route];
      if (extra) return await extra(req, { ...urls(req), onPaid });

      return json(404, { error: 'not_found' }, cors);
    } catch (e) {
      log.error(`[joy] ${route} failed: ${e && e.stack || e}`);
      return json(500, { error: 'server_error' }, cors);
    }
  };
}

module.exports = { createApp };
