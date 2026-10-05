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
