'use strict';
/* Template for an Israeli hosted payment page: Grow (Meshulam), Tranzila, Cardcom,
   PayPlus and similar. These providers show the card / Apple Pay / Google Pay / Bit form
   on their own secure page: the server asks them for a payment page, the customer is
   sent there, and the provider calls the webhook when the payment completes.

   To go live, open your provider's API docs and fill in the two TODOs below, then set
   PAYMENT_PROVIDER=hosted and switch IMPLEMENTED to true. Until then the site keeps
   offering "pay later", so nothing breaks. */
const { toMetadata } = require('../order');

const IMPLEMENTED = false;

function createHostedProvider(env) {
  return {
    name: 'hosted',
    ready: IMPLEMENTED,
    publicConfig: () => ({ provider: 'hosted', kind: 'redirect', methods: ['card', 'applepay', 'googlepay', 'bit'] }),

    async createPayment(order, ctx) {
      // TODO(provider): call the provider's "create payment page" endpoint, for example with
      //   amount:       order.total (shekels) — check whether the API wants agorot
      //   description:  `Joy order ${order.id}`
      //   success URL:  ctx.successUrl(order.id)
      //   cancel URL:   ctx.cancelUrl
      //   notify URL:   ctx.webhookUrl            (the provider's server-to-server callback)
      //   custom data:  toMetadata(order)         (comes back in the callback)
      //   credentials:  env.PROVIDER_API_KEY etc. (never sent to the browser)
      // and return { kind: 'redirect', url: <the payment page URL from the response> }.
      void toMetadata; void env;
      throw new Error(`Hosted provider not implemented yet (order ${order.id}, ${ctx.webhookUrl})`);
    },

    async parseWebhook(rawBody, headers) {
      // TODO(provider): verify the callback really comes from the provider (signature,
      // shared secret, or by asking the provider's API to confirm the transaction).
      // Never trust an unverified call. Then return
      //   { status: 'paid' | 'failed' | 'ignored', eventId, orderId, metadata, amount, amountMatches }
      void rawBody; void headers;
      throw new Error('Hosted provider not implemented yet');
    },
  };
}

module.exports = { createHostedProvider };
