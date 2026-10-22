/* Joy — settings the shop owner edits. */
window.JOY_CONFIG = {
  contact: {
    email: 'mylittlesecret782@gmail.com',
    // WhatsApp number in international format, digits only (e.g. '972501234567').
    // Leave empty to hide the WhatsApp buttons and take orders by email.
    whatsapp: '',
  },
  // Where the order/payment server lives. '/api' when the site and server are
  // deployed together (Vercel, or `npm start`); a full URL such as
  // 'https://pay.joy-desserts.co.il/api' when the server runs elsewhere.
  // With no server reachable, the site keeps working: orders go by email or WhatsApp.
  apiBase: '/api',
};
