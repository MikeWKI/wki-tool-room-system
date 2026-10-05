const test = require('node:test');
const assert = require('node:assert/strict');
const { buildShopActivity, zonedTimeToUtc, chicagoParts, resolveFamily } = require('../services/shopActivitySeed');
const { mergeActivityBatch } = require('../services/shopActivityApply');
const { ALLOWED_TECH_NAMES, REMOVED_TECH_NAMES, TECHS } = require('../data/techRoster');

const FIXTURE = [
  { id: 1, partNumber: '3162993', description: 'ISX front crank seal tool', category: 'Cummins Tools', quantity: 2, status: 'available', shelf: 'Section 1 / Shelf 5' },
  { id: 2, partNumber: '2892427', description: 'ISX timing tool', category: 'Cummins Tools', quantity: 2, status: 'available', shelf: 'Section 1 / Shelf 6' },
  { id: 3, partNumber: '4919273', description: 'MX13 piston ring compressor', category: 'MX Tools', quantity: 1, status: 'available', shelf: 'Section 1 / Shelf 11' },
  { id: 4, partNumber: 'J33880', description: 'Detroit injector tool', category: 'Detroit Tools', quantity: 1, status: 'available', shelf: 'Section 3 / DETROIT CART' },
  { id: 5, partNumber: 'J-45002', description: 'DD15 cam tool', category: 'Detroit Tools', quantity: 1, status: 'available', shelf: 'Section 3 / DETROIT CART' },
  { id: 6, partNumber: 'CAT-1', description: 'C15 liner puller', category: 'Cat Cart', quantity: 1, status: 'available', shelf: 'Cat Cart' },
  { id: 7, partNumber: 'ALL-1', description: 'Allison clutch spring compressor', category: 'Allison', quantity: 1, status: 'available', shelf: 'Trans bench' },
  { id: 8, partNumber: 'GEN-1', description: 'Torque wrench', category: 'Misc', quantity: 3, status: 'available', shelf: 'West Rack - Shelf 1' },
  { id: 9, partNumber: 'GEN-2', description: 'Brake chamber caging tool', category: 'Bendix', quantity: 2, status: 'available', shelf: 'West Rack - Shelf 2' },
  { id: 10, partNumber: 'GEN-3', description: 'Multimeter', category: 'Electrical', quantity: 2, status: 'available', shelf: 'Module Cabinet' },
  { id: 11, partNumber: 'MX-2', description: 'MX13 liner extractor', category: 'MX Tools', quantity: 1, status: 'available', shelf: 'Section 1 / Shelf 11' },
  { id: 12, partNumber: 'CUM-2', description: 'ISB EGR pressure kit', category: 'Cummins Tools', quantity: 1, status: 'available', shelf: 'Section 1 / Shelf 3' },
];

const asOf = zonedTimeToUtc(2026, 10, 5, 16, 42, 11);

test('roster is only the 14-name short list', () => {
  assert.deepEqual(ALLOWED_TECH_NAMES, [
    'Laryssa J.', 'Kyler M.', 'Drew P.',
    'Mario L.', 'Jon B.', 'Steve J.',
    'Will P.', 'Phil C.', 'Dakota B.', 'Danny C.',
    'Shawn S.', 'Noah R.', 'Devin S.',
    'Remington N.',
  ]);
  assert.equal(new Set(ALLOWED_TECH_NAMES).size, 14);
  for (const name of ['Mark P.', 'Mark Porter', 'Trenton W.', 'Owen T.', 'Luke B.', 'Tim K.', 'Austin S.']) {
    assert.equal(ALLOWED_TECH_NAMES.includes(name), false, name);
    assert.equal(REMOVED_TECH_NAMES.includes(name), true, name);
  }
  assert.equal(TECHS.length, 14);
});

test('Chicago wall time converts to the matching UTC instant', () => {
  const noon = zonedTimeToUtc(2026, 10, 5, 12, 0, 0);
  assert.equal(noon.toISOString(), '2026-10-05T17:00:00.000Z');
  assert.equal(chicagoParts(noon).weekday, 'Mon');
});

