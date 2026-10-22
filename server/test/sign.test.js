'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sign, verify } = require('../lib/sign');

test('signed tokens round-trip and reject tampering, wrong keys and expiry', () => {
  const t = sign({ a: 1, exp: Date.now() + 60e3 }, 'k1');
  assert.equal(verify(t, 'k1').a, 1);
  assert.equal(verify(t, 'k2'), null);
  const [body, tag] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ a: 2, exp: Date.now() + 60e3 })).toString('base64url');
  assert.equal(verify(`${forged}.${tag}`, 'k1'), null);
  assert.equal(verify(`${body}.${tag.slice(1)}`, 'k1'), null);
  assert.equal(verify(sign({ a: 1, exp: Date.now() - 1 }, 'k1'), 'k1'), null);
  for (const bad of ['', null, 'x', 'x.y', undefined]) assert.equal(verify(bad, 'k1'), null);
});
