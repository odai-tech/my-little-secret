'use strict';
/* Stripe: card, Apple Pay and Google Pay inside the checkout (Payment Element +
   Express Checkout Element). Card details go straight from the customer's browser to
   Stripe; this server only creates the PaymentIntent and reads Stripe's signed webhook.
   Note: check that Stripe accepts your business's country before choosing it. */
const { toMetadata } = require('../order');

function createStripeProvider(env, deps = {}) {
  const missing = ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'].filter(k => !env[k]);
  if (missing.length) throw new Error(`Stripe is missing: ${missing.join(', ')}`);
  const stripe = deps.stripe || require('stripe')(env.STRIPE_SECRET_KEY);

  return {
    name: 'stripe',
    publicConfig: () => ({ provider: 'stripe', kind: 'elements', publishableKey: env.STRIPE_PUBLISHABLE_KEY, currency: 'ils' }),

    async createPayment(order, ctx = {}) {
      const intent = await stripe.paymentIntents.create({
        amount: order.total * 100,            // agorot
        currency: 'ils',
        automatic_payment_methods: { enabled: true },
        description: `Joy order ${order.id}`,
        metadata: toMetadata(order),
      }, ctx.idempotencyKey ? { idempotencyKey: ctx.idempotencyKey } : undefined);
      return { kind: 'elements', clientSecret: intent.client_secret };
    },

    /* Throws when the signature is wrong, so forged calls are rejected. */
    async parseWebhook(rawBody, headers) {
      const event = stripe.webhooks.constructEvent(rawBody, headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET);
      const pi = (event.data && event.data.object) || {};
      const md = pi.metadata || {};
      if (event.type === 'payment_intent.succeeded') {
        const amount = (pi.amount_received || pi.amount || 0) / 100;
        return { status: 'paid', eventId: event.id, orderId: md.order_id, metadata: md, amount, amountMatches: String(amount) === String(md.total_ils) };
      }
      if (event.type === 'payment_intent.payment_failed') return { status: 'failed', eventId: event.id, orderId: md.order_id, metadata: md };
      return { status: 'ignored', eventId: event.id, type: event.type };
    },
  };
}

module.exports = { createStripeProvider };