test('generated history looks like shop traffic and stays paired', () => {
  const generated = buildShopActivity({ parts: FIXTURE, asOf, seed: 20261005 });
  const { transactions } = generated;
  assert.ok(transactions.length >= 400, `expected a busy log, got ${transactions.length}`);
  assert.ok(transactions.length <= 4000, `expected low thousands, got ${transactions.length}`);
  assert.equal(generated.summary.partsDeleted, 0);
  assert.ok(generated.openParts.length <= 8);

  const allowed = new Set(ALLOWED_TECH_NAMES);
  const forbidden = /\b(demo|mock|seed|fake|sample)\b/i;
  const checkouts = new Map();
  const durations = new Set();
  const perShift = new Map();
  let weekend = 0;
  let onQuarterHour = 0;
  for (const row of transactions) {
    assert.equal(allowed.has(row.user), true, row.user);
    assert.equal(REMOVED_TECH_NAMES.includes(row.user), false, row.user);
    assert.equal(forbidden.test(row.user), false, row.user);
    assert.equal(forbidden.test(row.notes || ''), false, row.notes);
    assert.equal(forbidden.test(row.roNumber || ''), false);
    assert.equal(forbidden.test(row.unitNumber || ''), false);
    assert.equal(row.user.includes('Demo'), false);
    if (row.action === 'checkout') {
      checkouts.set(row.id, row);
      const chicagoDay = chicagoParts(new Date(row.timestamp));
      const key = `${row.user}|${chicagoDay.year}-${chicagoDay.month}-${chicagoDay.day}`;
      perShift.set(key, (perShift.get(key) || 0) + 1);
      if (row.user === 'Remington N.') assert.equal(chicagoDay.weekday, 'Fri');
      if (row.user === 'Laryssa J.') assert.equal(chicagoDay.weekday, 'Mon');
    }
    const chicago = chicagoParts(new Date(row.timestamp));
    if (chicago.weekday === 'Sat' || chicago.weekday === 'Sun') weekend += 1;
    const minute = new Date(row.timestamp).getUTCMinutes();
    const second = new Date(row.timestamp).getUTCSeconds();
    if (minute % 15 === 0 && second === 0) onQuarterHour += 1;
  }
  assert.ok(weekend / transactions.length < 0.12, `weekend share ${weekend / transactions.length}`);
  for (const [key, count] of perShift) {
    assert.ok(count <= 5, `${key} checked out ${count} tools in one shift`);
  }
  assert.ok(onQuarterHour / transactions.length < 0.2);

  let paired = 0;
  for (const row of transactions) {
    if (row.action !== 'checkin') continue;
    const checkout = checkouts.get(row.checkoutId);
    assert.ok(checkout, 'check-in missing its check-out');
    assert.equal(checkout.user, row.user);
    assert.equal(checkout.partId, row.partId);
    const minutes = (new Date(row.timestamp) - new Date(checkout.timestamp)) / 60000;
    assert.ok(minutes >= 35, `duration ${minutes}`);
    durations.add(Math.round(minutes));
    paired += 1;
  }
  assert.ok(durations.size > 12, 'durations should vary');
  const unpaired = [...checkouts.values()].filter((row) => !transactions.some((tx) => tx.checkoutId === row.id));
  assert.ok(unpaired.length <= 8);
  assert.equal(paired + unpaired.length, checkouts.size);

  const noah = transactions.filter((row) => row.action === 'checkout' && row.user === 'Noah R.');
  assert.ok(noah.length >= 3, 'Noah should appear on Thursdays');
  const cummins = noah.filter((row) => resolveFamily(FIXTURE.find((part) => part.id === row.partId)) === 'Cummins').length;
  assert.ok(cummins / noah.length > 0.45, `Cummins bias ${cummins}/${noah.length}`);

  for (const name of ['Mark P.', 'Trenton W.', 'Owen T.', 'Luke B.', 'William C.', 'Tyler M.', 'Austin S.', 'Josh A.']) {
    assert.equal(transactions.some((row) => row.user === name), false, name);
  }
});

test('apply is idempotent and does not delete parts or other history', () => {
  const parts = FIXTURE.map((part) => ({ ...part }));
  const generated = buildShopActivity({ parts, asOf, seed: 20261005 });
  const foreign = {
    id: 42,
    partId: 8,
    partNumber: 'GEN-1',
    action: 'checkout',
    user: 'Noah R.',
    timestamp: '2026-09-02T15:11:09.000Z',
    notes: 'RO 441902 unit 214',
    batchKey: null,
  };
  const first = mergeActivityBatch({
    parts,
    transactions: [foreign],
    existingBatch: null,
    generated,
  });
  assert.equal(first.parts.length, parts.length);
  assert.equal(first.partsDeleted, 0);
  assert.ok(first.transactions.some((row) => row.id === 42));
  assert.ok(first.parts.every((part) => parts.some((original) => original.id === part.id)));

  const second = mergeActivityBatch({
    parts: first.parts,
    transactions: first.transactions,
    existingBatch: first.batch,
    generated,
  });
  assert.equal(second.parts.length, parts.length);
  assert.ok(second.transactions.some((row) => row.id === 42 && row.notes === 'RO 441902 unit 214'));
  const firstBatch = first.transactions.filter((row) => row.batchKey === generated.batchKey).length;
  const secondBatch = second.transactions.filter((row) => row.batchKey === generated.batchKey).length;
  assert.equal(secondBatch, firstBatch);
});

