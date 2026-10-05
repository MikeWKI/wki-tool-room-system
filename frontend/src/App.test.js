import { partMatchesQuery } from './utils/partSearch';

test('part search helper is available to the inventory screens', () => {
  expect(partMatchesQuery({ partNumber: '3162993', description: 'seal tool' }, '3162993')).toBe(true);
});
