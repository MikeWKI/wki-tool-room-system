const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const http = require('http');

process.env.MANAGE_PIN = 'test-manage-pin';
process.env.CAMERA_ACCESS_PASSWORD = 'test-camera-password';
process.env.PLATFORM_PASSWORD = 'test-platform-password';
delete process.env.SESSION_SECRET;
delete process.env.PLATFORM_SESSION_DAYS;
delete process.env.FRONTEND_ORIGIN;
process.env.NODE_ENV = 'test';

const { SESSION_TTL_MS, issueManageSession, signPayload, verifyManageToken } = require('../middleware/manageAuth');
const {
  issuePlatformSession,
  verifyPlatformToken,
  platformSessionDays,
  signPlatformPayload,
  maxPlatformTtlMs,
} = require('../middleware/platformAuth');
const app = require('../server');

function request(port, { method = 'GET', path: reqPath, body, headers = {}, ip = '198.51.100.10' }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method,
        headers: {
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': String(payload.length) }
            : {}),
          ...headers,
          'X-Forwarded-For': ip,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (error) {
            json = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, json, text });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function listen(appInstance) {
  const server = http.createServer(appInstance);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function platformHeaders(extra = {}) {
  return {
    'X-Platform-Token': issuePlatformSession().token,
    ...extra,
  };
}

test('platform token is purpose-scoped and lasts about 30 days', () => {
  assert.equal(platformSessionDays(), 30);
  const issued = issuePlatformSession();
  assert.equal(issued.tokenType, 'Bearer');
  const payload = verifyPlatformToken(issued.token);
  assert.equal(payload.purpose, 'platform');
  const ttl = issued.expiresAt - Date.now();
  assert.ok(ttl > 29 * 24 * 60 * 60 * 1000);
  assert.ok(ttl <= 30 * 24 * 60 * 60 * 1000);
  assert.equal(verifyManageToken(issued.token), null);

  const manage = issueManageSession('Floor Lead');
  assert.equal(verifyPlatformToken(manage.token), null);
  assert.equal(manage.token === issued.token, false);

  process.env.PLATFORM_SESSION_DAYS = '7';
  try {
    const week = issuePlatformSession();
    const weekTtl = week.expiresAt - Date.now();
    assert.ok(weekTtl > 6 * 24 * 60 * 60 * 1000);
    assert.ok(weekTtl <= 7 * 24 * 60 * 60 * 1000);
  } finally {
    delete process.env.PLATFORM_SESSION_DAYS;
  }
});

test('verification rejects an exp past the max TTL even with a valid signature', () => {
  const now = Date.now();
  const maxTtl = maxPlatformTtlMs();
  const tooLong = signPlatformPayload({
    purpose: 'platform',
    iat: now,
    exp: now + maxTtl + 60 * 1000,
  });
  assert.equal(verifyPlatformToken(tooLong), null);

  const atCap = signPlatformPayload({
    purpose: 'platform',
    iat: now,
    exp: now + maxTtl,
  });
  assert.equal(verifyPlatformToken(atCap).purpose, 'platform');

  const issued = issuePlatformSession();
  const payload = verifyPlatformToken(issued.token);
  assert.ok(payload.exp - payload.iat <= maxTtl);
});

function tokenSignedWith(payload, key) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(body).digest('base64url');
  return `${body}.${sig}`;
}

