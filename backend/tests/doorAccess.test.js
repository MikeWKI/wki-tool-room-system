const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.MANAGE_PIN = 'test-manage-pin';
// Keep the mounted app off the persistent door store when these tests require server.js.
process.env.DOOR_STORE = 'memory';
delete process.env.SESSION_SECRET;
delete process.env.SMTP_HOST;
delete process.env.SMTP_PORT;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.ALERT_FROM;
process.env.ALERTS_MODE = 'dry_run';
process.env.ALERT_SUPERVISOR_EMAIL = 'jon.bennet@example.com';
delete process.env.DOOR_VISIT_WINDOW_MINUTES;
delete process.env.DOOR_ACK_SUPPRESSES_ALERT;
delete process.env.DOOR_EMAIL_PATTERN;
delete process.env.EOD_SWEEP_TIME;
delete process.env.EOD_SWEEP_DAYS;

const { MemoryDoorRepository } = require('../services/door/repository');
const { DoorService } = require('../services/door/doorService');
const { registerDoorRoutes } = require('../routes/doorRoutes');
const { setMailTransport, resolveAlertsMode, smtpConfigured } = require('../services/door/mailer');
const { adaptDoorPayload } = require('../services/door/unifiAdapter');
const { parseDoorEmail, DEFAULT_DOOR_EMAIL_PATTERN } = require('../services/door/emailParse');
const { visitAlertText } = require('../services/door/messages');
const { buildMetrics } = require('../services/door/metrics');
const { SEED_BATCH_KEY } = require('../services/door/origins');
const {
  zonedTimeToUtc,
  chicagoParts,
  latestDueSweep,
  formatChicago,
} = require('../services/door/chicagoTime');
const { issueManageSession } = require('../middleware/manageAuth');
const { issuePlatformSession } = require('../middleware/platformAuth');
const assumed = require('../fixtures/unifi-access-webhook.assumed.json');

let transportCalls = 0;
setMailTransport(async () => {
  transportCalls += 1;
});

function makeService({ transactions = [], parts = [] } = {}) {
  const repo = new MemoryDoorRepository();
  const audits = [];
  const service = new DoorService({
    repo,
    async readTransactions() {
      return transactions.concat(audits);
    },
    async readParts() {
      return parts;
    },
    async writeAudit(entry) {
      audits.unshift(entry);
      return entry;
    },
  });
  return { service, repo, audits, transactions, parts };
}

