import { partMatchesQuery } from './partSearch';
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

test('engine family chip uses the stored family before category', () => {
  expect(matchesEngineFamilyChip({ engineFamily: 'MX', category: 'Cummins Tools' }, 'MX')).toBe(true);
  expect(matchesEngineFamilyChip({ category: 'Cummins Tools' }, 'Cummins')).toBe(true);
  expect(matchesEngineFamilyChip({ category: 'Misc' }, 'General')).toBe(true);
  expect(matchesEngineFamilyChip({ engineFamily: 'CAT', category: 'Misc' }, 'General')).toBe(false);
});
