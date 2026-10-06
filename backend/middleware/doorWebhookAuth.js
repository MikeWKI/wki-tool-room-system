const { timingSafeStringEqual, configuredSecret } = require('./manageAuth');

const HEADER = 'x-door-webhook-secret';

function doorWebhookSecret() {
  return configuredSecret(process.env.DOOR_WEBHOOK_SECRET);
}

function doorSecretAccepted(req) {
  const secret = doorWebhookSecret();
  if (!secret) return false;
  return timingSafeStringEqual(req.get(HEADER) || '', secret);
}

function requireDoorWebhook(req, res, next) {
  const secret = doorWebhookSecret();
  if (!secret) {
    return res.status(503).json({ error: 'webhook_not_configured' });
  }
  if (!doorSecretAccepted(req)) {
    return res.status(401).json({ error: 'webhook_secret_rejected' });
  }
  return next();
}

module.exports = {
  HEADER,
  doorWebhookSecret,
  doorSecretAccepted,
  requireDoorWebhook,
};