function listen(app) {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function request(port, { method = 'GET', path: reqPath, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (error) { json = null; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('Chicago 5 PM stays 17:00 across the 2026 DST changes', () => {
  const spring = zonedTimeToUtc(2026, 3, 8, 17, 0, 0);
  const fall = zonedTimeToUtc(2026, 11, 1, 17, 0, 0);
  assert.equal(spring.toISOString(), '2026-03-08T22:00:00.000Z');
  assert.equal(fall.toISOString(), '2026-11-01T23:00:00.000Z');
  assert.equal(chicagoParts(spring).hour, 17);
  assert.equal(chicagoParts(fall).hour, 17);
  assert.equal(chicagoParts(spring).weekday, 'Sun');
  assert.equal(chicagoParts(fall).weekday, 'Sun');

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const clock = { hour: 17, minute: 0 };
  const before = latestDueSweep(zonedTimeToUtc(2026, 10, 5, 16, 59, 0), { days: weekdays, clock });
  const at = latestDueSweep(zonedTimeToUtc(2026, 10, 5, 17, 0, 0), { days: weekdays, clock });
  const sunday = latestDueSweep(zonedTimeToUtc(2026, 10, 4, 18, 0, 0), { days: weekdays, clock });
  const afterFallBack = latestDueSweep(zonedTimeToUtc(2026, 11, 2, 17, 0, 0), { days: weekdays, clock });
  assert.equal(before.dayKey, '2026-10-02');
  assert.equal(at.dayKey, '2026-10-05');
  assert.equal(sunday.dayKey, '2026-10-02');
  assert.equal(afterFallBack.dayKey, '2026-11-02');
  assert.equal(afterFallBack.instant.toISOString(), '2026-11-02T23:00:00.000Z');
  assert.match(formatChicago(at.instant), /Oct 5, 2026, 5:00 PM CT/);
});

test('assumed UniFi fixtures adapt and an unrecognized body is stored unmapped', async () => {
  const fixtureNote = fs.readFileSync(path.join(__dirname, '../fixtures/unifi-access-webhook.assumed.json'), 'utf8');
  assert.match(fixtureNote, /assumed, verify against a real payload/);
  const entry = adaptDoorPayload(assumed.entry);
  assert.equal(entry.ok, true);
  assert.equal(entry.event.type, 'entry');
  assert.equal(entry.event.actorName, 'Noah R.');
  assert.equal(entry.event.eventId, 'evt-assumed-entry-1');
  assert.match(entry.event.adapterNote, /assumed/);
  const exit = adaptDoorPayload(assumed.exit);
  assert.equal(exit.event.type, 'exit');
  assert.equal(exit.event.actorId, 'badge-noah');
  const unknown = adaptDoorPayload(assumed.unrecognized);
  assert.equal(unknown.event.type, 'unknown');
  assert.equal(unknown.event.mapped, false);
  const { service, repo } = makeService();
  const storedResult = await service.ingestWebhook({ ...assumed.entry, timestamp: new Date().toISOString() });
  assert.equal(storedResult.visit.displayName, 'Unknown badge (Noah R.)');
  const stored = await repo.findEvent('evt-assumed-entry-1');
  assert.equal(stored.raw.user_name, 'Noah R.');
  assert.match(stored.adapterNote, /assumed/);
});

test('email pattern extracts a name and Chicago time', async () => {
  assert.match(DEFAULT_DOOR_EMAIL_PATTERN, /name/);
  const now = zonedTimeToUtc(2026, 10, 6, 12, 0, 0);
  const parsed = parseDoorEmail({
    subject: 'Tool room door',
    text: 'Noah R. entered the tool room at 2026-10-06 15:04',
  }, now, '');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.event.type, 'entry');
  assert.equal(parsed.event.actorName, 'Noah R.');
  assert.equal(parsed.event.occurredAt.toISOString(), zonedTimeToUtc(2026, 10, 6, 15, 4, 0).toISOString());
  const exit = parseDoorEmail({ text: 'Jon B. exited at 3:11 PM' }, now, '');
  assert.equal(exit.event.type, 'exit');
  assert.equal(exit.event.actorName, 'Jon B.');
  const bad = parseDoorEmail({ text: 'nobody home' }, now, '');
  assert.equal(bad.ok, false);
  const invalid = parseDoorEmail({ text: 'Noah R. entered at 1:00 PM' }, now, '(');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error, 'invalid_email_pattern');
  const { service } = makeService();
  const saved = await service.ingestEmail({
    subject: 'Tool room door',
    text: 'Noah R. entered the tool room at 2026-10-06 12:01',
  }, now);
  assert.equal(saved.ok, true);
  const duplicate = await service.ingestEmail({
    subject: 'Tool room door',
    text: 'Noah R. entered the tool room at 2026-10-06 12:01',
  }, now);
  assert.equal(duplicate.duplicate, true);
  process.env.DOOR_EMAIL_PATTERN = '(';
  const rejected = await service.ingestEmail({ text: 'Noah R. entered at 1:00 PM' }, now);
  assert.equal(rejected.status, 500);
  delete process.env.DOOR_EMAIL_PATTERN;
});

test('webhook auth fails closed, duplicates are ignored, and manage routes need a session', async () => {
  const previous = process.env.DOOR_WEBHOOK_SECRET;
  delete process.env.DOOR_WEBHOOK_SECRET;
  const { service } = makeService();
  const app = express();
  app.use(express.json());
  registerDoorRoutes(app, service);
  const server = await listen(app);
  const port = server.address().port;
  try {
    const closed = await request(port, {
      method: 'POST',
      path: '/api/door/events',
      body: { eventId: 'e1', type: 'entry', occurredAt: '2026-10-06T15:00:00.000Z', actorName: 'Noah R.' },
    });
    assert.equal(closed.status, 503);
    assert.equal(closed.json.error, 'webhook_not_configured');

    process.env.DOOR_WEBHOOK_SECRET = 'test-door-secret';
    const rejected = await request(port, {
      method: 'POST',
      path: '/api/door/events',
      body: { eventId: 'e1', type: 'entry', occurredAt: '2026-10-06T15:00:00.000Z', actorName: 'Noah R.' },
      headers: { 'X-Door-Webhook-Secret': 'wrong' },
    });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.json.error, 'webhook_secret_rejected');

    const occurredAt = new Date().toISOString();
    const created = await request(port, {
      method: 'POST',
      path: '/api/door/events',
      body: { eventId: 'e1', type: 'entry', occurredAt, actorName: 'Noah R.', doorName: 'Tool Room' },
      headers: { 'X-Door-Webhook-Secret': 'test-door-secret' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.visit.displayName, 'Unknown badge (Noah R.)');
    const again = await request(port, {
      method: 'POST',
      path: '/api/door/events',
      body: { eventId: 'e1', type: 'entry', occurredAt, actorName: 'Noah R.' },
      headers: { 'X-Door-Webhook-Secret': 'test-door-secret' },
    });
    assert.equal(again.status, 200);
    assert.equal(again.json.duplicate, true);
    const visits = await service.repo.listVisits();
    assert.equal(visits.length, 1);

    const manage = await request(port, { path: '/api/door/metrics' });
    assert.equal(manage.status, 401);
  } finally {
    server.close();
    if (previous == null) delete process.env.DOOR_WEBHOOK_SECRET;
    else process.env.DOOR_WEBHOOK_SECRET = previous;
  }
});

test('the mounted API fails closed before a door secret is set', async () => {
  const previous = process.env.DOOR_WEBHOOK_SECRET;
  delete process.env.DOOR_WEBHOOK_SECRET;
  const app = require('../server');
  const server = await listen(app);
  try {
    const closed = await request(server.address().port, {
      method: 'POST',
      path: '/api/door/events',
      body: { eventId: 'mounted', type: 'entry', occurredAt: '2026-10-06T20:00:00.000Z', actorName: 'Noah R.' },
      headers: { 'X-Forwarded-For': '203.0.113.77' },
    });
    assert.equal(closed.status, 503);
    assert.equal(closed.json.error, 'webhook_not_configured');
  } finally {
    server.close();
    if (previous == null) delete process.env.DOOR_WEBHOOK_SECRET;
    else process.env.DOOR_WEBHOOK_SECRET = previous;
  }
});

test('door webhooks skip the platform token and every other door route does not', async () => {
  const previousSecret = process.env.DOOR_WEBHOOK_SECRET;
  const previousPlatform = process.env.PLATFORM_PASSWORD;
  process.env.PLATFORM_PASSWORD = 'test-platform-password';
  delete process.env.DOOR_WEBHOOK_SECRET;
  const app = require('../server');
  const server = await listen(app);
  const port = server.address().port;
  const platform = () => ({ 'X-Platform-Token': issuePlatformSession().token });
  const both = () => ({
    ...platform(),
    Authorization: `Bearer ${issueManageSession('Floor Lead').token}`,
  });
  try {
    const closed = await request(port, {
      method: 'POST',
      path: '/api/door/events',
      body: { eventId: 'exempt-closed', type: 'entry', occurredAt: '2026-10-06T20:00:00.000Z', actorName: 'Noah R.' },
      headers: { 'X-Forwarded-For': '203.0.113.10' },
    });
    assert.equal(closed.status, 503);
    assert.equal(closed.json.error, 'webhook_not_configured');

    process.env.DOOR_WEBHOOK_SECRET = 'test-door-secret';
    const wrongSecret = await request(port, {
      method: 'POST',
      path: '/api/door/events',
      body: { eventId: 'exempt-wrong', type: 'entry', occurredAt: '2026-10-06T20:00:00.000Z', actorName: 'Noah R.' },
      headers: { 'X-Door-Webhook-Secret': 'wrong', 'X-Forwarded-For': '203.0.113.11' },
    });
    assert.equal(wrongSecret.status, 401);
    assert.equal(wrongSecret.json.error, 'webhook_secret_rejected');

    const webhook = await request(port, {
      method: 'POST',
      path: '/api/door/events',
      body: { eventId: 'exempt-entry', type: 'entry', occurredAt: new Date().toISOString(), actorName: 'Noah R.', doorName: 'Tool Room' },
      headers: { 'X-Door-Webhook-Secret': 'test-door-secret', 'X-Forwarded-For': '203.0.113.12' },
    });
    assert.equal(webhook.status, 201);
    assert.equal(webhook.json.visit.displayName, 'Unknown badge (Noah R.)');

    const chicago = chicagoParts(new Date());
    const emailStamp = `${chicago.year}-${String(chicago.month).padStart(2, '0')}-${String(chicago.day).padStart(2, '0')} ${String(chicago.hour).padStart(2, '0')}:${String(chicago.minute).padStart(2, '0')}`;
    const email = await request(port, {
      method: 'POST',
      path: '/api/door/email-inbound',
      body: { subject: 'Tool room door', text: `Noah R. exited the tool room at ${emailStamp}` },
      headers: { 'X-Door-Webhook-Secret': 'test-door-secret', 'X-Forwarded-For': '203.0.113.13' },
    });
    assert.equal(email.status, 201);

    const gated = [
      { method: 'GET', path: '/api/door/open-visit?name=Noah%20R.' },
      { method: 'POST', path: '/api/door/visits/missing/ack', body: { reason: 'Returning only' } },
      { method: 'GET', path: '/api/door/metrics' },
      { method: 'GET', path: '/api/door/outbox' },
      { method: 'GET', path: '/api/door/badges' },
      { method: 'GET', path: '/api/door/status' },
      { method: 'GET', path: '/api/door/events' },
      { method: 'POST', path: '/api/door/simulate', body: { techName: 'Noah R.', type: 'entry' } },
      { method: 'POST', path: '/api/door/badges', body: { actorName: 'Noah R.', techName: 'Noah R.' } },
      { method: 'POST', path: '/api/door/events/extra', body: {} },
      { method: 'POST', path: '/api/door/email-inbound/', body: {} },
    ];
    for (const [index, call] of gated.entries()) {
      const denied = await request(port, {
        ...call,
        headers: { 'X-Forwarded-For': `203.0.113.${20 + index}` },
      });
      assert.equal(denied.status, 401, call.path);
      assert.equal(denied.json.error, 'platform_token_required', call.path);
    }

    const shop = await request(port, {
      path: '/api/door/open-visit?name=Noah%20R.',
      headers: { ...platform(), 'X-Forwarded-For': '203.0.113.40' },
    });
    assert.equal(shop.status, 200);
    assert.equal(Object.prototype.hasOwnProperty.call(shop.json, 'visit'), true);

    const note = await request(port, {
      method: 'POST',
      path: '/api/door/visits/missing/ack',
      body: { reason: 'Returning only' },
      headers: { ...platform(), 'X-Forwarded-For': '203.0.113.41' },
    });
    assert.equal(note.status, 404);
    assert.notEqual(note.json.error, 'platform_token_required');

    const manageOnly = await request(port, {
      path: '/api/door/metrics',
      headers: { ...platform(), 'X-Forwarded-For': '203.0.113.42' },
    });
    assert.equal(manageOnly.status, 401);
    assert.equal(manageOnly.json.error, 'Manage session required');

    const simulateDenied = await request(port, {
      method: 'POST',
      path: '/api/door/simulate',
      body: { techName: 'Noah R.', type: 'entry' },
      headers: { ...platform(), 'X-Forwarded-For': '203.0.113.43' },
    });
    assert.equal(simulateDenied.status, 401);
    assert.equal(simulateDenied.json.error, 'Manage session required');

    const metrics = await request(port, {
      path: '/api/door/metrics',
      headers: { ...both(), 'X-Forwarded-For': '203.0.113.44' },
    });
    assert.equal(metrics.status, 200);
    assert.ok(Array.isArray(metrics.json.techs));

    const outbox = await request(port, {
      path: '/api/door/outbox',
      headers: { ...both(), 'X-Forwarded-For': '203.0.113.45' },
    });
    assert.equal(outbox.status, 200);
  } finally {
    server.close();
    if (previousSecret == null) delete process.env.DOOR_WEBHOOK_SECRET;
    else process.env.DOOR_WEBHOOK_SECRET = previousSecret;
    if (previousPlatform == null) delete process.env.PLATFORM_PASSWORD;
    else process.env.PLATFORM_PASSWORD = previousPlatform;
  }
});

test('checkout or check-in inside the window resolves, exit and expiry alert once', async () => {
  transportCalls = 0;
  process.env.ALERTS_MODE = 'dry_run';
  const entered = new Date(Date.now() - 60 * 1000);
  const { service, audits, transactions } = makeService();
  await service.saveBadge({ actorId: 'badge-noah', actorName: 'Noah R.', techName: 'Noah R.', techEmail: 'noah@example.com' });
  const opened = await service.ingestWebhook({
    eventId: 'entry-1',
    type: 'entry',
    occurredAt: entered.toISOString(),
    actorId: 'badge-noah',
    actorName: 'Noah R.',
    doorName: 'Tool Room',
  });
  assert.equal(opened.visit.displayName, 'Noah R.');
  assert.equal(opened.visit.windowMinutes, 10);

  transactions.push({
    id: 50,
    action: 'checkout',
    user: 'Noah R.',
    partId: 7,
    partNumber: '2892427',
    timestamp: new Date(entered.getTime() + 4 * 60 * 1000).toISOString(),
  });
  const resolved = await service.expireDueVisits(new Date(entered.getTime() + 11 * 60 * 1000));
  assert.equal(resolved.length, 1);
  const visit = await service.repo.findVisit(opened.visit.id);
  assert.equal(visit.status, 'resolved');
  assert.equal(visit.resolvedBy, 'checkout');
  assert.equal((await service.repo.listOutbox()).length, 0);
  assert.equal(transportCalls, 0);

  const quiet = await makeService();
  const second = await quiet.service.ingestWebhook({
    eventId: 'entry-2',
    type: 'entry',
    occurredAt: entered.toISOString(),
    actorName: 'Laryssa J.',
  });
  await quiet.service.expireDueVisits(new Date(entered.getTime() + 11 * 60 * 1000));
  await quiet.service.expireDueVisits(new Date(entered.getTime() + 20 * 60 * 1000));
  const alerts = (await quiet.service.repo.listOutbox()).filter((row) => row.kind === 'visit_alert');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].status, 'dry_run');
  assert.equal(alerts[0].to, 'jon.bennet@example.com');
  assert.match(alerts[0].text, /Laryssa J\./);
  assert.match(alerts[0].text, /within 10 minutes/);
  assert.doesNotMatch(alerts[0].text, /tool was taken/);
  assert.equal(transportCalls, 0);
  assert.ok(quiet.audits.some((row) => row.action === 'door_alert'));
  assert.equal(second.visit.displayName, 'Unknown badge (Laryssa J.)');

  const early = await makeService();
  const third = await early.service.ingestWebhook({
    eventId: 'entry-3',
    type: 'entry',
    occurredAt: entered.toISOString(),
    actorName: 'Will P.',
  });
  const exited = await early.service.ingestWebhook({
    eventId: 'exit-3',
    type: 'exit',
    occurredAt: new Date(entered.getTime() + 3 * 60 * 1000).toISOString(),
    actorName: 'Will P.',
  });
  assert.equal(exited.visit.status, 'entry_without_checkout');
  const exitMail = (await early.service.repo.listOutbox())[0];
  assert.match(exitMail.text, /exited at/);
  assert.match(visitAlertText({ ...third.visit, exitAt: exited.visit.exitAt, ackReason: '' }), /within 10 minutes/);
  assert.ok(early.audits.some((row) => row.action === 'door_exit'));
  assert.equal(audits.some((row) => row.action === 'door_entry'), true);
});

test('a restart sweeps a deadline that passed while the process was down', async () => {
  const { service } = makeService();
  const entered = new Date(Date.now() - 60 * 1000);
  const opened = await service.ingestWebhook({
    eventId: 'asleep',
    type: 'entry',
    occurredAt: entered.toISOString(),
    actorName: 'Drew P.',
  });
  const first = await service.runMaintenance(new Date('2026-10-06T19:00:00.000Z'));
  assert.equal(first.expired, 1);
  const visit = await service.repo.findVisit(opened.visit.id);
  assert.ok(visit.alertedAt);
  const second = await service.runMaintenance(new Date('2026-10-06T20:00:00.000Z'));
  assert.equal(second.expired, 0);
  assert.equal((await service.repo.listOutbox()).filter((row) => row.kind === 'visit_alert').length, 1);
});

test('tool activity during the window is honored after a restart, and a kiosk note does not suppress', async () => {
  const entered = new Date(Date.now() - 60 * 1000);
  const caughtUp = makeService({
    transactions: [{
      id: 9,
      action: 'checkin',
      user: 'Shawn S.',
      partId: 3,
      partNumber: 'J33880',
      timestamp: new Date(entered.getTime() + 2 * 60 * 1000).toISOString(),
    }],
  });
  const opened = await caughtUp.service.ingestWebhook({
    eventId: 'checkin-window',
    type: 'entry',
    occurredAt: entered.toISOString(),
    actorName: 'Shawn S.',
  });
  await caughtUp.service.expireDueVisits(new Date(entered.getTime() + 30 * 60 * 1000));
  const visit = await caughtUp.service.repo.findVisit(opened.visit.id);
  assert.equal(visit.status, 'resolved');
  assert.equal(visit.resolvedBy, 'checkin');

  delete process.env.DOOR_ACK_SUPPRESSES_ALERT;
  const noted = makeService();
  const entry = await noted.service.ingestWebhook({
    eventId: 'ack-1',
    type: 'entry',
    occurredAt: entered.toISOString(),
    actorName: 'Phil C.',
  });
  const ack = await noted.service.acknowledge(entry.visit.id, { reason: 'Returning only' });
  assert.equal(ack.suppressesAlert, false);
  await noted.service.expireDueVisits(new Date(entered.getTime() + 30 * 60 * 1000));
  const mail = (await noted.service.repo.listOutbox()).find((row) => row.kind === 'visit_alert');
  assert.match(mail.text, /Kiosk note: Returning only/);
  assert.ok(noted.audits.some((row) => row.action === 'door_ack'));

  process.env.DOOR_ACK_SUPPRESSES_ALERT = 'true';
  const suppressed = makeService();
  const other = await suppressed.service.ingestWebhook({
    eventId: 'ack-2',
    type: 'entry',
    occurredAt: entered.toISOString(),
    actorName: 'Dakota B.',
  });
  await suppressed.service.acknowledge(other.visit.id, { reason: 'No tool taken' });
  await suppressed.service.expireDueVisits(new Date(entered.getTime() + 30 * 60 * 1000));
  assert.equal((await suppressed.service.repo.listOutbox()).filter((row) => row.kind === 'visit_alert').length, 0);
  delete process.env.DOOR_ACK_SUPPRESSES_ALERT;
});

test('5 PM sweep is idempotent, flags overdue tools, and catches up the Chicago day', async () => {
  const now = zonedTimeToUtc(2026, 10, 6, 17, 5, 0);
  const { service, parts } = makeService({
    parts: [
      {
        id: 1,
        partNumber: '2892427',
        description: 'Liner puller',
        status: 'checked_out',
        checkedOutBy: 'Noah R.',
        checkedOutDate: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 2,
        partNumber: 'OLD-1',
        description: 'Old wrench',
        status: 'checked_out',
        checkedOutBy: 'Mario L.',
        checkedOutDate: new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString(),
      },
    ],
  });
  parts.push(...[]);
  await service.saveBadge({ actorName: 'Noah R.', techName: 'Noah R.', techEmail: 'noah@example.com' });
  const first = await service.runMaintenance(now);
  assert.equal(first.sweep.ran, true);
  assert.equal(first.sweep.dayKey, '2026-10-06');
  const second = await service.runMaintenance(new Date(now.getTime() + 60 * 1000));
  assert.equal(second.sweep.ran, false);
  const box = await service.repo.listOutbox();
  assert.equal(box.filter((row) => row.kind === 'eod_summary').length, 1);
  assert.equal(box.filter((row) => row.kind === 'eod_tech').length, 1);
  const techMail = box.find((row) => row.kind === 'eod_tech');
  assert.equal(techMail.to, 'noah@example.com');
  assert.equal(techMail.cc, 'jon.bennet@example.com');
  assert.match(techMail.text, /P#: 2892427/);
  assert.match(techMail.text, /please check it in ASAP or first thing on return tomorrow/i);
  const summary = box.find((row) => row.kind === 'eod_summary');
  assert.match(summary.text, /OVERDUE/);
  assert.match(summary.text, /OLD-1/);
  assert.equal(transportCalls, 0);

  const morningAfter = makeService({ parts: [] });
  const catchUp = await morningAfter.service.runEndOfDaySweep(zonedTimeToUtc(2026, 10, 7, 8, 0, 0));
  assert.equal(catchUp.dayKey, '2026-10-06');
});

test('dry_run never sends, and live without SMTP stays in the outbox with a warning', async () => {
  transportCalls = 0;
  process.env.ALERTS_MODE = 'dry_run';
  delete process.env.SMTP_HOST;
  const { service } = makeService();
  const entered = new Date(Date.now() - 60 * 1000);
  await service.ingestWebhook({
    eventId: 'dry',
    type: 'entry',
    occurredAt: entered.toISOString(),
    actorName: 'Devin S.',
  });
  await service.expireDueVisits(new Date(entered.getTime() + 20 * 60 * 1000));
  assert.equal(transportCalls, 0);
  assert.equal((await service.repo.listOutbox())[0].mode, 'dry_run');

  process.env.ALERTS_MODE = 'live';
  const live = makeService();
  await live.service.ingestWebhook({
    eventId: 'live-missing-smtp',
    type: 'entry',
    occurredAt: entered.toISOString(),
    actorName: 'Remington N.',
  });
  await live.service.expireDueVisits(new Date(entered.getTime() + 20 * 60 * 1000));
  const row = (await live.service.repo.listOutbox())[0];
  assert.equal(row.mode, 'dry_run');
  assert.equal(row.status, 'dry_run');
  assert.match(row.warning, /SMTP/);
  assert.equal(transportCalls, 0);
  assert.match(resolveAlertsMode().warning, /SMTP/);

  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_PORT = '587';
  process.env.ALERT_FROM = 'alerts@example.com';
  const sending = makeService();
  await sending.service.ingestWebhook({
    eventId: 'live-send',
    type: 'entry',
    occurredAt: entered.toISOString(),
    actorName: 'Steve J.',
  });
  await sending.service.expireDueVisits(new Date(entered.getTime() + 20 * 60 * 1000));
  assert.equal(transportCalls, 1);
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.ALERT_FROM;
  process.env.ALERTS_MODE = 'dry_run';
});

test('metrics exclude seeded history and simulated visits unless asked', async () => {
  const now = new Date('2026-10-06T18:00:00.000Z');
  const { service, transactions } = makeService({
    transactions: [
      {
        id: 1,
        action: 'checkout',
        user: 'Noah R.',
        partId: 4,
        partNumber: 'SEED-1',
        timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        batchKey: SEED_BATCH_KEY,
      },
      {
        id: 2,
        action: 'checkin',
        user: 'Noah R.',
        partId: 4,
        partNumber: 'SEED-1',
        checkoutId: 1,
        timestamp: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
        batchKey: SEED_BATCH_KEY,
      },
      {
        id: 3,
        action: 'checkout',
        user: 'Noah R.',
        partId: 8,
        partNumber: 'LIVE-1',
        timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 4,
        action: 'checkin',
        user: 'Noah R.',
        partId: 8,
        partNumber: 'LIVE-1',
        checkoutId: 3,
        timestamp: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      },
    ],
  });
  await service.saveBadge({ actorName: 'Noah R.', techName: 'Noah R.', techEmail: 'noah@example.com' });
  await service.ingestWebhook({
    eventId: 'real-door',
    type: 'entry',
    occurredAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    actorName: 'Noah R.',
  });
  await service.runMaintenance(now);
  await service.simulate({ techName: 'Kyler M.', type: 'entry', windowMinutes: 1, occurredAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString() });
  await service.runMaintenance(now);
  await service.repo.insertSweep({
    dayKey: '2026-10-06',
    ranAt: now.toISOString(),
    openCount: 2,
    items: [
      { user: 'Noah R.', partNumber: 'LIVE-1', overdue: false, seeded: false },
      { user: 'Noah R.', partNumber: 'SEED-1', overdue: true, seeded: true },
    ],
  });

  const hidden = await service.metrics({ days: 7, now });
  const noah = hidden.techs.find((row) => row.tech === 'Noah R.');
  assert.equal(noah.doorEntries, 1);
  assert.equal(noah.entriesWithoutCheckout, 1);
  assert.equal(noah.lateReturns, 1);
  assert.equal(noah.overdueItems, 0);
  assert.equal(noah.averageHoursOut, 2);
  assert.equal(hidden.techs.some((row) => row.tech === 'Kyler M.'), false);
  assert.equal(hidden.topOffenders[0].tech, 'Noah R.');

  const shown = await service.metrics({ days: 7, now, includeSeed: true, includeSimulated: true });
  const noahAll = shown.techs.find((row) => row.tech === 'Noah R.');
  assert.equal(noahAll.lateReturns, 2);
  assert.equal(noahAll.overdueItems, 1);
  assert.ok(shown.techs.some((row) => row.tech === 'Kyler M.' && row.doorEntries === 1));
  assert.equal(transactions[0].batchKey, SEED_BATCH_KEY);
});

test('simulate uses a short window and manage auth guards it on the app', async () => {
  const { service } = makeService();
  const result = await service.simulate({ techName: 'Danny C.', type: 'entry', windowMinutes: 1 });
  assert.equal(result.visit.source, 'simulated');
  assert.equal(result.visit.windowMinutes, 1);
  const deadline = new Date(result.visit.deadlineAt).getTime() - new Date(result.visit.enteredAt).getTime();
  assert.equal(deadline, 60 * 1000);

  process.env.DOOR_WEBHOOK_SECRET = 'test-door-secret';
  const app = express();
  app.use(express.json());
  registerDoorRoutes(app, service);
  const server = await listen(app);
  try {
    const denied = await request(server.address().port, {
      method: 'POST',
      path: '/api/door/simulate',
      body: { techName: 'Danny C.', type: 'entry', windowMinutes: 1 },
    });
    assert.equal(denied.status, 401);
    const session = issueManageSession('Floor Lead');
    const allowed = await request(server.address().port, {
      method: 'POST',
      path: '/api/door/simulate',
      body: { techName: 'Danny C.', type: 'exit' },
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(allowed.status, 201);
  } finally {
    server.close();
    delete process.env.DOOR_WEBHOOK_SECRET;
  }
});

test('webhook rejects bad event ids and times outside the window', async () => {
  const { service } = makeService();
  const now = new Date();
  const base = { type: 'entry', actorName: 'Noah R.', doorName: 'Tool Room' };
  const cases = [
    { eventId: 12345, occurredAt: now.toISOString() },
    { eventId: 'x'.repeat(201), occurredAt: now.toISOString() },
    { eventId: 'epoch', occurredAt: Date.now() },
    { eventId: 'old', occurredAt: '1970-01-01T00:00:00.000Z' },
    { eventId: 'far', occurredAt: '2999-01-01T00:00:00.000Z' },
    { eventId: 'space', occurredAt: '2026-10-06 15:00:00' },
  ];
  for (const body of cases) {
    const result = await service.ingestWebhook({ ...base, ...body }, now);
    assert.equal(result.ok, false, JSON.stringify(body));
    assert.equal(result.status, 400);
    assert.equal(result.error, 'invalid_event');
  }
  const unknown = await service.ingestWebhook({ eventId: 'unclassified', type: 'nope' }, now);
  assert.equal(unknown.ok, true);
  assert.equal(unknown.event.type, 'unknown');
  const named = await service.ingestWebhook({
    eventId: 'padded-name',
    type: 'entry',
    occurredAt: now.toISOString(),
    actorName: `  ${'Noah'.repeat(40)}  `,
    doorName: '  Tool Room  ',
  }, now);
  assert.equal(named.ok, true);
  assert.ok(named.event.actorName.length <= 120);
  assert.equal(named.event.actorName, named.event.actorName.trim());
  assert.equal(named.visit.doorName, 'Tool Room');
});

test('blank door secret is unconfigured and a padded secret still matches', async () => {
  const previous = process.env.DOOR_WEBHOOK_SECRET;
  const { service } = makeService();
  const app = express();
  app.use(express.json());
  registerDoorRoutes(app, service);
  const server = await listen(app);
  const port = server.address().port;
  try {
    process.env.DOOR_WEBHOOK_SECRET = '   ';
    const blank = await request(port, {
      method: 'POST',
      path: '/api/door/events',
      body: { eventId: 'blank', type: 'entry', occurredAt: new Date().toISOString(), actorName: 'Noah R.' },
      headers: { 'X-Door-Webhook-Secret': 'secret' },
    });
    assert.equal(blank.status, 503);
    assert.equal(blank.json.error, 'webhook_not_configured');

    process.env.DOOR_WEBHOOK_SECRET = '  test-door-secret  ';
    const padded = await request(port, {
      method: 'POST',
      path: '/api/door/events',
      body: { eventId: 'padded-secret', type: 'entry', occurredAt: new Date().toISOString(), actorName: 'Noah R.' },
      headers: { 'X-Door-Webhook-Secret': 'test-door-secret' },
    });
    assert.equal(padded.status, 201);
  } finally {
    server.close();
    if (previous == null) delete process.env.DOOR_WEBHOOK_SECRET;
    else process.env.DOOR_WEBHOOK_SECRET = previous;
  }
});

test('failed door secrets are limited separately from a correct secret', async () => {
  const previous = process.env.DOOR_WEBHOOK_SECRET;
  process.env.DOOR_WEBHOOK_SECRET = 'test-door-secret';
  const { service } = makeService();
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  registerDoorRoutes(app, service);
  const server = await listen(app);
  const port = server.address().port;
  const ip = '203.0.113.210';
  try {
    const statuses = [];
    for (let i = 0; i < 11; i += 1) {
      const response = await request(port, {
        method: 'POST',
        path: '/api/door/events',
        body: { eventId: `bad-${i}`, type: 'entry', occurredAt: new Date().toISOString(), actorName: 'Noah R.' },
        headers: { 'X-Door-Webhook-Secret': 'nope', 'X-Forwarded-For': ip },
      });
      statuses.push(response.status);
    }
    assert.equal(statuses.filter((status) => status === 401).length, 10);
    assert.equal(statuses[10], 429);
    const allowed = await request(port, {
      method: 'POST',
      path: '/api/door/events',
      body: { eventId: 'after-failures', type: 'entry', occurredAt: new Date().toISOString(), actorName: 'Noah R.' },
      headers: { 'X-Door-Webhook-Secret': 'test-door-secret', 'X-Forwarded-For': ip },
    });
    assert.equal(allowed.status, 201);
  } finally {
    server.close();
    if (previous == null) delete process.env.DOOR_WEBHOOK_SECRET;
    else process.env.DOOR_WEBHOOK_SECRET = previous;
  }
});

test('adversarial email bodies answer quickly and health stays up', async () => {
  const previousSecret = process.env.DOOR_WEBHOOK_SECRET;
  const previousPlatform = process.env.PLATFORM_PASSWORD;
  process.env.DOOR_WEBHOOK_SECRET = 'test-door-secret';
  process.env.PLATFORM_PASSWORD = 'test-platform-password';
  const app = require('../server');
  const server = await listen(app);
  const port = server.address().port;
  const sendRaw = (raw, ip) => new Promise((resolve, reject) => {
    const payload = Buffer.from(raw);
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/door/email-inbound',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        'X-Door-Webhook-Secret': 'test-door-secret',
        'X-Forwarded-For': ip,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (error) { json = null; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
  try {
    const medium = `{"subject":"x","text":"${'A'.repeat(50 * 1024)}"}`;
    const huge = `{"subject":"x","text":"${'A'.repeat(1024 * 1024)}"}`;
    const started = Date.now();
    const healthPromise = request(port, { path: '/api/health', headers: { 'X-Forwarded-For': '203.0.113.80' } });
    const mediumResult = await sendRaw(medium, '203.0.113.81');
    const health = await healthPromise;
    const mediumMs = Date.now() - started;
    assert.ok(mediumMs < 200, `50KB body took ${mediumMs}ms`);
    assert.equal(health.status, 200);
    assert.notEqual(mediumResult.status, 500);
    assert.equal(mediumResult.json && mediumResult.json.details, undefined);
    assert.equal(mediumResult.json && mediumResult.json.message, undefined);

    const hugeStarted = Date.now();
    const healthAgain = request(port, { path: '/api/health', headers: { 'X-Forwarded-For': '203.0.113.82' } });
    const hugeResult = await sendRaw(huge, '203.0.113.83');
    const health2 = await healthAgain;
    const hugeMs = Date.now() - hugeStarted;
    assert.ok(hugeMs < 200, `1MB body took ${hugeMs}ms`);
    assert.equal(hugeResult.status, 413);
    assert.equal(hugeResult.json.error, 'payload_too_large');
    assert.equal(health2.status, 200);

    const malformed = await sendRaw('{', '203.0.113.84');
    assert.equal(malformed.status, 400);
    assert.equal(malformed.json.error, 'invalid_body');
    assert.equal(malformed.json.details, undefined);
    assert.equal(malformed.json.message, undefined);
  } finally {
    server.close();
    if (previousSecret == null) delete process.env.DOOR_WEBHOOK_SECRET;
    else process.env.DOOR_WEBHOOK_SECRET = previousSecret;
    if (previousPlatform == null) delete process.env.PLATFORM_PASSWORD;
    else process.env.PLATFORM_PASSWORD = previousPlatform;
  }
});

test('end of day emails leave seeded checkouts out', async () => {
  const now = zonedTimeToUtc(2026, 10, 6, 17, 5, 0);
  const { service, repo } = makeService({
    parts: [
      { id: 1, partNumber: 'SEED-9', description: 'Seeded tool', status: 'checked_out', checkedOutBy: 'Noah R.', checkedOutDate: '2026-10-05T15:00:00.000Z' },
      { id: 2, partNumber: 'LIVE-9', description: 'Live tool', status: 'checked_out', checkedOutBy: 'Noah R.', checkedOutDate: '2026-10-06T16:00:00.000Z' },
    ],
    transactions: [
      { id: 1, action: 'checkout', user: 'Noah R.', partId: 1, partNumber: 'SEED-9', timestamp: '2026-10-05T15:00:00.000Z', batchKey: SEED_BATCH_KEY },
      { id: 2, action: 'checkout', user: 'Noah R.', partId: 2, partNumber: 'LIVE-9', timestamp: '2026-10-06T16:00:00.000Z' },
    ],
  });
  await service.saveBadge({ actorName: 'Noah R.', techName: 'Noah R.', techEmail: 'noah@example.com' });
  const sweep = await service.runEndOfDaySweep(now);
  assert.equal(sweep.ran, true);
  assert.equal(sweep.openCount, 1);
  const stored = await repo.findSweep(sweep.dayKey);
  assert.equal(stored.items.some((item) => item.partNumber === 'SEED-9'), false);
  assert.equal(stored.items.some((item) => item.partNumber === 'LIVE-9'), true);
  const outbox = await repo.listOutbox();
  const summary = outbox.find((row) => row.kind === 'eod_summary');
  const tech = outbox.find((row) => row.kind === 'eod_tech');
  assert.match(summary.text, /LIVE-9/);
  assert.doesNotMatch(summary.text, /SEED-9/);
  assert.match(tech.text, /LIVE-9/);
  assert.doesNotMatch(tech.text, /SEED-9/);
});

test('padded SMTP settings still count as configured', () => {
  const previous = {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    from: process.env.ALERT_FROM,
  };
  process.env.SMTP_HOST = ' smtp.example.com ';
  process.env.SMTP_PORT = ' 587 ';
  process.env.ALERT_FROM = ' alerts@example.com ';
  try {
    assert.equal(smtpConfigured(), true);
  } finally {
    if (previous.host == null) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = previous.host;
    if (previous.port == null) delete process.env.SMTP_PORT;
    else process.env.SMTP_PORT = previous.port;
    if (previous.from == null) delete process.env.ALERT_FROM;
    else process.env.ALERT_FROM = previous.from;
  }
});

test('server.js keeps proxy trust, the global limiter key, and door middleware order', () => {
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const trust = source.indexOf("app.set('trust proxy', trustProxyHops())");
  const key = source.indexOf('keyGenerator: clientRateLimitKey');
  const legacy = source.indexOf('legacyHeaders: true');
  const standard = source.indexOf('standardHeaders: false');
  const doorParser = source.indexOf('app.use(doorWebhookBodyParser)');
  const globalParser = source.indexOf("app.use(express.json({ limit: '2mb' }))");
  const gate = source.indexOf("app.use('/api', requirePlatformSession)");
  const routes = source.indexOf('registerDoorRoutes(app, doorService)');
  assert.ok(trust !== -1);
  assert.ok(trust < key);
  assert.ok(key < doorParser);
  assert.ok(legacy !== -1 && legacy < doorParser);
  assert.ok(standard !== -1 && standard < doorParser);
  assert.match(source, /max:\s*100/);
  assert.ok(doorParser < globalParser);
  assert.ok(globalParser < gate);
  assert.ok(gate < routes);

  const limiterSource = fs.readFileSync(path.join(__dirname, '../middleware/doorRateLimit.js'), 'utf8');
  assert.match(limiterSource, /keyGenerator:\s*clientRateLimitKey/);
  assert.match(limiterSource, /max:\s*10/);
  assert.match(limiterSource, /max:\s*600/);
  assert.equal(limiterSource.includes('TODO'), false);
  assert.equal(limiterSource.includes('req.ip'), false);

  const { trustProxyHops } = require('../middleware/clientIp');
  const app = require('../server');
  assert.equal(app.get('trust proxy'), trustProxyHops());
});

test('only the exact door webhook posts skip the platform token', async () => {
  const previousSecret = process.env.DOOR_WEBHOOK_SECRET;
  const previousPlatform = process.env.PLATFORM_PASSWORD;
  process.env.DOOR_WEBHOOK_SECRET = 'test-door-secret';
  process.env.PLATFORM_PASSWORD = 'test-platform-password';
  const app = require('../server');
  const server = await listen(app);
  const port = server.address().port;
  const secret = { 'X-Door-Webhook-Secret': 'test-door-secret' };
  const body = {
    eventId: `matrix-${Date.now()}`,
    type: 'entry',
    occurredAt: new Date().toISOString(),
    actorName: 'Noah R.',
  };
  try {
    const events = await request(port, {
      method: 'POST',
      path: '/api/door/events',
      body,
      headers: { ...secret, 'X-Forwarded-For': '198.51.100.60' },
    });
    assert.equal(events.status, 201);
    assert.notEqual(events.json.error, 'platform_token_required');

    const chicago = chicagoParts(new Date());
    const emailStamp = `${chicago.year}-${String(chicago.month).padStart(2, '0')}-${String(chicago.day).padStart(2, '0')} ${String(chicago.hour).padStart(2, '0')}:${String(chicago.minute).padStart(2, '0')}`;
    const email = await request(port, {
      method: 'POST',
      path: '/api/door/email-inbound',
      body: { subject: 'Tool room door', text: `Noah R. entered the tool room at ${emailStamp}` },
      headers: { ...secret, 'X-Forwarded-For': '198.51.100.61' },
    });
    assert.equal(email.status, 201);
    assert.notEqual(email.json.error, 'platform_token_required');

    const variants = [
      ['POST', '/api/door/events/'],
      ['POST', '/api/door/email-inbound/'],
      ['POST', '/api/door/Events'],
      ['POST', '/api/door/Email-Inbound'],
      ['POST', '/API/door/events'],
      ['POST', '/API/door/email-inbound'],
      ['POST', '/api/door/%65vents'],
      ['POST', '/api/door/e%76ents'],
      ['POST', '/api/door/events%2Fextra'],
      ['POST', '/api/door/%65mail-inbound'],
      ['POST', '/api/door/email-inbound%2Fextra'],
      ['POST', '/api/door/./events'],
      ['POST', '/api/door/foo/../events'],
      ['POST', '/api/door/./email-inbound'],
      ['POST', '/api/door/foo/../email-inbound'],
      ['POST', '/api/door/events;param'],
      ['POST', '/api/door/email-inbound;x'],
      ['GET', '/api/door/events'],
      ['PUT', '/api/door/events'],
      ['DELETE', '/api/door/events'],
      ['PATCH', '/api/door/events'],
      ['GET', '/api/door/email-inbound'],
      ['PUT', '/api/door/email-inbound'],
      ['DELETE', '/api/door/email-inbound'],
    ];
    for (const [index, [method, reqPath]] of variants.entries()) {
      const response = await request(port, {
        method,
        path: reqPath,
        body: { ...body, eventId: `variant-${index}` },
        headers: { ...secret, 'X-Forwarded-For': `198.51.100.${70 + (index % 20)}` },
      });
      assert.equal(response.status, 401, `${method} ${reqPath} -> ${response.status} ${response.text}`);
      assert.equal(response.json && response.json.error, 'platform_token_required', `${method} ${reqPath}`);
    }

    const wrongPassword = await request(port, {
      method: 'POST',
      path: '/api/auth/platform',
      body: { password: 'not-the-shop-password' },
      headers: { 'X-Forwarded-For': '198.51.100.91' },
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.json.error, 'incorrect_password');
  } finally {
    server.close();
    if (previousSecret == null) delete process.env.DOOR_WEBHOOK_SECRET;
    else process.env.DOOR_WEBHOOK_SECRET = previousSecret;
    if (previousPlatform == null) delete process.env.PLATFORM_PASSWORD;
    else process.env.PLATFORM_PASSWORD = previousPlatform;
  }
});

test('a valid door webhook burst is not rate limited and a spoofed client ip stays in the same bucket', async () => {
  const previousSecret = process.env.DOOR_WEBHOOK_SECRET;
  const previousPlatform = process.env.PLATFORM_PASSWORD;
  process.env.DOOR_WEBHOOK_SECRET = 'test-door-secret';
  process.env.PLATFORM_PASSWORD = 'test-platform-password';
  const app = require('../server');
  const server = await listen(app);
  const port = server.address().port;
  const ip = '198.51.100.77';
  const occurredAt = new Date().toISOString();
  try {
    const accepted = await Promise.all(Array.from({ length: 100 }, (_, index) => request(port, {
      method: 'POST',
      path: '/api/door/events',
      body: {
        eventId: `burst-${index}`,
        type: 'entry',
        occurredAt,
        actorName: 'Noah R.',
      },
      headers: {
        'X-Door-Webhook-Secret': 'test-door-secret',
        'X-Forwarded-For': ip,
      },
    })));
    const acceptedStatuses = accepted.map((response) => response.status);
    assert.equal(acceptedStatuses.filter((status) => status === 429).length, 0);
    assert.equal(acceptedStatuses.filter((status) => status === 201).length, 100);

    const failed = [];
    for (let index = 0; index < 11; index += 1) {
      const response = await request(port, {
        method: 'POST',
        path: '/api/door/events',
        body: { eventId: `burst-bad-${index}`, type: 'entry', occurredAt, actorName: 'Noah R.' },
        headers: {
          'X-Door-Webhook-Secret': 'wrong-secret',
          'X-Forwarded-For': ip,
        },
      });
      failed.push(response);
    }
    assert.equal(failed.slice(0, 10).every((response) => response.status === 401), true);
    assert.equal(failed.slice(0, 10).every((response) => response.json.error === 'webhook_secret_rejected'), true);
    assert.equal(failed[10].status, 429);
    assert.equal(failed[10].json.error, 'door_rate_limited');

    const spoofedForwarded = await request(port, {
      method: 'POST',
      path: '/api/door/events',
      body: { eventId: 'burst-spoof-xff', type: 'entry', occurredAt, actorName: 'Noah R.' },
      headers: {
        'X-Door-Webhook-Secret': 'wrong-secret',
        'X-Forwarded-For': `203.0.113.9, ${ip}`,
        'CF-Connecting-IP': '1.1.1.1',
      },
    });
    assert.equal(spoofedForwarded.status, 429);
    assert.equal(spoofedForwarded.json.error, 'door_rate_limited');

    const spoofedCloudflare = await request(port, {
      method: 'POST',
      path: '/api/door/events',
      body: { eventId: 'burst-spoof-cf', type: 'entry', occurredAt, actorName: 'Noah R.' },
      headers: {
        'X-Door-Webhook-Secret': 'wrong-secret',
        'X-Forwarded-For': ip,
        'CF-Connecting-IP': '203.0.113.50',
      },
    });
    assert.equal(spoofedCloudflare.status, 429);
    assert.equal(spoofedCloudflare.json.error, 'door_rate_limited');
  } finally {
    server.close();
    if (previousSecret == null) delete process.env.DOOR_WEBHOOK_SECRET;
    else process.env.DOOR_WEBHOOK_SECRET = previousSecret;
    if (previousPlatform == null) delete process.env.PLATFORM_PASSWORD;
    else process.env.PLATFORM_PASSWORD = previousPlatform;
  }
});
