'use strict';
/* Pick the payment provider from PAYMENT_PROVIDER. Every provider has the same shape:
     name, ready?, publicConfig() → safe-for-browser settings,
     createPayment(order, ctx) → { kind: 'elements', clientSecret } | { kind: 'redirect', url },
     parseWebhook(rawBody, headers) → { status: 'paid' | 'failed' | 'ignored', orderId, metadata, … },
     routes? → extra endpoints the provider needs. */
const { createStripeProvider } = require('./stripe');
const { createMockProvider } = require('./mock');
const { createHostedProvider } = require('./hosted');

function loadProvider(env) {
  const name = String(env.PAYMENT_PROVIDER || '').trim().toLowerCase();
  if (!name || name === 'none') return null;
  if (name === 'stripe') return createStripeProvider(env);
  if (name === 'mock') return createMockProvider(env);
  if (name === 'hosted') return createHostedProvider(env);
  throw new Error(`Unknown PAYMENT_PROVIDER "${name}" (use stripe, hosted, mock or none)`);
}

module.exports = { loadProvider };
