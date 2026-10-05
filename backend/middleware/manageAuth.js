const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

/** A shop shift, not a permanent credential. */
const SESSION_TTL_MS = 10 * 60 * 60 * 1000;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  // Wrong PIN/password responses are HTTP 200 { ok: false }, so status alone
  // cannot tell a success from a guess. Handlers set res.locals.authSucceeded.
  skipSuccessfulRequests: true,
  requestWasSuccessful: (req, res) => res.locals.authSucceeded === true,
  handler: (req, res) => {
    res.status(429).json({
      ok: false,
      error: 'Too many authentication attempts. Try again in 15 minutes.',
    });
  },
});

function timingSafeStringEqual(left, right) {
  const a = crypto.createHash('sha256').update(String(left ?? ''), 'utf8').digest();
  const b = crypto.createHash('sha256').update(String(right ?? ''), 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Optional SESSION_SECRET overrides this. Otherwise the signing key is derived
 * from MANAGE_PIN so the API keeps working with no new env var and sessions
 * survive a restart. Rotating MANAGE_PIN invalidates outstanding tokens.
 */
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  return crypto
    .createHash('sha256')
    .update(`wki-tool-room-manage-session\0${process.env.MANAGE_PIN || ''}`)
    .digest('hex');
}

function sanitizeActor(value) {
  if (value == null) return '';
  return String(value).replace(/[\r\n\t]/g, ' ').trim().slice(0, 80);
}

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyManageToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig || token.indexOf('.', dot + 1) !== -1) return null;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (error) {
    return null;
  }
  if (!payload || payload.role !== 'manage') return null;
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

function issueManageSession(actorInput) {
  const now = Date.now();
  const actor = sanitizeActor(actorInput) || 'Manage session';
  const payload = {
    role: 'manage',
    actor,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  return {
    token: signPayload(payload),
    expiresAt: payload.exp,
    actor,
    tokenType: 'Bearer',
  };
}

function bearerToken(req) {
  const header = req.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

function managePinMissing(res) {
  res.status(503).json({
    ok: false,
    error: 'Manage PIN is not configured on the server (set MANAGE_PIN).',
  });
}

function requireManageSession(req, res, next) {
  if (!process.env.MANAGE_PIN) return managePinMissing(res);
  const session = verifyManageToken(bearerToken(req));
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Manage session required' });
  }
  req.manageSession = session;
  return next();
}

/**
 * Scripted callers may still POST { pin, confirm }. The compare is timing-safe.
 * A manage session is also accepted and does not need the PIN in the body.
 */
function requireManageSessionOrBodyPin(req, res, next) {
  if (!process.env.MANAGE_PIN) return managePinMissing(res);
  const session = verifyManageToken(bearerToken(req));
  if (session) {
    req.manageSession = session;
    return next();
  }
  const provided = req.body?.pin != null ? req.body.pin : req.get('x-manage-pin');
  if (provided != null && timingSafeStringEqual(provided, process.env.MANAGE_PIN)) {
    req.manageSession = { role: 'manage', actor: 'Manage PIN', via: 'pin' };
    return next();
  }
  return res.status(401).json({ ok: false, error: 'Manage PIN rejected' });
}

function resolveAppliedBy(req) {
  return sanitizeActor(req.manageSession?.actor) || 'Manage session';
}

function cameraFeedList() {
  return [
    {
      id: 'camera1',
      name: 'Tool Room West',
      url: process.env.CAMERA_WEST_URL || 'http://192.168.231.88/cgi-bin/guestimage.html',
    },
    {
      id: 'camera2',
      name: 'Tool Room East',
      url: process.env.CAMERA_EAST_URL || 'http://192.168.231.87/cgi-bin/guestimage.html',
    },
  ];
}

module.exports = {
  SESSION_TTL_MS,
  authLimiter,
  timingSafeStringEqual,
  issueManageSession,
  verifyManageToken,
  requireManageSession,
  requireManageSessionOrBodyPin,
  resolveAppliedBy,
  cameraFeedList,
};
