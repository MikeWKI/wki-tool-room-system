import {
  formatShelfLabel,
  otherRowsWithSamePartNumber,
  samePartNumberHint,
} from './masterInventoryLocation';

test('formatShelfLabel normalizes mixed live location strings for display', () => {
  expect(formatShelfLabel('West Rack - Shelf 11')).toBe('West Rack · Shelf 11');
  expect(formatShelfLabel('West Rack - Shelf 9')).toBe('West Rack · Shelf 9');
  expect(formatShelfLabel('west_rack_9')).toBe('West Rack · Shelf 9');
  expect(formatShelfLabel('Section 1 / Shelf 4')).toBe('Section 1 · Shelf 4');
  expect(formatShelfLabel('Section 1/Shelf 4')).toBe('Section 1 · Shelf 4');
  expect(formatShelfLabel('South Rack - Shelf 3')).toBe('South Rack · Shelf 3');
  expect(formatShelfLabel('Section 5 • Black Cabinet • Shelf 1')).toBe('Section 5 · Black Cabinet · Shelf 1');
  expect(formatShelfLabel('Section 1 • MX Tools • Shelf 10')).toBe('Section 1 · MX Tools · Shelf 10');
  expect(formatShelfLabel('Black Cabinet - Shelf 2')).toBe('Black Cabinet · Shelf 2');
  expect(formatShelfLabel('Section 3 • CAT Cart')).toBe('Section 3 · CAT Cart');
  expect(formatShelfLabel('TBD')).toBe('TBD');
  expect(formatShelfLabel('unassigned')).toBe('TBD');
  expect(formatShelfLabel('')).toBe('TBD');
  expect(formatShelfLabel(null)).toBe('TBD');
});

test('formatShelfLabel is display-only and idempotent', () => {
  const stored = 'Section 1 / Shelf 4';
  const label = formatShelfLabel(stored);
  expect(stored).toBe('Section 1 / Shelf 4');
  expect(formatShelfLabel(label)).toBe(label);
  expect(formatShelfLabel('West Rack · Shelf 11')).toBe('West Rack · Shelf 11');
});

test('same part number hint counts other rows and does not collapse them', () => {
  const inventory = [
    { partNumber: 'HAMMER', description: 'Ball peen' },
    { partNumber: 'hammer', description: 'Dead blow' },
    { partNumber: '2154147', description: 'Valve spring compressor' },
  ];
  expect(otherRowsWithSamePartNumber(inventory, inventory[0])).toBe(1);
  expect(otherRowsWithSamePartNumber(inventory, inventory[2])).toBe(0);
  expect(samePartNumberHint(1)).toBe('same P# as 1 other entry');
  expect(samePartNumberHint(3)).toBe('same P# as 3 other entries');
  expect(samePartNumberHint(0)).toBe('');
});
