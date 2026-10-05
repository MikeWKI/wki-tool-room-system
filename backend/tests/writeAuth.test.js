const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');

process.env.MANAGE_PIN = 'test-manage-pin';
process.env.CAMERA_ACCESS_PASSWORD = 'test-camera-password';
delete process.env.SESSION_SECRET;
delete process.env.FRONTEND_ORIGIN;
process.env.NODE_ENV = 'test';

const {
  timingSafeStringEqual,
  issueManageSession,
  verifyManageToken,
} = require('../middleware/manageAuth');
const { PRODUCTION_FRONTEND_ORIGIN } = require('../middleware/corsPolicy');
const app = require('../server');

function request(port, { method = 'GET', path: reqPath, body, headers = {}, ip = '203.0.113.10' }) {
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

test('timing-safe compare hashes both sides and ignores length tricks', () => {
  assert.equal(timingSafeStringEqual('test-manage-pin', 'test-manage-pin'), true);
  assert.equal(timingSafeStringEqual('test-manage-pin', 'nope'), false);
  assert.equal(timingSafeStringEqual('a', 'ab'), false);
  assert.equal(timingSafeStringEqual(undefined, 'test-manage-pin'), false);
});

test('manage session round-trips the actor and rejects tampering', () => {
  const issued = issueManageSession('Floor Lead');
  const payload = verifyManageToken(issued.token);
  assert.equal(payload.actor, 'Floor Lead');
  assert.equal(payload.role, 'manage');
  assert.ok(payload.exp > Date.now());
  const [body, sig] = issued.token.split('.');
  assert.equal(verifyManageToken(`${body}.${sig.slice(0, -1)}x`), null);
  assert.equal(verifyManageToken('not-a-token'), null);
});

test('write routes, cors, rate limit, and production debug', async () => {
  const server = await listen(app);
  const port = server.address().port;
  const call = (options) => request(port, options);

  try {
    const openWrites = [
      ['POST', '/api/reconcile/apply', { dryRun: true, appliedBy: 'Spoofed' }],
      ['POST', '/api/reconcile/staging/accept', { partNumber: 'X', decision: 'skip' }],
      ['POST', '/api/reconcile/staging/clear', {}],
      ['POST', '/api/shelves/seed-jb-layout', { dryRun: true }],
      ['POST', '/api/parts/enrich-batch', { items: [] }],
      ['POST', '/api/parts', { partNumber: 'NEW', description: 'x', shelf: 'TBD', category: 'General' }],
      ['PUT', '/api/parts/1', { description: 'nope' }],
      ['DELETE', '/api/parts/1', null],
      ['POST', '/api/backup/restore', { confirm: true, data: { parts: [], shelves: {}, transactions: [] } }],
      ['POST', '/api/audit/load-activity', { confirm: false }],
    ];

    for (const [method, reqPath, body] of openWrites) {
      const res = await call({ method, path: reqPath, body, ip: '203.0.113.40' });
      assert.equal(res.status, 401, `${method} ${reqPath} should be 401 without a session`);
    }

    const excel = await call({
      method: 'POST',
      path: '/api/import/excel',
      ip: '203.0.113.41',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not-a-file',
    });
    assert.equal(excel.status, 401);

    const checkout = await call({
      method: 'POST',
      path: '/api/parts/1/checkout',
      body: {},
      ip: '203.0.113.42',
    });
    assert.equal(checkout.status, 400);
    assert.notEqual(checkout.status, 401);

    const checkin = await call({
      method: 'POST',
      path: '/api/parts/1/checkin',
      body: {},
      ip: '203.0.113.43',
    });
    assert.equal(checkin.status, 400);
    assert.notEqual(checkin.status, 401);

    const login = await call({
      method: 'POST',
      path: '/api/auth/manage-pin',
      ip: '203.0.113.21',
      body: { pin: process.env.MANAGE_PIN, actor: 'Floor Lead' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.json.ok, true);
    assert.ok(login.json.token);
    assert.ok(login.json.expiresAt > Date.now());
    const auth = { Authorization: `Bearer ${login.json.token}` };

    const seeded = await call({
      method: 'POST',
      path: '/api/shelves/seed-jb-layout',
      ip: '203.0.113.21',
      headers: auth,
      body: { dryRun: true },
    });
    assert.equal(seeded.status, 200);
    assert.equal(seeded.json.dryRun, true);
    assert.ok(seeded.json.wouldUpsert > 0);

    const applied = await call({
      method: 'POST',
      path: '/api/reconcile/apply',
      ip: '203.0.113.22',
      headers: auth,
      body: { dryRun: true, appliedBy: 'Spoofed Name' },
    });
    assert.equal(applied.status, 200);
    assert.equal(applied.json.appliedBy, 'Floor Lead');

    const auditPin = await call({
      method: 'POST',
      path: '/api/audit/load-activity',
      ip: '203.0.113.23',
      body: { pin: process.env.MANAGE_PIN, confirm: false },
    });
    assert.equal(auditPin.status, 200);
    assert.equal(auditPin.json.dryRun, true);

    const wrongCamera = await call({
      method: 'POST',
      path: '/api/auth/camera-access',
      ip: '203.0.113.24',
      body: { password: 'wrong-password' },
    });
    assert.equal(wrongCamera.status, 200);
    assert.equal(wrongCamera.json.ok, false);
    assert.equal(wrongCamera.json.cameras, undefined);
    assert.equal(wrongCamera.text.includes('192.168.'), false);

    const camera = await call({
      method: 'POST',
      path: '/api/auth/camera-access',
      ip: '203.0.113.25',
      body: { password: process.env.CAMERA_ACCESS_PASSWORD },
    });
    assert.equal(camera.status, 200);
    assert.equal(camera.json.ok, true);
    assert.equal(camera.json.cameras.length, 2);
    assert.ok(camera.json.cameras.every((row) => row.url && row.name));

    const savedPin = process.env.MANAGE_PIN;
    delete process.env.MANAGE_PIN;
    try {
      const pinClosed = await call({
        method: 'POST',
        path: '/api/auth/manage-pin',
        ip: '203.0.113.60',
        body: { pin: savedPin },
      });
      assert.equal(pinClosed.status, 503);
      const writeClosed = await call({
        method: 'POST',
        path: '/api/parts',
        ip: '203.0.113.61',
        headers: auth,
        body: { partNumber: 'NEW', description: 'x', shelf: 'TBD', category: 'General' },
      });
      assert.equal(writeClosed.status, 503);
      const auditClosed = await call({
        method: 'POST',
        path: '/api/audit/load-activity',
        ip: '203.0.113.62',
        body: { pin: savedPin, confirm: false },
      });
      assert.equal(auditClosed.status, 503);
    } finally {
      process.env.MANAGE_PIN = savedPin;
    }

    const limitIp = '203.0.113.77';
    let last = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      last = await call({
        method: 'POST',
        path: '/api/auth/manage-pin',
        ip: limitIp,
        body: { pin: 'wrong-pin' },
      });
      assert.equal(last.status, 200, `attempt ${attempt + 1} should still be allowed`);
      assert.equal(last.json.ok, false);
    }
    const blocked = await call({
      method: 'POST',
      path: '/api/auth/camera-access',
      ip: limitIp,
      body: { password: 'wrong-password' },
    });
    assert.equal(blocked.status, 429);

    const evil = await call({
      method: 'GET',
      path: '/api/health',
      ip: '203.0.113.80',
      headers: { Origin: 'https://evil.onrender.com' },
    });
    assert.notEqual(evil.headers['access-control-allow-origin'], 'https://evil.onrender.com');

    const other = await call({
      method: 'OPTIONS',
      path: '/api/parts',
      ip: '203.0.113.81',
      headers: {
        Origin: 'https://not-the-tool-room.example',
        'Access-Control-Request-Method': 'POST',
      },
    });
    assert.notEqual(other.headers['access-control-allow-origin'], 'https://not-the-tool-room.example');

    const allowed = await call({
      method: 'GET',
      path: '/api/health',
      ip: '203.0.113.82',
      headers: { Origin: PRODUCTION_FRONTEND_ORIGIN },
    });
    assert.equal(allowed.headers['access-control-allow-origin'], PRODUCTION_FRONTEND_ORIGIN);

    const local = await call({
      method: 'GET',
      path: '/api/health',
      ip: '203.0.113.83',
      headers: { Origin: 'http://localhost:3000' },
    });
    assert.equal(local.headers['access-control-allow-origin'], 'http://localhost:3000');

    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const debug = await call({
        method: 'GET',
        path: '/api/debug/database',
        ip: '203.0.113.90',
      });
      assert.equal(debug.status, 404);
    } finally {
      process.env.NODE_ENV = previousEnv;
    }

    const frontendSrc = path.join(__dirname, '../../frontend/src');
    const hits = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|jsx|html|css)$/.test(entry.name)) {
          const text = fs.readFileSync(full, 'utf8');
          if (text.includes('192.168.')) hits.push(path.relative(frontendSrc, full));
        }
      }
    };
    walk(frontendSrc);
    assert.deepEqual(hits, []);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
