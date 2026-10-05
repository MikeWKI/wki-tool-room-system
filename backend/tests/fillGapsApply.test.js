const test = require('node:test');
const assert = require('node:assert/strict');
const { planFillGapsApply, applyFillGapsToParts } = require('../services/fillGapsApply');

function livePart(overrides) {
  return {
    id: 1,
    partNumber: 'X',
    description: 'Live description',
    shelf: 'TBD',
    category: 'Misc',
    status: 'available',
    quantity: 1,
    ...overrides,
  };
}

test('fill-gaps dry run fills TBD shelves and holds field diffs in JB Staging', () => {
  const parts = [
    livePart({
      id: 297,
      partNumber: '2463031',
      description: 'Live injector plugs',
      shelf: 'TBD',
      category: 'Misc',
      quantity: 1,
    }),
    livePart({
      id: 10,
      partNumber: 'C-E-208',
      description: 'EGR Cooler Pressure Test kit',
      shelf: 'West Rack - Shelf 10',
      category: 'MX Tools',
      quantity: 1,
    }),
    livePart({
      id: 999,
      partNumber: 'LIVE-ONLY-999',
      description: 'Only on the floor',
      shelf: 'West Rack - Shelf 1',
      category: 'Cummins Tools',
      quantity: 3,
    }),
  ];

  const plan = planFillGapsApply(parts, []);
  assert.equal(plan.strategy, 'fill-gaps');
  assert.equal(plan.counts.skippedLocationConflict >= 1, true);
  const shelf = plan.actions.updateShelfFromJb.find((row) => row.partNumber === '2463031');
  assert.ok(shelf);
  assert.equal(shelf.autoTbd, true);
  assert.equal(shelf.to, 'Section 1 / Shelf 9');
  assert.equal(
    plan.actions.updateFieldsFromJb.some((row) => row.partNumber === '2463031'),
    false
  );
  const staged = plan.actions.jbStaging.find((row) => row.partNumber === '2463031');
  assert.ok(staged);
  assert.ok(staged.fields.includes('description'));
  const conflict = plan.actions.skippedLocationConflict.find((row) => row.partNumber === 'C-E-208');
  assert.ok(conflict);
  assert.equal(
    plan.actions.updateShelfFromJb.some((row) => row.partNumber === 'C-E-208'),
    false
  );
  assert.equal(
    plan.actions.jbStaging.some((row) => row.partNumber === 'C-E-208' && row.reason === 'location_conflict'),
    true
  );
  assert.equal(
    plan.actions.addFromJb.some((row) => row.partNumber === '2203504'),
    true
  );
  assert.equal(parts[0].description, 'Live injector plugs');
  assert.equal(parts.length, 3);
});

test('Accept JB staging is what writes description and location conflicts', () => {
  const parts = [
    livePart({
      id: 297,
      partNumber: '2463031',
      description: 'Live injector plugs',
      shelf: 'TBD',
      category: 'Misc',
    }),
    livePart({
      id: 10,
      partNumber: 'C-E-208',
      shelf: 'West Rack - Shelf 10',
      category: 'MX Tools',
      description: 'EGR Cooler Pressure Test kit',
    }),
  ];
  const staging = [
    { partNumber: '2463031', normalizedPartNumber: '2463031', decision: 'accept_jb' },
    { partNumber: 'C-E-208', normalizedPartNumber: 'CE208', decision: 'accept_jb' },
  ];
  const plan = planFillGapsApply(parts, staging);
  const fields = plan.actions.updateFieldsFromJb.find((row) => row.partNumber === '2463031');
  assert.ok(fields);
  assert.equal(fields.acceptedJb, true);
  assert.equal(fields.patch.description, 'Injector Bore Plugs x5 Bags');
  assert.equal(
    plan.actions.updateShelfFromJb.some((row) => row.partNumber === 'C-E-208' && row.acceptedJb),
    true
  );
  assert.equal(
    plan.actions.jbStaging.some((row) => row.partNumber === 'C-E-208'),
    false
  );
});

test('apply never deletes live parts and does not overwrite unstaged fields', () => {
  const parts = [
    livePart({
      id: 297,
      partNumber: '2463031',
      description: 'Keep this description',
      shelf: 'TBD',
      category: 'Misc',
      quantity: 4,
    }),
    livePart({
      id: 999,
      partNumber: 'LIVE-ONLY-999',
      description: 'Stay',
      shelf: 'West Rack - Shelf 2',
      category: 'Cummins Tools',
      quantity: 2,
    }),
  ];
  const result = applyFillGapsToParts(parts, []);
  assert.ok(result.liveCountAfter >= result.liveCountBefore);
  assert.ok(result.parts.some((part) => part.id === 999 && part.partNumber === 'LIVE-ONLY-999'));
  const updated = result.parts.find((part) => part.id === 297);
  assert.equal(updated.description, 'Keep this description');
  assert.equal(updated.quantity, 4);
  assert.equal(updated.shelf, 'Section 1 / Shelf 9');
  assert.equal(parts.find((part) => part.id === 297).description, 'Keep this description');
});
