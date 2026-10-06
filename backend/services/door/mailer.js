/**
 * Alert delivery. ALERTS_MODE = off | dry_run | live. Default is dry_run:
 * the message is rendered and stored, and the transport is not called.
 * live with SMTP_HOST / SMTP_PORT / ALERT_FROM missing falls back to dry_run
 * and records a warning. SMTP_PASS is never logged.
 */

let transportOverride = null;

function setMailTransport(fn) {
  transportOverride = fn;
}

function trimmedEnv(name) {
  return String(process.env[name] || '').trim();
}

function smtpConfigured() {
  return Boolean(trimmedEnv('SMTP_HOST') && trimmedEnv('SMTP_PORT') && trimmedEnv('ALERT_FROM'));
}

function resolveAlertsMode() {
  const requested = String(process.env.ALERTS_MODE || 'dry_run').trim().toLowerCase();
  if (!['off', 'dry_run', 'live'].includes(requested)) {
    return {
      requested,
      effective: 'dry_run',
      warning: 'ALERTS_MODE is not off, dry_run, or live. Emails are stored and not sent.',
    };
  }
  if (requested === 'live' && !smtpConfigured()) {
    return {
      requested,
      effective: 'dry_run',
      warning: 'ALERTS_MODE is live but SMTP_HOST, SMTP_PORT, or ALERT_FROM is missing. Emails are stored and not sent.',
    };
  }
  return { requested, effective: requested, warning: '' };
}

async function defaultTransport(message) {
  if (transportOverride) return transportOverride(message);
  // Loaded only when a live send actually happens.
  // eslint-disable-next-line global-require
  const nodemailer = require('nodemailer');
  const port = Number(trimmedEnv('SMTP_PORT'));
  const user = trimmedEnv('SMTP_USER');
  const transporter = nodemailer.createTransport({
    host: trimmedEnv('SMTP_HOST'),
    port,
    secure: port === 465,
    auth: user
      ? { user, pass: process.env.SMTP_PASS || '' }
      : undefined,
  });
  await transporter.sendMail({
    from: trimmedEnv('ALERT_FROM'),
    to: message.to,
    cc: message.cc || undefined,
    subject: message.subject,
    text: message.text,
  });
}

/**
 * Persist the rendered message. Calls the SMTP transport only in effective live mode.
 */
async function deliverEmail(message, { save }) {
  const decision = resolveAlertsMode();
  const row = {
    id: message.id,
    kind: message.kind,
    to: message.to || '',
    cc: message.cc || '',
    subject: message.subject || '',
    text: message.text || '',
    requestedMode: decision.requested,
    mode: decision.effective,
    warning: decision.warning || message.warning || '',
    error: '',
    status: decision.effective === 'off' ? 'suppressed' : 'dry_run',
    relatedId: message.relatedId || '',
    dayKey: message.dayKey || '',
    createdAt: new Date().toISOString(),
    sentAt: null,
  };
  if (decision.effective !== 'live') {
    await save(row);
    return row;
  }
  try {
    await defaultTransport(row);
    row.status = 'sent';
    row.sentAt = new Date().toISOString();
  } catch (error) {
    row.status = 'failed';
    row.error = error.message || 'SMTP send failed';
  }
  await save(row);
  return row;
}

module.exports = {
  setMailTransport,
  smtpConfigured,
  resolveAlertsMode,
  deliverEmail,
};
