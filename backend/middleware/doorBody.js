const express = require('express');

const LIMIT = '64kb';
const doorJson = express.json({ limit: LIMIT });
const doorUrlencoded = express.urlencoded({ extended: false, limit: LIMIT });
const doorText = express.text({ limit: LIMIT, type: ['text/plain', 'text/*'] });

/**
 * Runs before the global 2mb JSON parser so these two paths cannot buffer a
 * megabyte body. express.json skips the request once req._body is set.
 */
function doorWebhookBodyParser(req, res, next) {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (req.method !== 'POST' || (path !== '/api/door/events' && path !== '/api/door/email-inbound')) {
    return next();
  }
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (type.includes('application/x-www-form-urlencoded')) return doorUrlencoded(req, res, next);
  if (type.startsWith('text/')) return doorText(req, res, next);
  return doorJson(req, res, next);
}

module.exports = {
  doorWebhookBodyParser,
};