test('confirm replace drops removed names outside the batch and relabels fill-gaps', () => {
  const parts = FIXTURE.map((part) => ({ ...part }));
  parts[0] = { ...parts[0], status: 'checked_out', checkedOutBy: 'Owen T.', checkedOutDate: '2026-10-01T14:00:00.000Z', quantity: 1 };
  parts[1] = {
    ...parts[1],
    quantity: 0,
    status: 'checked_out',
    checkedOutBy: 'WKI Tool Room lane fill-gaps apply',
    checkedOutDate: '2026-10-02T14:00:00.000Z',
  };
  const generated = buildShopActivity({ parts, asOf, seed: 20261005 });
  const oldBatch = {
    id: 9001,
    partId: 8,
    partNumber: 'GEN-1',
    action: 'checkout',
    user: 'Mark P.',
    timestamp: '2026-08-04T15:00:00.000Z',
    notes: 'RO 100200 unit 12',
    batchKey: generated.batchKey,
  };
  const markOut = {
    id: 77,
    partId: 9,
    partNumber: 'GEN-2',
    action: 'checkout',
    user: 'Mark P.',
    timestamp: '2026-09-04T15:04:00.000Z',
    notes: 'RO 551100 unit 90',
    batchKey: null,
  };
  const markIn = {
    id: 78,
    partId: 9,
    partNumber: 'GEN-2',
    action: 'checkin',
    user: 'Trenton W.',
    timestamp: '2026-09-04T16:10:00.000Z',
    notes: 'RO 551100 unit 90',
    checkoutId: 77,
    batchKey: null,
  };
  const fillGaps = {
    id: 79,
    partId: null,
    partNumber: 'RECONCILE_FILL_GAPS',
    action: 'import',
    user: 'WKI Tool Room lane fill-gaps apply',
    timestamp: '2026-10-04T18:00:00.000Z',
    notes: 'shelves',
    batchKey: null,
  };
  const systemImport = {
    id: 80,
    partId: null,
    partNumber: 'IMPORT',
    action: 'import',
    user: 'System',
    timestamp: '2026-07-01T12:00:00.000Z',
    notes: 'import',
    batchKey: null,
  };

  const merged = mergeActivityBatch({
    parts,
    transactions: [oldBatch, markOut, markIn, fillGaps, systemImport],
    existingBatch: null,
    generated,
  });

  assert.equal(merged.transactions.some((row) => row.id === 9001), false);
  assert.equal(merged.transactions.some((row) => REMOVED_TECH_NAMES.includes(row.user)), false);
  const keptOut = merged.transactions.find((row) => row.id === 77);
  const keptIn = merged.transactions.find((row) => row.id === 78);
  assert.ok(ALLOWED_TECH_NAMES.includes(keptOut.user));
  assert.equal(keptOut.user, keptIn.user);
  assert.equal(keptOut.notes, 'RO 551100 unit 90');
  assert.equal(merged.transactions.find((row) => row.id === 79).user, 'System');
  assert.equal(merged.transactions.find((row) => row.id === 80).user, 'System');
  assert.equal(merged.systemRelabeled, 1);

  const owenPart = merged.parts.find((part) => part.id === 1);
  const labelPart = merged.parts.find((part) => part.id === 2);
  assert.equal(REMOVED_TECH_NAMES.includes(owenPart.checkedOutBy), false);
  assert.notEqual(owenPart.checkedOutBy, 'Owen T.');
  if (owenPart.status === 'checked_out') assert.ok(ALLOWED_TECH_NAMES.includes(owenPart.checkedOutBy));
  assert.equal(labelPart.checkedOutBy, null);
  assert.equal(labelPart.status, 'available');
  assert.equal(merged.parts.length, parts.length);

  const again = mergeActivityBatch({
    parts: merged.parts,
    transactions: merged.transactions,
    existingBatch: merged.batch,
    generated,
  });
  assert.equal(again.transactions.some((row) => REMOVED_TECH_NAMES.includes(row.user)), false);
  assert.equal(again.parts.some((part) => REMOVED_TECH_NAMES.includes(part.checkedOutBy)), false);
  assert.equal(again.transactions.find((row) => row.id === 79).user, 'System');
});
