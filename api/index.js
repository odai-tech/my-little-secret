'use strict';
/* Vercel serverless entry. vercel.json rewrites every /api/* request here; req.url keeps
   the original path, so the app routes it. */
const { createApp } = require('../server/lib/app');
const { toNodeHandler } = require('../server/node');

module.exports = toNodeHandler(createApp(process.env));
