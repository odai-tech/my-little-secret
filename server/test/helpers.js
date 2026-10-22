'use strict';
/* Shared fixtures: a fixed clock, a valid order body and a request builder for createApp. */
const { israelDate } = require('../lib/order');

const NOW = new Date('2026-10-22T09:00:00Z');                   // 12:00 in Haifa
const quiet = { info() {}, warn() {}, error() {} };

function orderBody(over = {}) {
  return {
    items: [{ id: 'trilece', size: 'l', qty: 1 }, { id: 'cc-mango', size: 's', qty: 2 }],
    method: 'delivery', address: 'Hanassi Ave 10, Haifa', date: israelDate(new Date(), 3),
    name: 'Noa', phone: '050-123-4567', notes: 'Happy birthday!', lang: 'en',
    ...over,
  };
}

function req(method, path, { body, raw, headers = {}, ip = '1.1.1.1', query = {} } = {}) {
  const rawBody = raw !== undefined ? Buffer.from(raw) : Buffer.from(body === undefined ? '' : JSON.stringify(body));
  return { method, path, query, headers, rawBody, ip, host: 'shop.test', proto: 'https' };
}

const parse = res => JSON.parse(res.body);

module.exports = { NOW, quiet, orderBody, req, parse };
