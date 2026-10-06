const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.MANAGE_PIN = 'test-manage-pin';
process.env.CAMERA_ACCESS_PASSWORD = 'test-camera-password';
process.env.PLATFORM_PASSWORD = 'test-platform-password';
delete process.env.SESSION_SECRET;
delete process.env.TRUST_PROXY_HOPS;
delete process.env.PLATFORM_SESSION_DAYS;
delete process.env.FRONTEND_ORIGIN;
process.env.NODE_ENV = 'test';

const { issuePlatformSession } = require('../middleware/platformAuth');
const {
  DEFAULT_TRUST_PROXY_HOPS,
  isCloudflareIp,
  normalizeClientKey,
  trustProxyHops,
} = require('../middleware/clientIp');
const app = require('../server');

const EDGE_A = '173.245.48.10';
const EDGE_B = '104.16.1.10';
const EDGE_C = '141.101.64.10';
const EDGE_V6 = '2606:4700:1::10';

function platformToken() {
  return issuePlatformSession().token;
}

function remaining(res) {
  return res.headers['ratelimit-remaining'];
}

test('Cloudflare ranges and IPv6 /64 keys', () => {
  assert.equal(DEFAULT_TRUST_PROXY_HOPS, 1);
  assert.equal(trustProxyHops(), 1);
  assert.equal(isCloudflareIp(EDGE_A), true);
  assert.equal(isCloudflareIp(EDGE_B), true);
  assert.equal(isCloudflareIp(EDGE_V6), true);
  assert.equal(isCloudflareIp('203.0.113.10'), false);
  assert.equal(isCloudflareIp('198.51.100.40'), false);
  assert.equal(isCloudflareIp('8.8.8.8'), false);

  const a = normalizeClientKey('2001:db8:aaaa:10::1');
  const b = normalizeClientKey('2001:db8:aaaa:10::abcd');
  const c = normalizeClientKey('2001:db8:aaaa:11::1');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /\/64$/);
  assert.equal(normalizeClientKey('::ffff:203.0.113.8'), '203.0.113.8');
});

test('one client behind rotating Cloudflare edges shares the 8-try auth bucket', async () => {
  const client = '203.0.113.180';
  const edges = [EDGE_A, EDGE_B, EDGE_C];
  const seen = [];
  for (const edge of edges) {
    const res = await request(app)
      .post('/api/auth/platform')
      .set('X-Forwarded-For', `${client}, ${edge}`)
      .set('CF-Connecting-IP', client)
      .send({ password: 'not-the-shop-password' });
    assert.equal(res.status, 401);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.error, 'incorrect_password');
    seen.push(remaining(res));
  }

  const pin = await request(app)
    .post('/api/auth/manage-pin')
    .set('X-Forwarded-For', `${client}, ${EDGE_B}`)
    .set('CF-Connecting-IP', client)
    .set('X-Platform-Token', platformToken())
    .send({ pin: 'wrong-pin' });
  assert.equal(pin.status, 200);
  assert.equal(pin.body.ok, false);
  seen.push(remaining(pin));

  const camera = await request(app)
    .post('/api/auth/camera-access')
    .set('X-Forwarded-For', `198.51.100.9, ${client}, ${EDGE_C}`)
    .set('CF-Connecting-IP', client)
    .set('True-Client-IP', '198.51.100.77')
    .set('X-Platform-Token', platformToken())
    .send({ password: 'wrong-camera' });
  assert.equal(camera.status, 200);
  assert.equal(camera.body.ok, false);
  seen.push(remaining(camera));

  assert.deepEqual(seen, ['7', '6', '5', '4', '3']);
  assert.equal(camera.headers['ratelimit-limit'], '8');
});

test('different clients get separate auth buckets', async () => {
  const first = await request(app)
    .post('/api/auth/platform')
    .set('X-Forwarded-For', `203.0.113.181, ${EDGE_A}`)
    .set('CF-Connecting-IP', '203.0.113.181')
    .send({ password: 'nope' });
  const second = await request(app)
    .post('/api/auth/platform')
    .set('X-Forwarded-For', `203.0.113.182, ${EDGE_B}`)
    .set('CF-Connecting-IP', '203.0.113.182')
    .send({ password: 'nope' });
  assert.equal(first.status, 401);
  assert.equal(second.status, 401);
  assert.equal(remaining(first), '7');
  assert.equal(remaining(second), '7');
});

