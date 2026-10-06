const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wki-parts-'));
process.env.WKI_DATA_DIR = dataDir;
process.env.PLATFORM_PASSWORD = 'test-platform-password';
process.env.MANAGE_PIN = 'test-manage-pin';
process.env.NODE_ENV = 'test';
delete process.env.MONGODB_URI;
delete process.env.SESSION_SECRET;

const app = require('../server');
delete process.env.MONGODB_URI;

const { issuePlatformSession } = require('../middleware/platformAuth');
const { Part, Transaction } = require('../models');

const TECH = 'TECHNAME_QUINN_ZX81';
const SECRET = 'Radial impeller secret';
const PART_COUNT = 120;
const REQUESTS = 50;
const ACTIVE_PARTS = 10;
const MULTI_ID = 50;
const ZERO_ID = 51;
const MULTI_QTY = 3;

function makeParts() {
  return Array.from({ length: PART_COUNT }, (_, index) => ({
    id: index + 1,
    partNumber: `PN-${index + 1}`,
    description: index === 0 ? SECRET : `Part ${index + 1}`,
    shelf: 'A-01',
    category: 'General',
    status: 'available',
    checkedOutBy: null,
    checkedOutDate: null,
    quantity: 1,
    minQuantity: 1,
  }));
}

function request(port, { method = 'GET', path: reqPath, body, headers = {}, ip = '203.0.113.10' }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
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
          resolve({ status: res.statusCode, json, text });
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

async function capture(fn) {
  const logs = [];
  const original = console.error;
  console.error = (...args) => {
    logs.push(args.map((item) => (typeof item === 'string' ? item : util.inspect(item, { depth: 6 }))).join(' '));
  };
  try {
    const result = await fn();
    return { result, logs };
  } finally {
    console.error = original;
  }
}

function assertClean(logs, label) {
  const text = logs.join('\n');
  assert.equal(text.includes(TECH), false, `${label} logged a tech name: ${text}`);
  assert.equal(text.includes(SECRET), false, `${label} logged a part description: ${text}`);
  assert.equal(text.includes('checkedOutBy'), false, `${label} logged a part field: ${text}`);
  assert.equal(text.includes('E11000'), false, `${label} logged E11000: ${text}`);
  assert.equal(text.includes('PN-1'), false, `${label} logged a part number: ${text}`);
}

function tally(responses) {
  const successes = responses.filter((row) => row.status === 200 && row.json && row.json.success);
  const conflicts = responses.filter((row) => row.status === 400);
  const failures = responses.filter((row) => row.status >= 500 || (row.status !== 200 && row.status !== 400));
  return { successes, conflicts, failures };
}

async function setPartState(partsFile, fieldsById) {
  if (app.dbService.useMongoDb) {
    for (const [id, fields] of Object.entries(fieldsById)) {
      await Part.updateOne({ id: Number(id) }, { $set: fields });
    }
    return;
  }
  const parts = JSON.parse(await fs.promises.readFile(partsFile, 'utf8'));
  for (const part of parts) {
    if (fieldsById[part.id]) Object.assign(part, fieldsById[part.id]);
  }
  await fs.promises.writeFile(partsFile, JSON.stringify(parts, null, 2));
}

/**
 * Old checkout (e2cdef3) sets status to checked_out on every success.
 * A quantity-3 part accepts one checkout, then rejects the next three
 * until check-in puts it back to available and adds the unit back.
 */
async function assertOldMultiQuantityRules(call, platform, partsFile, ipPrefix) {
  await setPartState(partsFile, {
    [MULTI_ID]: {
      quantity: MULTI_QTY,
      status: 'available',
      checkedOutBy: null,
      checkedOutDate: null,
    },
    [ZERO_ID]: {
      quantity: 0,
      status: 'checked_out',
      checkedOutBy: 'Prior Tech',
      checkedOutDate: '2026-01-01T00:00:00.000Z',
    },
  });

  const checkout = (ipSuffix) => call({
    method: 'POST',
    path: `/api/parts/${MULTI_ID}/checkout`,
    headers: platform,
    ip: `${ipPrefix}.${ipSuffix}`,
    body: { user: TECH, notes: 'multi', roNumber: 'RO-9', unitNumber: 'U-3' },
  });
  const checkin = (id, ipSuffix) => call({
    method: 'POST',
    path: `/api/parts/${id}/checkin`,
    headers: platform,
    ip: `${ipPrefix}.${ipSuffix}`,
    body: { user: TECH, notes: 'multi' },
  });

  const first = await checkout(1);
  assert.equal(first.status, 200);
  assert.equal(first.json.success, true);
  assert.equal(first.json.part.quantity, MULTI_QTY - 1);
  assert.equal(first.json.part.status, 'checked_out');
  assert.equal(first.json.part.checkedOutBy, TECH);
  assert.equal(typeof first.json.part.checkedOutDate, 'string');
  assert.equal(first.json.transaction.action, 'checkout');
  assert.equal(first.json.transaction.user, TECH);
  assert.equal(first.json.transaction.partNumber, `PN-${MULTI_ID}`);
  assert.equal(first.json.transaction.quantityBefore, MULTI_QTY);
  assert.equal(first.json.transaction.quantityAfter, MULTI_QTY - 1);
  assert.equal(first.json.transaction.notes, 'multi');
  assert.equal(first.json.transaction.roNumber, 'RO-9');
  assert.equal(first.json.transaction.unitNumber, 'U-3');

  for (let attempt = 2; attempt <= 4; attempt += 1) {
    const denied = await checkout(attempt);
    assert.equal(denied.status, 400, `checkout ${attempt}`);
    assert.equal(denied.json.error, 'Part is already checked out');
  }

  const held = await call({
    method: 'GET',
    path: `/api/parts/${MULTI_ID}`,
    headers: platform,
    ip: `${ipPrefix}.10`,
  });
  assert.equal(held.json.quantity, MULTI_QTY - 1);
  assert.equal(held.json.status, 'checked_out');
  assert.equal(held.json.checkedOutBy, TECH);

  const returned = await checkin(MULTI_ID, 11);
  assert.equal(returned.status, 200);
  assert.equal(returned.json.success, true);
  assert.equal(returned.json.part.quantity, MULTI_QTY);
  assert.equal(returned.json.part.status, 'available');
  assert.equal(returned.json.part.checkedOutBy, null);
  assert.equal(returned.json.part.checkedOutDate, null);
  assert.equal(returned.json.transaction.action, 'checkin');
  assert.equal(returned.json.transaction.user, TECH);
  assert.equal(returned.json.transaction.notes, 'multi');
  assert.equal(returned.json.transaction.quantityBefore, MULTI_QTY - 1);
  assert.equal(returned.json.transaction.quantityAfter, MULTI_QTY);
  assert.equal(returned.json.transaction.roNumber, undefined);

  const extraIn = await checkin(MULTI_ID, 12);
  assert.equal(extraIn.status, 400);
  assert.equal(extraIn.json.error, 'Part is not checked out');

  const zeroCheckout = await call({
    method: 'POST',
    path: `/api/parts/${ZERO_ID}/checkout`,
    headers: platform,
    ip: `${ipPrefix}.13`,
    body: { user: TECH },
  });
  assert.equal(zeroCheckout.status, 400);
  assert.equal(zeroCheckout.json.error, 'Part is already checked out');

  const zeroIn = await checkin(ZERO_ID, 14);
  assert.equal(zeroIn.status, 200);
  assert.equal(zeroIn.json.part.quantity, 1);
  assert.equal(zeroIn.json.part.status, 'available');
  assert.equal(zeroIn.json.part.checkedOutBy, null);
  assert.equal(zeroIn.json.part.checkedOutDate, null);

  const parallel = await Promise.all(
    Array.from({ length: 12 }, (_, index) => checkout(20 + index))
  );
  const wins = parallel.filter((row) => row.status === 200);
  const blocked = parallel.filter((row) => row.status === 400);
  const errors = parallel.filter((row) => row.status >= 500);
  assert.equal(errors.length, 0);
  assert.equal(wins.length, 1);
  assert.equal(blocked.length, 11);
  assert.equal(wins[0].json.part.quantity, MULTI_QTY - 1);
  assert.equal(wins[0].json.part.status, 'checked_out');
  assert.equal(wins[0].json.part.checkedOutBy, TECH);
  for (const row of blocked) {
    assert.equal(row.json.error, 'Part is already checked out');
  }
  const stored = await call({
    method: 'GET',
    path: `/api/parts/${MULTI_ID}`,
    headers: platform,
    ip: `${ipPrefix}.40`,
  });
  assert.equal(stored.json.quantity, MULTI_QTY - 1);
  assert.ok(stored.json.quantity >= 0);
  assert.equal(stored.json.status, 'checked_out');
}

test('parts and transactions survive parallel checkouts', { timeout: 180000 }, async () => {
  const server = await listen(app);
  const port = server.address().port;
  const call = (options) => request(port, options);
  const platform = { 'X-Platform-Token': issuePlatformSession().token };
  const partsFile = path.join(dataDir, 'parts.json');
  const transactionsFile = path.join(dataDir, 'transactions.json');
  const summary = {};

  try {
    const corrupt = `{"checkedOutBy":"${TECH}","description":"${SECRET}"`;
    await fs.promises.writeFile(partsFile, corrupt);
    const parsed = await capture(() => call({
      method: 'GET',
      path: '/api/parts',
      headers: platform,
      ip: '203.0.113.210',
    }));
    assert.equal(parsed.result.status, 503);
    assert.equal(parsed.result.json.error, 'store_unavailable');
    assert.equal(parsed.result.text.includes(TECH), false);
    assert.equal(parsed.result.text.includes(SECRET), false);
    assertClean(parsed.logs, 'json parse');
    assert.equal(await fs.promises.readFile(partsFile, 'utf8'), corrupt);

    const seed = makeParts();
    await fs.promises.writeFile(partsFile, JSON.stringify(seed, null, 2));
    await fs.promises.writeFile(transactionsFile, '[]');

    const jsonBurst = await capture(() => Promise.all(Array.from({ length: REQUESTS }, (_, index) => {
      const id = (index % ACTIVE_PARTS) + 1;
      return call({
        method: 'POST',
        path: `/api/parts/${id}/checkout`,
        headers: platform,
        ip: `203.0.113.${index + 1}`,
        body: { user: TECH, notes: 'parallel' },
      });
    })));
    assertClean(jsonBurst.logs, 'json checkout');
    const jsonTallied = tally(jsonBurst.result);
    assert.equal(jsonTallied.failures.length, 0, JSON.stringify(jsonTallied.failures.map((row) => row.status)));
    assert.equal(jsonTallied.successes.length, ACTIVE_PARTS);
    assert.equal(jsonTallied.conflicts.length, REQUESTS - ACTIVE_PARTS);
    for (const row of jsonTallied.conflicts) {
      assert.equal(row.json.error, 'Part is already checked out');
    }
    for (const row of jsonTallied.successes) {
      assert.equal(row.json.part.status, 'checked_out');
      assert.equal(row.json.part.checkedOutBy, TECH);
      assert.equal(row.json.part.quantity, 0);
      assert.equal(row.json.transaction.action, 'checkout');
      assert.equal(row.json.transaction.user, TECH);
      assert.equal(row.json.transaction.quantityBefore, 1);
      assert.equal(row.json.transaction.quantityAfter, 0);
    }

    const jsonParts = JSON.parse(await fs.promises.readFile(partsFile, 'utf8'));
    const jsonTransactions = JSON.parse(await fs.promises.readFile(transactionsFile, 'utf8'));
    assert.equal(jsonParts.length, PART_COUNT);
    assert.equal(jsonTransactions.length, jsonTallied.successes.length);
    assert.equal(jsonTransactions.filter((row) => row.action === 'checkout').length, ACTIVE_PARTS);
    assert.equal(jsonParts.filter((row) => row.status === 'checked_out').length, ACTIVE_PARTS);
    assert.equal(jsonParts.reduce((sum, row) => sum + row.quantity, 0), PART_COUNT - ACTIVE_PARTS);
    summary.json = {
      before: PART_COUNT,
      after: jsonParts.length,
      successes: jsonTallied.successes.length,
      conflicts: jsonTallied.conflicts.length,
      transactions: jsonTransactions.length,
      serverErrors: jsonTallied.failures.length,
    };

    await assertOldMultiQuantityRules(call, platform, partsFile, '192.0.2');
    const jsonAfterMulti = JSON.parse(await fs.promises.readFile(partsFile, 'utf8'));
    assert.equal(jsonAfterMulti.length, PART_COUNT);
    const jsonMulti = jsonAfterMulti.find((row) => row.id === MULTI_ID);
    assert.equal(jsonMulti.quantity, MULTI_QTY - 1);
    assert.equal(jsonMulti.status, 'checked_out');
    assert.ok(jsonAfterMulti.every((row) => row.quantity >= 0));

    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongoose = require('mongoose');
    const mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();
    assert.match(mongoUri, /127\.0\.0\.1|localhost/);
    process.env.MONGODB_URI = mongoUri;
    await app.dbService.initialize();
    assert.equal(app.dbService.useMongoDb, true);

    await Part.deleteMany({});
    await Transaction.deleteMany({});
    await Part.insertMany(seed);
    assert.equal(await Part.countDocuments(), PART_COUNT);

    const jsonPartsAfterInit = await fs.promises.readFile(partsFile, 'utf8');
    const jsonTxAfterInit = await fs.promises.readFile(transactionsFile, 'utf8');

    let partDeletes = 0;
    let txDeletes = 0;
    let partInsertMany = 0;
    let txInsertMany = 0;
    const partDeleteMany = Part.deleteMany;
    const txDeleteMany = Transaction.deleteMany;
    const partInsertManyFn = Part.insertMany;
    const txInsertManyFn = Transaction.insertMany;
    Part.deleteMany = function counted(...args) {
      partDeletes += 1;
      return partDeleteMany.apply(this, args);
    };
    Transaction.deleteMany = function counted(...args) {
      txDeletes += 1;
      return txDeleteMany.apply(this, args);
    };
    Part.insertMany = function counted(...args) {
      partInsertMany += 1;
      return partInsertManyFn.apply(this, args);
    };
    Transaction.insertMany = function counted(...args) {
      txInsertMany += 1;
      return txInsertManyFn.apply(this, args);
    };

    try {
      const mongoBurst = await capture(() => Promise.all(Array.from({ length: REQUESTS }, (_, index) => {
        const id = (index % ACTIVE_PARTS) + 1;
        return call({
          method: 'POST',
          path: `/api/parts/${id}/checkout`,
          headers: platform,
          ip: `198.51.100.${index + 1}`,
          body: { user: TECH, notes: 'parallel' },
        });
      })));
      assertClean(mongoBurst.logs, 'mongo checkout');
      const mongoTallied = tally(mongoBurst.result);
      assert.equal(mongoTallied.failures.length, 0, JSON.stringify(mongoTallied.failures.map((row) => ({
        status: row.status,
        body: row.json,
      }))));
      assert.equal(mongoTallied.successes.length, ACTIVE_PARTS);
      assert.equal(mongoTallied.conflicts.length, REQUESTS - ACTIVE_PARTS);
      for (const row of mongoTallied.successes) {
        assert.equal(row.json.part.status, 'checked_out');
        assert.equal(row.json.part.quantity, 0);
        assert.equal(row.json.transaction.action, 'checkout');
        assert.equal(row.json.transaction.user, TECH);
      }
      for (const row of mongoTallied.conflicts) {
        assert.equal(row.json.error, 'Part is already checked out');
      }
      assert.equal(await Part.countDocuments(), PART_COUNT);
      assert.equal(await Transaction.countDocuments(), mongoTallied.successes.length);
      assert.equal(partDeletes, 0);
      assert.equal(txDeletes, 0);
      assert.equal(partInsertMany, 0);
      assert.equal(txInsertMany, 0);
      const checkedOut = await Part.countDocuments({ status: 'checked_out' });
      assert.equal(checkedOut, ACTIVE_PARTS);
      summary.mongo = {
        before: PART_COUNT,
        after: await Part.countDocuments(),
        successes: mongoTallied.successes.length,
        conflicts: mongoTallied.conflicts.length,
        transactions: await Transaction.countDocuments(),
        deleteMany: partDeletes + txDeletes,
        insertMany: partInsertMany + txInsertMany,
        serverErrors: mongoTallied.failures.length,
        e11000: mongoBurst.logs.join('\n').includes('E11000'),
      };

      await assertOldMultiQuantityRules(call, platform, partsFile, '203.0.114');
      assert.equal(await Part.countDocuments(), PART_COUNT);
      assert.equal(partDeletes, 0);
      assert.equal(txDeletes, 0);
      assert.equal(partInsertMany, 0);
      assert.equal(txInsertMany, 0);
      const mongoMulti = await Part.findOne({ id: MULTI_ID }).lean();
      assert.equal(mongoMulti.quantity, MULTI_QTY - 1);
      assert.equal(mongoMulti.status, 'checked_out');
      assert.equal(mongoMulti.checkedOutBy, TECH);
      assert.equal(await Part.countDocuments({ quantity: { $lt: 0 } }), 0);

      const fsp = fs.promises;
      const touches = [];
      const origRead = fsp.readFile;
      const origWrite = fsp.writeFile;
      const origOpen = fsp.open;
      const origRename = fsp.rename;
      const note = (kind, target) => {
        const text = String(target);
        if (text.includes('parts.json') || text.includes('transactions.json')) touches.push(`${kind} ${text}`);
      };
      fsp.readFile = async (target, ...args) => {
        note('read', target);
        return origRead(target, ...args);
      };
      fsp.writeFile = async (target, ...args) => {
        note('write', target);
        return origWrite(target, ...args);
      };
      fsp.open = async (target, ...args) => {
        note('open', target);
        return origOpen(target, ...args);
      };
      fsp.rename = async (from, to, ...args) => {
        note('rename', from);
        note('rename', to);
        return origRename(from, to, ...args);
      };

      const originalFind = Part.find;
      Part.find = function failRead() {
        const error = new Error(`forced read ${TECH} ${SECRET} checkedOutBy`);
        error.name = 'MongoServerError';
        error.code = 91;
        throw error;
      };
      try {
        const readFail = await capture(() => call({
          method: 'GET',
          path: '/api/parts',
          headers: platform,
          ip: '198.51.100.220',
        }));
        assert.equal(readFail.result.status, 503);
        assert.equal(readFail.result.json.error, 'store_unavailable');
        assert.equal(readFail.result.text.includes(TECH), false);
        assert.equal(readFail.result.text.includes(SECRET), false);
        assertClean(readFail.logs, 'mongo read');
        assert.deepEqual(touches, []);
      } finally {
        Part.find = originalFind;
        fsp.readFile = origRead;
        fsp.writeFile = origWrite;
        fsp.open = origOpen;
        fsp.rename = origRename;
      }

      const originalUpdate = Part.updateOne;
      Part.updateOne = async function failWrite() {
        const error = new Error(`E11000 duplicate ${TECH} checkedOutBy ${SECRET} PN-1`);
        error.name = 'MongoServerError';
        error.code = 11000;
        error.checkedOutBy = TECH;
        error.description = SECRET;
        throw error;
      };
      try {
        const writeFail = await capture(() => call({
          method: 'POST',
          path: '/api/parts/11/checkout',
          headers: platform,
          ip: '198.51.100.221',
          body: { user: TECH, notes: SECRET },
        }));
        assert.equal(writeFail.result.status, 503);
        assert.equal(writeFail.result.json.error, 'store_unavailable');
        assert.equal(writeFail.result.text.includes(TECH), false);
        assert.equal(writeFail.result.text.includes(SECRET), false);
        assertClean(writeFail.logs, 'mongo write');
      } finally {
        Part.updateOne = originalUpdate;
      }

      await Part.insertOne({
        id: 424242,
        partNumber: 'PN-1',
        description: SECRET,
        category: 'General',
        quantity: 1,
        checkedOutBy: TECH,
      });
      const duplicate = await capture(async () => {
        await assert.rejects(() => app.dbService.insertPart({
          id: 424242,
          partNumber: 'PN-1',
          description: SECRET,
          category: 'General',
          quantity: 1,
          checkedOutBy: TECH,
        }));
      });
      assertClean(duplicate.logs, 'duplicate insert');
      assert.match(duplicate.logs.join('\n'), /duplicate_key/);

      assert.equal(await fs.promises.readFile(partsFile, 'utf8'), jsonPartsAfterInit);
      assert.equal(await fs.promises.readFile(transactionsFile, 'utf8'), jsonTxAfterInit);
      summary.mongoRead = { status: 503, jsonTouched: false };
    } finally {
      Part.deleteMany = partDeleteMany;
      Transaction.deleteMany = txDeleteMany;
      Part.insertMany = partInsertManyFn;
      Transaction.insertMany = txInsertManyFn;
      await mongoose.disconnect();
      await mongod.stop();
    }

    console.log(`PARTS_WRITE_SAFETY ${JSON.stringify(summary)}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
});
