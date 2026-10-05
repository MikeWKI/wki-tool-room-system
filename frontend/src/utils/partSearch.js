import { normalizePartNumber } from './masterInventoryLocation';

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
    part?.manufacturer,
    part?.vendor,
    part?.engineFamily,
    part?.notes,
    part?.specs,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return raw.split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}
