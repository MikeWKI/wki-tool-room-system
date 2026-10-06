const rateLimit = require('express-rate-limit');
const { clientRateLimitKey } = require('./clientIp');
const { doorWebhookSecret, doorSecretAccepted } = require('./doorWebhookAuth');

const WINDOW_MS = 15 * 60 * 1000;

function limited(res) {
  return res.status(429).json({ error: 'door_rate_limited' });
}

function secretConfigured() {
  return doorWebhookSecret().length > 0;
}

/** Counts wrong secrets only. A blank DOOR_WEBHOOK_SECRET is a 503, not a guess. */
const doorFailedSecretLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 10,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: clientRateLimitKey,
  skip: (req) => !secretConfigured() || doorSecretAccepted(req),
  handler: (req, res) => limited(res),
});

/** Correct secrets get a budget large enough for a reader or an email provider burst. */
const doorAcceptedSecretLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 600,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: clientRateLimitKey,
  skip: (req) => !secretConfigured() || !doorSecretAccepted(req),
  handler: (req, res) => limited(res),
});

const DOOR_WEBHOOK_PATHS = new Set(['/api/door/events', '/api/door/email-inbound']);

function isDoorWebhookPost(req) {
  if (req.method !== 'POST') return false;
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  return DOOR_WEBHOOK_PATHS.has(path);
}

module.exports = {
  doorFailedSecretLimiter,
  doorAcceptedSecretLimiter,
  isDoorWebhookPost,
};
