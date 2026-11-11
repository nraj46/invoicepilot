'use strict';
// Vercel serverless entry — the Express app handles /api/* and /graphql.
const { createApp } = require('../server/src/app');
module.exports = createApp();
