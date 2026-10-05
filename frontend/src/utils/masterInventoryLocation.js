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

const SHELF_LABEL_SEPARATOR = ' · ';

function titleRack(name) {
  const lower = String(name || '').toLowerCase();
  if (!lower) return '';
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Display-only shelf label. Does not change the string stored on the part.
 * Live data mixes "Section 1 / Shelf 4", "West Rack - Shelf 11", and "TBD".
 * Rendered form is "Rack/Section · Shelf N" (area kept when the source has one).
 */
export function formatShelfLabel(value) {
  if (value == null || String(value).trim() === '') return 'TBD';
  const raw = String(value).trim().replace(/\s+/g, ' ');
  const key = raw.toLowerCase();
  if (key === 'tbd' || key === 'unassigned' || key === 'unknown' || key === 'n/a' || key === 'na') {
    return 'TBD';
  }

  const rackShelf = raw.match(/^(north|south|east|west)[\s_-]*rack[\s_-]*shelf[\s_-]*(\d+)$/i);
  if (rackShelf) {
    return `${titleRack(rackShelf[1])} Rack${SHELF_LABEL_SEPARATOR}Shelf ${parseInt(rackShelf[2], 10)}`;
  }

  const rackNumber = raw.match(/^(north|south|east|west)[\s_-]*rack[\s_-]*(\d+)$/i);
  if (rackNumber) {
    return `${titleRack(rackNumber[1])} Rack${SHELF_LABEL_SEPARATOR}Shelf ${parseInt(rackNumber[2], 10)}`;
  }

  const sectionShelf = raw.match(/^section\s*(\d+)\s*[/•·|\-–—]\s*shelf\s*(\d+)$/i);
  if (sectionShelf) {
    return `Section ${parseInt(sectionShelf[1], 10)}${SHELF_LABEL_SEPARATOR}Shelf ${parseInt(sectionShelf[2], 10)}`;
  }

  const sectionAreaShelf = raw.match(/^section\s*(\d+)\s*[•·/|\-–—]\s*(.+?)\s*[•·/|\-–—]\s*shelf\s*(\d+)$/i);
  if (sectionAreaShelf) {
    return `Section ${parseInt(sectionAreaShelf[1], 10)}${SHELF_LABEL_SEPARATOR}${sectionAreaShelf[2].trim()}${SHELF_LABEL_SEPARATOR}Shelf ${parseInt(sectionAreaShelf[3], 10)}`;
  }

  const namedShelf = raw.match(/^(.+?)\s*[-–—]\s*shelf\s*(\d+)$/i);
  if (namedShelf && !/^section\s*\d+$/i.test(namedShelf[1].trim())) {
    return `${namedShelf[1].trim()}${SHELF_LABEL_SEPARATOR}Shelf ${parseInt(namedShelf[2], 10)}`;
  }

  const sectionArea = raw.match(/^section\s*(\d+)\s*[•·/|\-–—]\s*(.+)$/i);
  if (sectionArea) {
    return `Section ${parseInt(sectionArea[1], 10)}${SHELF_LABEL_SEPARATOR}${sectionArea[2].trim()}`;
  }

  if (raw.includes('·')) {
    return raw
      .split('·')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.replace(/^shelf\s+(\d+)$/i, (_, n) => `Shelf ${parseInt(n, 10)}`))
      .join(SHELF_LABEL_SEPARATOR);
  }

  return raw;
}

/** How many other rows share this part number. Display hint only; rows are not merged. */
export function otherRowsWithSamePartNumber(inventory, part) {
  const key = normalizePartNumber(part?.partNumber);
  if (!key || !Array.isArray(inventory)) return 0;
  let count = 0;
  for (const row of inventory) {
    if (normalizePartNumber(row?.partNumber) === key) count += 1;
  }
  return Math.max(0, count - 1);
}

export function samePartNumberHint(otherCount) {
  const count = Number(otherCount) || 0;
  if (count < 1) return '';
  return `same P# as ${count} other ${count === 1 ? 'entry' : 'entries'}`;
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
