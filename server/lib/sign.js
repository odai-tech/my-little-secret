'use strict';
/* Small HMAC-signed tokens: data that travels through the browser but can't be altered. */
const crypto = require('crypto');

const mac = (body, secret) => crypto.createHmac('sha256', secret).update(body).digest('base64url');

function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(body, secret)}`;
}

function verify(token, secret) {
  const [body, tag] = String(token || '').split('.');
  if (!body || !tag) return null;
  const a = Buffer.from(tag), b = Buffer.from(mac(body, secret));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return data && (!data.exp || data.exp > Date.now()) ? data : null;
  } catch (e) { return null; }
}

module.exports = { sign, verify };