test('a blank SESSION_SECRET is ignored and a token signed with that blank key is rejected', async () => {
  const now = Date.now();
  process.env.SESSION_SECRET = '   ';
  const server = await listen(app);
  const port = server.address().port;
  const call = (options) => request(port, options);
  try {
    const forgedPlatform = tokenSignedWith({
      purpose: 'platform',
      iat: now,
      exp: now + 60 * 60 * 1000,
    }, '   ');
    assert.equal(verifyPlatformToken(forgedPlatform), null);
    const forgedManage = tokenSignedWith({
      role: 'manage',
      actor: 'Floor Lead',
      iat: now,
      exp: now + 60 * 60 * 1000,
    }, '   ');
    assert.equal(verifyManageToken(forgedManage), null);

    const platform = issuePlatformSession();
    assert.equal(verifyPlatformToken(platform.token).purpose, 'platform');
    const manage = issueManageSession('Floor Lead');
    assert.equal(verifyManageToken(manage.token).role, 'manage');

    const login = await call({
      method: 'POST',
      path: '/api/auth/platform',
      ip: '198.51.100.120',
      body: { password: 'test-platform-password' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.json.ok, true);
    const parts = await call({
      method: 'GET',
      path: '/api/parts',
      ip: '198.51.100.121',
      headers: { 'X-Platform-Token': login.json.token },
    });
    assert.equal(parts.status, 200);
    const forgedParts = await call({
      method: 'GET',
      path: '/api/parts',
      ip: '198.51.100.122',
      headers: { 'X-Platform-Token': forgedPlatform },
    });
    assert.equal(forgedParts.status, 401);

    const pin = await call({
      method: 'POST',
      path: '/api/auth/manage-pin',
      ip: '198.51.100.123',
      headers: { 'X-Platform-Token': login.json.token },
      body: { pin: 'test-manage-pin', actor: 'Floor Lead' },
    });
    assert.equal(pin.status, 200);
    assert.equal(pin.json.ok, true);
    assert.equal(verifyManageToken(pin.json.token).role, 'manage');
    const forgedWrite = await call({
      method: 'POST',
      path: '/api/shelves/seed-jb-layout',
      ip: '198.51.100.124',
      headers: {
        'X-Platform-Token': login.json.token,
        Authorization: `Bearer ${forgedManage}`,
      },
      body: { dryRun: true },
    });
    assert.equal(forgedWrite.status, 401);
  } finally {
    delete process.env.SESSION_SECRET;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('verification rejects an exp past now plus the max TTL even when exp minus iat is inside the max', () => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const farIat = now + maxPlatformTtlMs();
  const farPlatform = signPlatformPayload({
    purpose: 'platform',
    iat: farIat,
    exp: farIat + day,
  });
  assert.equal(verifyPlatformToken(farPlatform), null);

  const farManage = signPayload({
    role: 'manage',
    actor: 'Floor Lead',
    iat: now + SESSION_TTL_MS,
    exp: now + SESSION_TTL_MS + 60 * 1000,
  });
  assert.equal(verifyManageToken(farManage), null);
  assert.equal(verifyManageToken(issueManageSession('Floor Lead').token).role, 'manage');
});

test('rotating PLATFORM_PASSWORD invalidates tokens unless SESSION_SECRET is set', () => {
  const issued = issuePlatformSession();
  assert.ok(verifyPlatformToken(issued.token));
  process.env.PLATFORM_PASSWORD = 'rotated-shop-password';
  try {
    assert.equal(verifyPlatformToken(issued.token), null);
    process.env.SESSION_SECRET = 'unit-test-session-secret';
    const sticky = issuePlatformSession();
    process.env.PLATFORM_PASSWORD = 'rotated-again';
    assert.ok(verifyPlatformToken(sticky.token));
    const manage = issueManageSession('Floor Lead');
    assert.equal(verifyPlatformToken(manage.token), null);
    assert.equal(verifyManageToken(sticky.token), null);
  } finally {
    delete process.env.SESSION_SECRET;
    process.env.PLATFORM_PASSWORD = 'test-platform-password';
  }
});

test('platform gate, health, manage pair, and rate limit', async () => {
  const server = await listen(app);
  const port = server.address().port;
  const call = (options) => request(port, options);

  try {
    const parts = await call({ method: 'GET', path: '/api/parts', ip: '198.51.100.20' });
    assert.equal(parts.status, 401);
    assert.equal(parts.json.error, 'platform_token_required');

    const checkout = await call({
      method: 'POST',
      path: '/api/parts/1/checkout',
      ip: '198.51.100.21',
      body: { user: 'Noah R.' },
    });
    assert.equal(checkout.status, 401);
    assert.equal(checkout.json.error, 'platform_token_required');

    const health = await call({ method: 'GET', path: '/api/health', ip: '198.51.100.22' });
    assert.equal(health.status, 200);
    assert.equal(health.json.status, 'OK');

    const preflight = await call({
      method: 'OPTIONS',
      path: '/api/parts',
      ip: '198.51.100.23',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'X-Platform-Token, Authorization',
      },
    });
    assert.notEqual(preflight.status, 401);
    assert.notEqual(preflight.status, 503);
    const allowHeaders = String(preflight.headers['access-control-allow-headers'] || '');
    assert.match(allowHeaders, /x-platform-token/i);

    const cameraBlocked = await call({
      method: 'POST',
      path: '/api/auth/camera-access',
      ip: '198.51.100.24',
      body: { password: process.env.CAMERA_ACCESS_PASSWORD },
    });
    assert.equal(cameraBlocked.status, 401);
    assert.equal(cameraBlocked.json.error, 'platform_token_required');

    const manageAsPlatform = await call({
      method: 'GET',
      path: '/api/parts',
      ip: '198.51.100.25',
      headers: { 'X-Platform-Token': issueManageSession('Floor Lead').token },
    });
    assert.equal(manageAsPlatform.status, 401);
    assert.equal(manageAsPlatform.json.error, 'platform_token_invalid');

    const wrong = await call({
      method: 'POST',
      path: '/api/auth/platform',
      ip: '198.51.100.26',
      body: { password: 'not-the-shop-password' },
    });
    assert.equal(wrong.status, 200);
    assert.equal(wrong.json.ok, false);
    assert.equal(wrong.json.token, undefined);

    const login = await call({
      method: 'POST',
      path: '/api/auth/platform',
      ip: '198.51.100.27',
      body: { password: process.env.PLATFORM_PASSWORD },
    });
    assert.equal(login.status, 200);
    assert.equal(login.json.ok, true);
    assert.equal(login.json.tokenType, 'Bearer');
    assert.ok(login.json.expiresAt > Date.now() + 29 * 24 * 60 * 60 * 1000);
    const platform = { 'X-Platform-Token': login.json.token };

    const check = await call({
      method: 'GET',
      path: '/api/auth/platform/check',
      ip: '198.51.100.28',
      headers: platform,
    });
    assert.equal(check.status, 200);
    assert.equal(check.json.ok, true);
    assert.equal(check.json.purpose, 'platform');

    const checkMissing = await call({
      method: 'GET',
      path: '/api/auth/platform/check',
      ip: '198.51.100.29',
    });
    assert.equal(checkMissing.status, 401);
    assert.equal(checkMissing.json.error, 'platform_token_required');

    const partsOk = await call({
      method: 'GET',
      path: '/api/parts',
      ip: '198.51.100.30',
      headers: platform,
    });
    assert.equal(partsOk.status, 200);
    assert.ok(Array.isArray(partsOk.json));

    const checkoutOpen = await call({
      method: 'POST',
      path: '/api/parts/1/checkout',
      ip: '198.51.100.31',
      headers: platform,
      body: {},
    });
    assert.equal(checkoutOpen.status, 400);
    assert.notEqual(checkoutOpen.status, 401);

    const manageOnly = await call({
      method: 'POST',
      path: '/api/shelves/seed-jb-layout',
      ip: '198.51.100.32',
      headers: { Authorization: `Bearer ${issueManageSession('Floor Lead').token}` },
      body: { dryRun: true },
    });
    assert.equal(manageOnly.status, 401);
    assert.equal(manageOnly.json.error, 'platform_token_required');

    const platformOnly = await call({
      method: 'POST',
      path: '/api/shelves/seed-jb-layout',
      ip: '198.51.100.33',
      headers: {
        ...platform,
        Authorization: `Bearer ${login.json.token}`,
      },
      body: { dryRun: true },
    });
    assert.equal(platformOnly.status, 401);
    assert.equal(platformOnly.json.error, 'Manage session required');

    const both = await call({
      method: 'POST',
      path: '/api/shelves/seed-jb-layout',
      ip: '198.51.100.34',
      headers: {
        ...platform,
        Authorization: `Bearer ${issueManageSession('Floor Lead').token}`,
      },
      body: { dryRun: true },
    });
    assert.equal(both.status, 200);
    assert.equal(both.json.dryRun, true);

    const limitIp = '198.51.100.77';
    let last = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      last = await call({
        method: 'POST',
        path: '/api/auth/platform',
        ip: limitIp,
        body: { password: 'wrong-password' },
      });
      assert.equal(last.status, 200, `attempt ${attempt + 1} should still be allowed`);
      assert.equal(last.json.ok, false);
    }
    const blocked = await call({
      method: 'POST',
      path: '/api/auth/platform',
      ip: limitIp,
      body: { password: process.env.PLATFORM_PASSWORD },
    });
    assert.equal(blocked.status, 429);

    const savedPassword = process.env.PLATFORM_PASSWORD;
    const savedPin = process.env.MANAGE_PIN;
    const savedCamera = process.env.CAMERA_ACCESS_PASSWORD;
    try {
      process.env.PLATFORM_PASSWORD = '   ';
      const blankPlatform = await call({
        method: 'POST',
        path: '/api/auth/platform',
        ip: '198.51.100.100',
        body: { password: '   ' },
      });
      assert.equal(blankPlatform.status, 503);
      assert.equal(blankPlatform.json.error, 'platform_password_not_configured');
      const blankParts = await call({
        method: 'GET',
        path: '/api/parts',
        ip: '198.51.100.101',
        headers: platform,
      });
      assert.equal(blankParts.status, 503);
      assert.equal(blankParts.json.error, 'platform_password_not_configured');

      process.env.PLATFORM_PASSWORD = '  shop-secret  ';
      const trimmedLogin = await call({
        method: 'POST',
        path: '/api/auth/platform',
        ip: '198.51.100.102',
        body: { password: 'shop-secret' },
      });
      assert.equal(trimmedLogin.status, 200);
      assert.equal(trimmedLogin.json.ok, true);
      const paddedLogin = await call({
        method: 'POST',
        path: '/api/auth/platform',
        ip: '198.51.100.103',
        body: { password: '  shop-secret  ' },
      });
      assert.equal(paddedLogin.status, 200);
      assert.equal(paddedLogin.json.ok, false);
      assert.equal(paddedLogin.json.token, undefined);

      process.env.PLATFORM_PASSWORD = savedPassword;
      process.env.MANAGE_PIN = '   ';
      const blankPin = await call({
        method: 'POST',
        path: '/api/auth/manage-pin',
        ip: '198.51.100.104',
        headers: platformHeaders(),
        body: { pin: '   ' },
      });
      assert.equal(blankPin.status, 503);
      const blankWrite = await call({
        method: 'POST',
        path: '/api/parts',
        ip: '198.51.100.105',
        headers: {
          ...platformHeaders(),
          Authorization: `Bearer ${issueManageSession('Floor Lead').token}`,
        },
        body: { partNumber: 'NEW', description: 'x', shelf: 'TBD', category: 'General' },
      });
      assert.equal(blankWrite.status, 503);

      process.env.MANAGE_PIN = '  test-manage-pin  ';
      const trimmedPin = await call({
        method: 'POST',
        path: '/api/auth/manage-pin',
        ip: '198.51.100.106',
        headers: platformHeaders(),
        body: { pin: 'test-manage-pin' },
      });
      assert.equal(trimmedPin.status, 200);
      assert.equal(trimmedPin.json.ok, true);

      process.env.CAMERA_ACCESS_PASSWORD = '   ';
      const blankCamera = await call({
        method: 'POST',
        path: '/api/auth/camera-access',
        ip: '198.51.100.107',
        headers: platformHeaders(),
        body: { password: '   ' },
      });
      assert.equal(blankCamera.status, 503);

      process.env.CAMERA_ACCESS_PASSWORD = '  test-camera-password  ';
      const trimmedCamera = await call({
        method: 'POST',
        path: '/api/auth/camera-access',
        ip: '198.51.100.108',
        headers: platformHeaders(),
        body: { password: 'test-camera-password' },
      });
      assert.equal(trimmedCamera.status, 200);
      assert.equal(trimmedCamera.json.ok, true);
    } finally {
      process.env.PLATFORM_PASSWORD = savedPassword;
      process.env.MANAGE_PIN = savedPin;
      process.env.CAMERA_ACCESS_PASSWORD = savedCamera;
    }

    delete process.env.PLATFORM_PASSWORD;
    try {
      const loginClosed = await call({
        method: 'POST',
        path: '/api/auth/platform',
        ip: '198.51.100.90',
        body: { password: savedPassword },
      });
      assert.equal(loginClosed.status, 503);
      assert.equal(loginClosed.json.error, 'platform_password_not_configured');

      const partsClosed = await call({
        method: 'GET',
        path: '/api/parts',
        ip: '198.51.100.91',
        headers: platform,
      });
      assert.equal(partsClosed.status, 503);
      assert.equal(partsClosed.json.error, 'platform_password_not_configured');

      const checkoutClosed = await call({
        method: 'POST',
        path: '/api/parts/1/checkout',
        ip: '198.51.100.92',
        headers: platform,
        body: { user: 'Noah R.' },
      });
      assert.equal(checkoutClosed.status, 503);
      assert.equal(checkoutClosed.json.error, 'platform_password_not_configured');

      const healthOpen = await call({
        method: 'GET',
        path: '/api/health',
        ip: '198.51.100.93',
      });
      assert.equal(healthOpen.status, 200);
    } finally {
      process.env.PLATFORM_PASSWORD = savedPassword;
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
