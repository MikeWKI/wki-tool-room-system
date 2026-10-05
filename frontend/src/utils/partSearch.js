import { formatShelfLabel, matchesEngineFamilyChip, normalizePartNumber } from './masterInventoryLocation';

export function partMatchesQuery(part, query) {
  const raw = String(query || '').trim().toLowerCase();
  if (!raw) return true;
  const needle = normalizePartNumber(raw);
  const partNumber = normalizePartNumber(part?.partNumber);
  if (needle && partNumber.includes(needle)) return true;
  const aliases = Array.isArray(part?.aliases) ? part.aliases : [];
  for (const alias of aliases) {
    const text = String(alias || '');
    if (text.toLowerCase().includes(raw)) return true;
    if (needle && normalizePartNumber(text).includes(needle)) return true;
  }
  const haystack = [
    part?.description,
    part?.polishedDescription,
    part?.category,
    part?.shelf,
    formatShelfLabel(part?.shelf),
    part?.manufacturer,
    part?.vendor,
    part?.engineFamily,
    part?.notes,
    part?.specs,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const words = raw.split(/\s+/).filter((word) => word && !/^[·•/|\-–—]+$/.test(word));
  if (!words.length) return false;
  return words.every((word) => haystack.includes(word));
}

/**
 * Master tab list. An empty search stays on the selected shelf.
 * Any search term looks across every shelf and section.
 * The engine-family chip still applies.
 */
export function partsForMasterView({
  inventory = [],
  partsByLocation,
  selectedLocationId,
  searchTerm,
  engineFamily,
}) {
  const searching = String(searchTerm || '').trim().length > 0;
  let list = inventory;
  if (!searching) {
    if (selectedLocationId === '__unassigned__') {
      list = partsByLocation?.unassigned || [];
    } else if (selectedLocationId) {
      list = partsByLocation?.map?.[selectedLocationId] || [];
    }
  }
  return list.filter(
    (part) => matchesEngineFamilyChip(part, engineFamily) && partMatchesQuery(part, searchTerm)
  );
}