test('spoofed leftmost XFF and CF-Connecting-IP from a non-Cloudflare peer cannot escape lockout', async () => {
  const peer = '198.51.100.40';
  const seen = [];
  for (let i = 0; i < 8; i += 1) {
    const res = await request(app)
      .post('/api/auth/platform')
      .set('X-Forwarded-For', `203.0.113.${i + 1}, ${peer}`)
      .set('CF-Connecting-IP', `203.0.113.${150 + i}`)
      .set('True-Client-IP', `198.51.100.${i + 1}`)
      .send({ password: 'nope' });
    assert.equal(res.status, 401, `attempt ${i + 1}`);
    seen.push(remaining(res));
  }
  assert.deepEqual(seen, ['7', '6', '5', '4', '3', '2', '1', '0']);

  const blocked = await request(app)
    .post('/api/auth/platform')
    .set('X-Forwarded-For', `203.0.113.250, ${peer}`)
    .set('CF-Connecting-IP', '203.0.113.251')
    .set('True-Client-IP', '198.51.100.251')
    .send({ password: 'nope' });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /Too many authentication attempts/);

  const stillBlocked = await request(app)
    .post('/api/auth/manage-pin')
    .set('X-Forwarded-For', `8.8.8.8, ${peer}`)
    .set('CF-Connecting-IP', '1.1.1.1')
    .set('X-Platform-Token', platformToken())
    .send({ pin: 'wrong-pin' });
  assert.equal(stillBlocked.status, 429);
});

test('IPv6 clients in one /64 share a bucket behind Cloudflare', async () => {
  const first = await request(app)
    .post('/api/auth/platform')
    .set('X-Forwarded-For', `2001:db8:aaaa:10::1, ${EDGE_V6}`)
    .set('CF-Connecting-IP', '2001:db8:aaaa:10::1')
    .send({ password: 'nope' });
  const second = await request(app)
    .post('/api/auth/platform')
    .set('X-Forwarded-For', `2001:db8:aaaa:10::abcd, ${EDGE_A}`)
    .set('CF-Connecting-IP', '2001:db8:aaaa:10::abcd')
    .send({ password: 'nope' });
  const other = await request(app)
    .post('/api/auth/platform')
    .set('X-Forwarded-For', `2001:db8:aaaa:11::1, ${EDGE_B}`)
    .set('CF-Connecting-IP', '2001:db8:aaaa:11::1')
    .send({ password: 'nope' });
  assert.equal(remaining(first), '7');
  assert.equal(remaining(second), '6');
  assert.equal(remaining(other), '7');
});

test('missing CF-Connecting-IP still keys on the address Cloudflare appended', async () => {
  const client = '203.0.113.190';
  const first = await request(app)
    .post('/api/auth/platform')
    .set('X-Forwarded-For', `${client}, ${EDGE_A}`)
    .set('True-Client-IP', client)
    .send({ password: 'nope' });
  const second = await request(app)
    .post('/api/auth/platform')
    .set('X-Forwarded-For', `198.51.100.9, ${client}, ${EDGE_C}`)
    .send({ password: 'nope' });
  assert.equal(remaining(first), '7');
  assert.equal(remaining(second), '6');
});

test('global limiter counts one client down across Cloudflare edges', async () => {
  const client = '203.0.113.210';
  const first = await request(app)
    .get('/api/health')
    .set('X-Forwarded-For', `${client}, ${EDGE_A}`)
    .set('CF-Connecting-IP', client);
  const second = await request(app)
    .get('/api/health')
    .set('X-Forwarded-For', `${client}, ${EDGE_B}`)
    .set('CF-Connecting-IP', client);
  const other = await request(app)
    .get('/api/health')
    .set('X-Forwarded-For', `203.0.113.211, ${EDGE_C}`)
    .set('CF-Connecting-IP', '203.0.113.211');
  assert.equal(first.status, 200);
  assert.equal(first.headers['x-ratelimit-remaining'], '99');
  assert.equal(second.headers['x-ratelimit-remaining'], '98');
  assert.equal(other.headers['x-ratelimit-remaining'], '99');
});
