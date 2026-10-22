'use strict';
/* Run the API on Node's http server (also what Vercel calls): reads the raw body
   (payment webhooks are verified against the exact bytes) and writes the response. */
const BODY_LIMIT = 64 * 1024;

function toNodeHandler(app) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > BODY_LIMIT) { res.writeHead(413, { 'content-type': 'text/plain' }); res.end('Too large'); return; }
      chunks.push(chunk);
    }
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
    const out = await app({
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers,
      rawBody: Buffer.concat(chunks),
      ip: String(headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '',
      host: headers['x-forwarded-host'] || headers.host || 'localhost',
      proto: String(headers['x-forwarded-proto'] || (req.socket && req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim(),
    });
    res.writeHead(out.status, out.headers);
    res.end(out.body);
  };
}

module.exports = { toNodeHandler };
