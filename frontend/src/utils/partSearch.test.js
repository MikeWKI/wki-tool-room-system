import { partMatchesQuery, partsForMasterView } from './partSearch';
import { matchesEngineFamilyChip } from './masterInventoryLocation';

test('search matches part numbers with punctuation and aliases', () => {
  const part = {
    partNumber: '2892427',
    description: 'Timing fixture',
    aliases: ['ISX timing'],
    category: 'Cummins Tools',
    engineFamily: 'Cummins',
  };
  expect(partMatchesQuery(part, '2892-427')).toBe(true);
  expect(partMatchesQuery(part, '2892 427')).toBe(true);
  expect(partMatchesQuery(part, 'isx timing')).toBe(true);
  expect(partMatchesQuery(part, 'detroit')).toBe(false);
});

test('search matches the display location as well as the stored shelf string', () => {
  const part = {
    partNumber: '2154147',
    description: 'MX-11/MX-13 Valve Spring Compressor Kit',
    shelf: 'West Rack - Shelf 9',
    category: 'MX Tools',
  };
  expect(partMatchesQuery(part, 'West Rack · Shelf 9')).toBe(true);
  expect(partMatchesQuery(part, 'Section 1 / Shelf 4')).toBe(false);
});

test('master search crosses shelves while a term is entered and stays on the shelf when empty', () => {
  const onWest = {
    id: 'west',
    partNumber: '2154147',
    description: 'MX-11/MX-13 Valve Spring Compressor Kit',
    category: 'MX Tools',
    engineFamily: 'MX',
    shelf: 'West Rack - Shelf 9',
  };
  const onSection = {
    id: 'section',
    partNumber: '5394335',
    description: 'Cylinder Diag Kit',
    category: 'Cummins',
    engineFamily: 'Cummins',
    shelf: 'Section 1 / Shelf 4',
  };
  const inventory = [onWest, onSection];
  const partsByLocation = {
    map: {
      's5-cabinet-sh-1': [],
      's1-mx-sh-9': [onWest],
    },
    unassigned: [],
  };

  const scoped = partsForMasterView({
    inventory,
    partsByLocation,
    selectedLocationId: 's5-cabinet-sh-1',
    searchTerm: '',
    engineFamily: 'All',
  });
  expect(scoped).toEqual([]);

  const found = partsForMasterView({
    inventory,
    partsByLocation,
    selectedLocationId: 's5-cabinet-sh-1',
    searchTerm: '2154147',
    engineFamily: 'All',
  });
  expect(found.map((part) => part.partNumber)).toEqual(['2154147']);

  const byDescription = partsForMasterView({
    inventory,
    partsByLocation,
    selectedLocationId: 's1-mx-sh-9',
    searchTerm: 'cylinder diag',
    engineFamily: 'All',
  });
  expect(byDescription.map((part) => part.id)).toEqual(['section']);

  const chipStillApplies = partsForMasterView({
    inventory,
    partsByLocation,
    selectedLocationId: null,
    searchTerm: '2154147',
    engineFamily: 'Cummins',
  });
  expect(chipStillApplies).toEqual([]);
});

test('engine family chip uses the stored family before category', () => {
  expect(matchesEngineFamilyChip({ engineFamily: 'MX', category: 'Cummins Tools' }, 'MX')).toBe(true);
  expect(matchesEngineFamilyChip({ category: 'Cummins Tools' }, 'Cummins')).toBe(true);
  expect(matchesEngineFamilyChip({ category: 'Misc' }, 'General')).toBe(true);
  expect(matchesEngineFamilyChip({ engineFamily: 'CAT', category: 'Misc' }, 'General')).toBe(false);
});
