const crypto = require('crypto');
const { timingSafeStringEqual, configuredSecret } = require('./manageAuth');

/**
 * Whole-app gate. This is separate from the manage session.
 *
 * How the two tokens are carried (frontend and API are different origins):
 * - Platform token: `X-Platform-Token: <token>` on every gated /api request.
 *   The browser stores it in localStorage. TTL defaults to 30 days
 *   (PLATFORM_SESSION_DAYS) so a shop-floor kiosk does not re-login each shift.
 * - Manage token: `Authorization: Bearer <token>` from POST /api/auth/manage-pin,
 *   stored in sessionStorage, about 10 hours. Manage routes need BOTH headers.
 *   Check-out and check-in need only the platform token.
 *
 * The platform token's `purpose` claim is `platform`. Manage tokens use
 * `role: manage` and are rejected here. A platform token is rejected by
 * requireManageSession. Signing key is SESSION_SECRET when that env var is
 * set, otherwise it is derived from PLATFORM_PASSWORD so rotating the shop
 * password logs everyone out.
 */

const DEFAULT_PLATFORM_SESSION_DAYS = 30;
const MAX_PLATFORM_SESSION_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function platformPassword() {
  return configuredSecret(process.env.PLATFORM_PASSWORD);
}

function platformConfigured() {
  return platformPassword().length > 0;
}

function maxPlatformTtlMs() {
  return MAX_PLATFORM_SESSION_DAYS * MS_PER_DAY;
}

function platformSessionDays() {
  const raw = process.env.PLATFORM_SESSION_DAYS;
  if (raw == null || String(raw).trim() === '') return DEFAULT_PLATFORM_SESSION_DAYS;
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) return DEFAULT_PLATFORM_SESSION_DAYS;
  return Math.min(days, MAX_PLATFORM_SESSION_DAYS);
}

function platformSessionTtlMs() {
  return platformSessionDays() * MS_PER_DAY;
}

function platformSigningKey() {
  const configured = configuredSecret(process.env.SESSION_SECRET);
  if (configured) return configured;
  return crypto
    .createHash('sha256')
    .update(`wki-tool-room-platform-session\0${platformPassword()}`)
    .digest('hex');
}

function signPlatformPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', platformSigningKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyPlatformToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig || token.indexOf('.', dot + 1) !== -1) return null;
  const expected = crypto.createHmac('sha256', platformSigningKey()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (error) {
    return null;
  }
  if (!payload || payload.purpose !== 'platform') return null;
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return null;
  if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) return null;
  if (payload.exp < Date.now()) return null;
  // A valid signature is not enough. exp cannot outlive issue time, or now, plus the max TTL.
  if (payload.exp > payload.iat + maxPlatformTtlMs()) return null;
  if (payload.exp > Date.now() + maxPlatformTtlMs()) return null;
  return payload;
}

function issuePlatformSession() {
  const now = Date.now();
  const ttl = Math.min(platformSessionTtlMs(), maxPlatformTtlMs());
  const payload = {
    purpose: 'platform',
    iat: now,
    exp: now + ttl,
  };
  return {
    token: signPlatformPayload(payload),
    expiresAt: payload.exp,
    tokenType: 'Bearer',
  };
}

function readPlatformHeader(req) {
  return String(req.get('x-platform-token') || '').trim();
}

function platformNotConfigured(res) {
  return res.status(503).json({
    ok: false,
    error: 'platform_password_not_configured',
  });
}

function requestPath(req) {
  const raw = req.originalUrl || req.url || '';
  return raw.split('?')[0];
}

function isOpenPlatformRoute(req) {
  if (req.method === 'OPTIONS') return true;
  const path = requestPath(req);
  if (path === '/api/health' || path === '/health') return true;
  if (req.method === 'POST' && (path === '/api/auth/platform' || path === '/auth/platform')) return true;
  return false;
}

function requirePlatformSession(req, res, next) {
  if (isOpenPlatformRoute(req)) return next();
  if (!platformConfigured()) return platformNotConfigured(res);
  const token = readPlatformHeader(req);
  const session = verifyPlatformToken(token);
  if (!session) {
    return res.status(401).json({
      ok: false,
      error: token ? 'platform_token_invalid' : 'platform_token_required',
    });
  }
  req.platformSession = session;
  return next();
}

function handlePlatformLogin(req, res) {
  if (!platformConfigured()) return platformNotConfigured(res);
  const password = req.body?.password;
  if (!timingSafeStringEqual(password, platformPassword())) {
    return res.status(401).json({ ok: false, error: 'incorrect_password' });
  }
  const session = issuePlatformSession();
  res.locals.authSucceeded = true;
  return res.json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    tokenType: session.tokenType,
  });
}

function handlePlatformCheck(req, res) {
  return res.json({
    ok: true,
    purpose: req.platformSession?.purpose || 'platform',
    expiresAt: req.platformSession?.exp || null,
    tokenType: 'Bearer',
  });
}

module.exports = {
  DEFAULT_PLATFORM_SESSION_DAYS,
  platformConfigured,
  platformSessionDays,
  maxPlatformTtlMs,
  signPlatformPayload,
  issuePlatformSession,
  verifyPlatformToken,
  requirePlatformSession,
  handlePlatformLogin,
  handlePlatformCheck,
};
