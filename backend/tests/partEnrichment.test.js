const test = require('node:test');
const assert = require('node:assert/strict');
const { applyEnrichmentBatch, enrichmentCoverage } = require('../services/partEnrichment');

const parts = [
  {
    id: 7,
    partNumber: '2892427',
    description: 'Timing fixture',
    shelf: 'West Rack - Shelf 4',
    category: 'Cummins Tools',
    quantity: 2,
    status: 'available',
  },
  {
    id: 8,
    partNumber: '2892427',
    description: 'Timing fixture duplicate',
    shelf: 'TBD',
    category: 'Cummins Tools',
    quantity: 1,
    status: 'available',
  },
  {
    id: 9,
    partNumber: 'OTHER',
    description: 'Leave me',
    shelf: 'TBD',
    category: 'Misc',
    quantity: 5,
    status: 'available',
  },
];

test('enrich-batch updates matches and leaves inventory intact', () => {
  const result = applyEnrichmentBatch(parts, {
    items: [
      {
        partNumber: '2892-427',
        engineFamily: 'cummins',
        manufacturer: null,
        aliases: ['ISX timing'],
        specs: null,
        quantity: 99,
        shelf: 'Should not apply',
        description: 'Should not replace inventory text',
      },
      { partNumber: 'MISSING-1', engineFamily: 'CAT' },
      { partNumber: '2892427', engineFamily: 'Not A Brand' },
    ],
  });

  assert.equal(result.summary.deleted, 0);
  assert.equal(result.summary.inventoryCountAfter, 3);
  assert.equal(result.updated.length, 2);
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.rejected.length, 1);
  for (const part of result.parts) {
    if (part.partNumber === '2892427') {
      assert.equal(part.engineFamily, 'Cummins');
      assert.equal(part.manufacturer, null);
      assert.deepEqual(part.aliases, ['ISX timing']);
      assert.equal(part.quantity, part.id === 7 ? 2 : 1);
      assert.notEqual(part.shelf, 'Should not apply');
      assert.ok(part.description.includes('Timing') || part.description.includes('timing') || part.description.includes('fixture'));
      assert.ok(part.lastEnrichedAt);
    }
  }
  assert.equal(result.parts.find((part) => part.id === 9).description, 'Leave me');
  assert.equal(parts[0].quantity, 2);
});

test('research batch applies found and ambiguous and skips unfound', () => {
  const batch = require('../data/enrichment-batch-20261005.json');
  const found = batch.find((row) => row.partNumber === '1696707');
  const ambiguous = batch.find((row) => row.partNumber === '4394639');
  const dual = batch.find((row) => row.partNumber === '3824500');
  const live = [
    { id: 1, partNumber: '1696707', description: 'Shop liner tool', quantity: 1, shelf: 'A', manufacturer: null },
    { id: 2, partNumber: '4394639', description: 'X15 Cylinder Leak Down Kit', quantity: 1, shelf: 'B' },
    { id: 3, partNumber: '17592R', description: 'Keep', quantity: 4, shelf: 'C', manufacturer: 'Already', notes: 'keep me' },
    { id: 4, partNumber: '3824500', description: 'Wear sleeve', quantity: 1, shelf: 'D' },
  ];

  const result = applyEnrichmentBatch(live, batch);
  const liner = result.parts.find((part) => part.id === 1);
  const valve = result.parts.find((part) => part.id === 2);
  const untouched = result.parts.find((part) => part.id === 3);
  const sleeve = result.parts.find((part) => part.id === 4);

  assert.equal(result.summary.input, 118);
  assert.equal(result.summary.skippedUnfound, 46);
  assert.equal(result.summary.rejected, 0);
  assert.equal(result.summary.deleted, 0);
  assert.equal(result.summary.inventoryCountAfter, 4);
  assert.equal(result.summary.appliedFound, 2);
  assert.equal(result.summary.appliedAmbiguous, 1);

  assert.equal(liner.description, 'Shop liner tool');
  assert.equal(liner.quantity, 1);
  assert.equal(liner.shelf, 'A');
  assert.equal(liner.polishedDescription, found.description);
  assert.equal(liner.manufacturer, found.manufacturer);
  assert.equal(liner.engineFamily, 'MX');
  assert.equal(liner.sourceUrl, found.sourceUrl);
  assert.match(liner.notes, /MX-13/);

  assert.equal(valve.description, 'X15 Cylinder Leak Down Kit');
  assert.equal(valve.polishedDescription, ambiguous.description);
  assert.equal(valve.manufacturer, ambiguous.manufacturer);
  assert.match(valve.notes, /Shop inventory labeled/);
  assert.equal(valve.engineFamily, undefined);

  assert.equal(untouched.manufacturer, 'Already');
  assert.equal(untouched.notes, 'keep me');
  assert.equal(untouched.lastEnrichedAt, undefined);
  assert.equal(untouched.description, 'Keep');

  assert.equal(sleeve.polishedDescription, dual.description);
  assert.equal(sleeve.manufacturer, dual.manufacturer);
  assert.equal(sleeve.engineFamily, undefined);
  assert.match(sleeve.notes, /Paccar PX-6/);
  assert.equal(sleeve.description, 'Wear sleeve');
  assert.equal(sleeve.quantity, 1);
});

test('coverage counts only filled enrichment fields', () => {
  const enriched = applyEnrichmentBatch(parts, {
    items: [{ id: 7, vendor: 'Kenworth', sourceUrl: 'https://example.com/tool' }],
  }).parts;
  const stats = enrichmentCoverage(enriched);
  assert.equal(stats.total, 3);
  assert.equal(stats.byField.vendor, 1);
  assert.equal(stats.byField.sourceUrl, 1);
  assert.equal(stats.missing, 2);
});
