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

export const ENGINE_FAMILIES = ['MX', 'Cummins', 'CAT', 'Detroit', 'Allison', 'Paccar', 'General'];

export const ENGINE_FAMILY_CHIPS = ['All', ...ENGINE_FAMILIES];

export function engineFamilyFromCategory(category) {
  const text = String(category || '').toLowerCase();
  if (text.includes('mx')) return 'MX';
  if (text.includes('paccar')) return 'Paccar';
  if (text.includes('cummins')) return 'Cummins';
  if (text.includes('detroit')) return 'Detroit';
  if (text.includes('allison')) return 'Allison';
  if (/\bcat\b/.test(text) || text.includes('caterpillar')) return 'CAT';
  return null;
}

export function resolveEngineFamily(part) {
  if (part && ENGINE_FAMILIES.includes(part.engineFamily)) return part.engineFamily;
  return engineFamilyFromCategory(part?.category) || engineFamilyFromCategory(part?.description);
}

export function matchesEngineFamilyChip(part, chip) {
  if (!chip || chip === 'All') return true;
  const resolved = resolveEngineFamily(part);
  if (chip === 'General') return resolved === 'General' || resolved == null;
  return resolved === chip;
}
