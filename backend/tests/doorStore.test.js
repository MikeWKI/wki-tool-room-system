const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
delete process.env.DOOR_STORE;

const DatabaseService = require('../services/DatabaseService');
const { PersistentDoorRepository } = require('../services/door/repository');
const { DoorService } = require('../services/door/doorService');

function recentIso() {
  return new Date().toISOString();
}

async function jsonStack(dir) {
  const db = new DatabaseService();
  db.useMongoDb = false;
  db.DB_DIR = dir;
  db.TRANSACTIONS_FILE = path.join(dir, 'transactions.json');
  db.PARTS_FILE = path.join(dir, 'parts.json');
  db.SHELVES_FILE = path.join(dir, 'shelves.json');
  db.AUDIT_BATCH_FILE = path.join(dir, 'audit-batches.json');
  const repo = new PersistentDoorRepository(db, { dir });
  let fullRewrites = 0;
  const service = new DoorService({
    repo,
    async readTransactions() {
      return db.getTransactions();
    },
    async readParts() {
      return [];
    },
    async writeAudit(entry) {
      fullRewrites += 1;
      return db.appendTransaction(entry);
    },
  });
  return { db, repo, service, fullRewrites: () => fullRewrites };
}

test('parallel json webhooks keep every distinct event and existing rows', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'door-json-'));
  const prior = [{
    id: 7,
    partNumber: 'KEEP',
    action: 'checkout',
    user: 'Noah R.',
    timestamp: recentIso(),
  }];
  await fs.writeFile(path.join(dir, 'transactions.json'), JSON.stringify(prior));
  const { service } = await jsonStack(dir);
  const occurredAt = recentIso();
  const results = await Promise.all(Array.from({ length: 40 }, (_, index) => service.ingestWebhook({
    eventId: `parallel-${index}`,
    type: 'entry',
    occurredAt,
    actorName: 'Noah R.',
    doorName: 'Tool Room',
  })));
  assert.equal(results.filter((row) => row.ok && !row.duplicate).length, 40);
  assert.equal(results.some((row) => row.status === 500), false);

  const events = JSON.parse(await fs.readFile(path.join(dir, 'door-events.json'), 'utf8'));
  const transactions = JSON.parse(await fs.readFile(path.join(dir, 'transactions.json'), 'utf8'));
  assert.equal(events.length, 40);
  assert.equal(new Set(events.map((row) => row.eventId)).size, 40);
  assert.equal(transactions.length, 41);
  assert.equal(transactions.some((row) => row.id === 7 && row.partNumber === 'KEEP'), true);
  assert.equal(transactions.filter((row) => row.action === 'door_entry').length, 40);

  const duplicates = await Promise.all(Array.from({ length: 20 }, () => service.ingestWebhook({
    eventId: 'same-event',
    type: 'entry',
    occurredAt,
    actorName: 'Laryssa J.',
  })));
  assert.equal(duplicates.every((row) => row.ok), true);
  assert.equal(duplicates.filter((row) => !row.duplicate).length, 1);
  assert.equal(duplicates.some((row) => row.status === 500), false);
  const after = JSON.parse(await fs.readFile(path.join(dir, 'door-events.json'), 'utf8'));
  assert.equal(after.filter((row) => row.eventId === 'same-event').length, 1);
  const kept = JSON.parse(await fs.readFile(path.join(dir, 'transactions.json'), 'utf8'));
  assert.equal(kept.some((row) => row.id === 7 && row.partNumber === 'KEEP'), true);
});

test('a corrupt transaction file is not treated as empty and is not overwritten', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'door-corrupt-'));
  const file = path.join(dir, 'transactions.json');
  await fs.writeFile(file, '{');
  const { db } = await jsonStack(dir);
  await assert.rejects(() => db.appendTransaction({
    id: 1,
    partNumber: 'DOOR',
    action: 'door_entry',
    user: 'System',
    timestamp: recentIso(),
  }), (error) => error.code === 'STORE_READ_FAILED');
  assert.equal(await fs.readFile(file, 'utf8'), '{');
});

test('mongo door and audit writes insert one row and never replace the collection', async () => {
  const events = new Map();
  const visits = [];
  const audits = [];
  const calls = { insertOne: 0, create: 0, deleteMany: 0, insertMany: 0 };

  function lean(value) {
    return { lean: async () => value };
  }

  const DoorEvent = {
    async create(doc) {
      calls.create += 1;
      if (events.has(doc.eventId)) {
        const error = new Error('duplicate');
        error.code = 11000;
        throw error;
      }
      events.set(doc.eventId, doc);
      return doc;
    },
    findOne(query) {
      return lean(events.get(query.eventId) || null);
    },
    find() {
      return lean([...events.values()]);
    },
    async deleteMany() {
      calls.deleteMany += 1;
    },
    async insertMany() {
      calls.insertMany += 1;
    },
  };
  const DoorVisit = {
    async create(doc) {
      visits.push(doc);
      return doc;
    },
    findOne() {
      return lean(null);
    },
    find() {
      return lean(visits);
    },
  };
  const BadgeMap = {
    find() {
      return lean([]);
    },
  };
  const EmailOutbox = {
    async create(doc) {
      return doc;
    },
    find() {
      return { sort: () => lean([]) };
    },
  };
  const SweepRun = {
    async create(doc) {
      return doc;
    },
    findOne() {
      return lean(null);
    },
    find() {
      return lean([]);
    },
  };
  const Transaction = {
    async insertOne(doc) {
      calls.insertOne += 1;
      audits.push(doc);
      return doc;
    },
    async create(doc) {
      calls.create += 1;
      audits.push(doc);
      return doc;
    },
    async deleteMany() {
      calls.deleteMany += 1;
    },
    async insertMany() {
      calls.insertMany += 1;
    },
  };

  const db = new DatabaseService();
  db.useMongoDb = true;
  db._transactionModel = Transaction;
  const repo = new PersistentDoorRepository(db, {
    models: { DoorEvent, BadgeMap, DoorVisit, EmailOutbox, SweepRun },
  });
  const service = new DoorService({
    repo,
    async readTransactions() {
      return audits;
    },
    async readParts() {
      return [];
    },
    writeAudit: (entry) => db.appendTransaction(entry),
  });

  const occurredAt = recentIso();
  const results = await Promise.all([
    service.ingestWebhook({ eventId: 'mongo-1', type: 'entry', occurredAt, actorName: 'Noah R.' }),
    service.ingestWebhook({ eventId: 'mongo-1', type: 'entry', occurredAt, actorName: 'Noah R.' }),
    service.ingestWebhook({ eventId: 'mongo-2', type: 'entry', occurredAt, actorName: 'Laryssa J.' }),
  ]);
  assert.equal(results.filter((row) => row.ok && !row.duplicate).length, 2);
  assert.equal(results.filter((row) => row.duplicate).length, 1);
  assert.equal(calls.deleteMany, 0);
  assert.equal(calls.insertMany, 0);
  assert.equal(calls.insertOne, audits.length);
  assert.ok(calls.insertOne >= 2);
  assert.equal(events.size, 2);
  assert.ok(audits.every((row) => row.action === 'door_entry'));
});
