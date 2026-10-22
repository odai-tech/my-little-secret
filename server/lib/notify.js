'use strict';
/* Tell the shop about a paid order. Channels (all optional, use any or all):
     NOTIFY_WEBHOOK_URL         POST JSON here (Zapier / Make / your own bot → WhatsApp, Slack, Sheets…)
     RESEND_API_KEY + NOTIFY_EMAIL   send an email through Resend (resend.com)
   The order is always written to the server log too. If a channel fails, the error is
   thrown so the payment provider retries the webhook later. */
const { describeMetadata } = require('./order');

async function post(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
}

async function notifyPaid(env, event, log = console) {
  const text = describeMetadata(event.metadata);
  const warn = event.amountMatches === false ? `\n⚠ Paid amount ₪${event.amount} differs from the order total — check before preparing.` : '';
  log.info(`[joy] PAID ${event.orderId} ₪${event.amount}\n${text}${warn}`);
  const jobs = [];
  if (env.NOTIFY_WEBHOOK_URL) {
    jobs.push(post(env.NOTIFY_WEBHOOK_URL, { event: 'order.paid', orderId: event.orderId, amount: event.amount, currency: 'ILS', text: text + warn, order: event.metadata }));
  }
  if (env.RESEND_API_KEY && env.NOTIFY_EMAIL) {
    jobs.push(post('https://api.resend.com/emails', {
      from: env.NOTIFY_FROM || 'Joy orders <onboarding@resend.dev>',
      to: env.NOTIFY_EMAIL.split(',').map(s => s.trim()),
      subject: `New paid order ${event.orderId} · ₪${event.amount}`,
      text: text + warn,
    }, { authorization: `Bearer ${env.RESEND_API_KEY}` }));
  }
  await Promise.all(jobs);
}

module.exports = { notifyPaid };
