/** Client-side location resolution (mirrors backend masterInventoryLayout rules). */

export function normalizePartNumber(value) {
  if (!value) return '';
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

export function normalizeShelfKey(value) {
  if (!value) return '';
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function resolvePartLocationId(shelfValue, category = '', locations = []) {
  if (!shelfValue) return null;
  const key = normalizeShelfKey(shelfValue);
  if (key === 'tbd' || key === 'unassigned') return null;

  const westMatch = key.match(/west rack\s*-?\s*shelf\s*(\d+)/i);
  if (westMatch) {
    const n = parseInt(westMatch[1], 10);
    if (n >= 8) return `s1-mx-sh-${n}`;
    if (n >= 1) return `s1-cummins-sh-${n}`;
  }

  const sectionShelf = key.match(/section\s*1\s*[/•-]\s*shelf\s*(\d+)/i);
  if (sectionShelf) {
    const n = parseInt(sectionShelf[1], 10);
    const cat = String(category).toLowerCase();
    if (cat.includes('mx')) return `s1-mx-sh-${n}`;
    if (cat.includes('cummins')) return `s1-cummins-sh-${n}`;
    if (n >= 8) return `s1-mx-sh-${n}`;
    if (n >= 1 && n <= 7) return `s1-cummins-sh-${n}`;
  }

  for (const loc of locations) {
    const candidates = [loc.label, loc.westRackLabel, ...(loc.aliases || [])]
      .filter(Boolean)
      .map(normalizeShelfKey);
    if (candidates.some((c) => c === key || (c.length > 8 && (key.includes(c) || c.includes(key))))) {
      return loc.id;
    }
  }
  return null;
}

export function engineFamilyFromCategory(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('mx') || c.includes('paccar')) return 'MX / Paccar';
  if (c.includes('cummins')) return 'Cummins';
  if (c.includes('cat')) return 'CAT';
  if (c.includes('detroit')) return 'Detroit';
  if (c.includes('allison') || c.includes('transmission')) return 'Allison / Trans';
  return 'General';
}

export const ENGINE_FAMILY_CHIPS = [
  'All',
  'MX / Paccar',
  'Cummins',
  'CAT',
  'Detroit',
  'Allison / Trans',
  'General',
];
