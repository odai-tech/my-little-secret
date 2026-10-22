'use strict';
/* A pretend hosted payment page for testing the whole flow (checkout → payment page →
   webhook → "paid" screen) before a real provider is connected. No money moves.
   It refuses to run in production. */
const crypto = require('crypto');
const { sign, verify } = require('../sign');
const { toMetadata } = require('../order');

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function createMockProvider(env) {
  if (env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production') {
    throw new Error('PAYMENT_PROVIDER=mock is for testing only and is disabled in production');
  }
  const secret = env.MOCK_SECRET || crypto.randomBytes(32).toString('hex');

  const page = (order, token) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test payment · Joy</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#EEF8FF;font:16px/1.5 system-ui,sans-serif;color:#0F3550}
main{width:min(420px,92vw);background:#fff;border-radius:24px;padding:28px;box-shadow:0 30px 60px -30px rgba(15,53,80,.4)}
.tag{display:inline-block;padding:4px 10px;border-radius:99px;background:#FFF1C9;color:#6E4500;font-size:12px;font-weight:700;letter-spacing:.08em}
h1{margin:12px 0 4px;font-size:22px} .total{font-size:32px;font-weight:800;color:#1A78BE;margin:8px 0 18px}
ul{padding-left:18px;margin:0 0 20px} button{width:100%;height:52px;border:0;border-radius:99px;font-weight:700;font-size:15px;cursor:pointer}
.pay{background:#1A78BE;color:#fff;margin-bottom:10px} .cancel{background:#EEF2F5;color:#0F3550}</style></head>
<body><main><span class="tag">TEST PAYMENT · NO MONEY IS TAKEN</span><h1>Joy order ${esc(order.id)}</h1>
<div class="total">₪${esc(order.total)}</div><ul>${order.items.map(l => `<li>${esc(l.qty)} × ${esc(l.id)} (${esc(l.size)})</li>`).join('')}</ul>
<form method="post" action="complete"><input type="hidden" name="t" value="${esc(token)}">
<button class="pay" name="action" value="pay">Pay ₪${esc(order.total)} (test)</button>
<button class="cancel" name="action" value="cancel">Cancel</button></form></main></body></html>`;

  return {
    name: 'mock',
    publicConfig: () => ({ provider: 'mock', kind: 'redirect', methods: ['card', 'applepay', 'googlepay', 'bit'], test: true }),

    async createPayment(order, ctx) {
      const token = sign({ order, success: ctx.successUrl(order.id), cancel: ctx.cancelUrl, exp: Date.now() + 30 * 60e3 }, secret);
      return { kind: 'redirect', url: `${ctx.apiUrl}/pay/mock/?t=${encodeURIComponent(token)}` };
    },

    async parseWebhook() { return { status: 'ignored', type: 'mock-has-no-webhook' }; },

    routes: {
      'GET /pay/mock/': async (req) => {
        const data = verify(req.query.t, secret);
        if (!data) return { status: 400, headers: { 'content-type': 'text/plain' }, body: 'This test payment link has expired.' };
        return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }, body: page(data.order, req.query.t) };
      },
      'POST /pay/mock/complete': async (req, ctx) => {
        const form = new URLSearchParams(req.rawBody.toString('utf8'));
        const data = verify(form.get('t'), secret);
        if (!data) return { status: 400, headers: { 'content-type': 'text/plain' }, body: 'This test payment link has expired.' };
        if (form.get('action') !== 'pay') return { status: 303, headers: { location: data.cancel }, body: '' };
        const md = toMetadata(data.order);
        await ctx.onPaid({ status: 'paid', eventId: `mock_${data.order.id}`, orderId: data.order.id, metadata: md, amount: data.order.total, amountMatches: true });
        return { status: 303, headers: { location: data.success }, body: '' };
      },
    },
  };
}

module.exports = { createMockProvider };
