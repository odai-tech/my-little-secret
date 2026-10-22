# Joy — dessert shop website + order & payment server

The website is plain HTML, CSS and JavaScript. Next to it is a small Node.js server that
prices orders and takes payments: Apple Pay, Google Pay and cards, through Stripe or an
Israeli payment provider.

**Without the server the site works as it does today**: customers send their order by
email or WhatsApp and pay on delivery or pickup. Deploy the server with a payment provider
and the checkout gains a 4th step, *Pay now* (Apple Pay · Google Pay · Card) or *Pay later*.

```
index.html                 the website
assets/js/catalog.js       menu, sizes, prices, ordering rules (shared by site and server)
assets/js/config.js        contact email, WhatsApp number, where the server lives
assets/js/main.js          site behaviour, checkout and payment step
assets/js/i18n.js          all text, in 6 languages
api/index.js               Vercel entry for the server
server/lib/                order checks, payment providers, webhooks, notifications
server/dev-server.js       runs site + server together (`npm start`)
server/test/               server tests (`npm test`)
```

## Everyday changes

| To change | Edit |
|---|---|
| Prices, sizes, desserts, days of notice | `assets/js/catalog.js` (site and server both read it) |
| Email, WhatsApp number | `assets/js/config.js` |
| Any text | `assets/js/i18n.js` (every language) |

## Try it on your computer

Needs Node.js 20 or newer.

```bash
npm install
npm start                                  # http://localhost:3000, no online payment
PAYMENT_PROVIDER=mock npm start            # full payment flow with a pretend payment page
npm test                                   # server tests
```

With `mock`, *Pay now* leads to a test page marked "TEST PAYMENT · NO MONEY IS TAKEN".
Paying there brings you back to the "Thank you, your order is paid" screen, and the server
log prints the order as the shop would receive it.

## Put it online

**Vercel (site + server together, recommended).** Import the GitHub repo in Vercel; there is
nothing to build. `vercel.json` sends every `/api/*` request to `api/index.js`. Add the
settings below under *Project → Settings → Environment Variables*, then redeploy.

**Any Node host** (Render, Railway, Fly.io, a VPS): run `npm install && npm start` with the
settings as environment variables. `PORT` is respected.

**GitHub Pages** only serves files, so it can't run the server: the site there takes orders
by email/WhatsApp. To add payments to a Pages site, run the server elsewhere, set
`apiBase` in `assets/js/config.js` to its full address (e.g. `https://pay.example.com/api`),
and list the Pages address in `ALLOWED_ORIGINS` on the server.

## Choosing a payment provider

| `PAYMENT_PROVIDER` | What customers see | Status |
|---|---|---|
| `stripe` | Apple Pay / Google Pay buttons and card fields inside the checkout | Ready: add the 3 keys |
| `hosted` | Your provider's secure page (card, Apple Pay, Google Pay, Bit, depending on the provider), then back to the site | Template: fill 2 TODOs |
| `mock` | Pretend payment page, for testing only (refuses to run in production) | Ready |
| `none` | No online payment; email/WhatsApp orders | Default |

**Stripe**: works only if Stripe accepts businesses from your country; check
[stripe.com/global](https://stripe.com/global) before opening an account. An Israeli
business will most likely need an Israeli processor instead.

**Israeli processors** (Grow/Meshulam, Tranzila, Cardcom, PayPlus…) all offer a hosted
payment page. `server/lib/providers/hosted.js` has the two functions to complete with your
provider's API docs: *create a payment page* and *check the callback is genuine*. Each
TODO lists exactly which order fields to pass. Then set `PAYMENT_PROVIDER=hosted`.

Whatever the provider, card details are typed into the provider's own fields or page,
never into this site, and the server computes every price from `catalog.js`; the browser
only sends which desserts and how many.

## Settings

All settings are environment variables; `.env.example` lists them with notes. Secret keys
go there (or in Vercel's settings), never in `assets/js/config.js`, which everyone can read.

| Setting | What it does |
|---|---|
| `PAYMENT_PROVIDER` | `stripe`, `hosted`, `mock` or `none` |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe keys |
| `SITE_URL` | Public site address; customers return here after paying |
| `PAY_LATER` | `false` hides *Pay later* (default: offered) |
| `NOTIFY_WEBHOOK_URL` | POSTs each paid order as JSON (Zapier/Make → WhatsApp, Sheets…) |
| `RESEND_API_KEY`, `NOTIFY_EMAIL`, `NOTIFY_FROM` | Emails each paid order through [Resend](https://resend.com) |
| `PUBLIC_API_URL`, `ALLOWED_ORIGINS` | Only when the server and site live on different addresses |
| `RATE_LIMIT_PER_10MIN` | Orders one visitor can start per 10 minutes (default 20) |
| `MOCK_SECRET` | Signing key for the mock provider |

If the payment settings are incomplete, the server logs why and the checkout falls back to
pay-later; it never breaks the site. `GET /api/health` shows which provider is active.

## How a paid order reaches you

1. The customer fills the box, delivery or pickup, day, name and phone, and pays.
2. The provider calls `https://<your-site>/api/payments/webhook`. The server checks the
   call's signature, so a forged "paid" message is refused.
3. The server sends the order to the shop: server log always, plus `NOTIFY_WEBHOOK_URL`
   and/or email. If sending fails, the provider retries later. Repeat deliveries are
   filtered out while the server is running; if a duplicate ever slips through, the order
   number shows it's the same order.

The customer sees an order number (e.g. `JOY-261025-4F9A2C`); the same number is in your
notification and in the provider's dashboard.

## Go-live checklist

- [ ] Payment account approved; test keys first, then live keys
- [ ] Settings added; `SITE_URL` is the real address
- [ ] Webhook created in the provider's dashboard → `https://<your-site>/api/payments/webhook`
      (Stripe: events `payment_intent.succeeded` and `payment_intent.payment_failed`;
      copy its signing secret into `STRIPE_WEBHOOK_SECRET`)
- [ ] Apple Pay: register the domain with the provider and host the verification file it
      gives you at `/.well-known/apple-developer-merchantid-domain-association`
- [ ] Notifications: place a test order and check it arrives (email / WhatsApp / sheet)
- [ ] Test order with a real card for a small amount, then refund it
- [ ] WhatsApp number added in `assets/js/config.js` (optional)
- [ ] Privacy policy and terms pages (refunds, cancellations, allergens); payment providers
      often ask for them before going live

## Safety notes

- Prices are always computed on the server from `catalog.js`.
- Order limits: 40 desserts per online order, 20 of one kind (bigger orders: pay later).
  Dates must be 2–60 days ahead, counted in Haifa time.
- A retried checkout reuses its idempotency key, so a double click or bad connection can't
  charge twice.
- `.env` is git-ignored; the dev server serves only `index.html`, `assets/` and `.well-known/`.
