/**
 * Part enrichment upsert.
 *
 * JSON shape (file or POST /api/parts/enrich-batch):
 * {
 *   "items": [
 *     {
 *       "partNumber": "2892427",
 *       "id": 123,
 *       "polishedDescription": null,
 *       "manufacturer": null,
 *       "vendor": null,
 *       "engineFamily": "Cummins",
 *       "notes": null,
 *       "specs": null,
 *       "sourceUrl": null,
 *       "aliases": [],
 *       "parentId": null,
 *       "kitComponents": [{ "partNumber": "3164736", "description": null, "qty": 4 }]
 *     }
 *   ]
 * }
 *
 * Match by id when that id exists, otherwise by normalized partNumber
 * (all live duplicates with that P# are updated). Omitted keys are left
 * alone. Explicit null clears a field. Unknown engine families and bad
 * URLs reject that row. Inventory quantity, shelf, status, and description
 * are never modified. Parts are never created or deleted.
 */

const { normalizePartNumber } = require('../data/masterInventoryLayout');

const ENGINE_FAMILIES = ['MX', 'Cummins', 'CAT', 'Detroit', 'Allison', 'Paccar', 'General'];

const ENRICHMENT_KEYS = [
  'polishedDescription',
  'manufacturer',
  'vendor',
  'engineFamily',
  'notes',
  'specs',
  'sourceUrl',
  'aliases',
  'parentId',
  'kitComponents',
];

const IGNORED_INVENTORY_KEYS = [
  'description',
  'shelf',
  'category',
  'quantity',
  'minQuantity',
  'status',
  'checkedOutBy',
  'checkedOutDate',
];

const FAMILY_ALIASES = {
  mx: 'MX',
  cummins: 'Cummins',
  cat: 'CAT',
  caterpillar: 'CAT',
  detroit: 'Detroit',
  allison: 'Allison',
  paccar: 'Paccar',
  general: 'General',
};

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function emptyToNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function normalizeEngineFamily(value) {
  if (value == null || value === '') return { value: null };
  const key = String(value).trim().toLowerCase();
  if (!FAMILY_ALIASES[key]) {
    return { error: `engineFamily must be one of ${ENGINE_FAMILIES.join(', ')} or null` };
  }
  return { value: FAMILY_ALIASES[key] };
}

function normalizeSourceUrl(value) {
  if (value == null || value === '') return { value: null };
  let url;
  try {
    url = new URL(String(value).trim());
  } catch (error) {
    return { error: 'sourceUrl must be an http(s) URL or null' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'sourceUrl must be an http(s) URL or null' };
  }
  return { value: url.toString() };
}

function normalizeAliases(value) {
  if (value == null) return { value: [] };
  if (!Array.isArray(value)) return { error: 'aliases must be an array of strings or null' };
  const aliases = [];
  for (const entry of value) {
    if (entry == null || entry === '') continue;
    if (typeof entry !== 'string') return { error: 'aliases must be strings' };
    const text = entry.trim();
    if (text && !aliases.includes(text)) aliases.push(text);
  }
  return { value: aliases };
}

function normalizeKitComponents(value) {
  if (value == null) return { value: [] };
  if (!Array.isArray(value)) return { error: 'kitComponents must be an array or null' };
  const components = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      return { error: 'kitComponents entries must be objects' };
    }
    const qty = entry.qty == null || entry.qty === '' ? null : Number(entry.qty);
    if (qty != null && !Number.isFinite(qty)) {
      return { error: 'kitComponents.qty must be a number or null' };
    }
    components.push({
      partNumber: emptyToNull(entry.partNumber) || '',
      description: emptyToNull(entry.description) || '',
      qty: qty == null ? 1 : qty,
    });
  }
  return { value: components };
}

function normalizeParentId(value) {
  if (value == null || value === '') return { value: null };
  const id = Number(value);
  if (!Number.isInteger(id)) return { error: 'parentId must be an integer or null' };
  return { value: id };
}

function buildPatch(item, now) {
  const patch = {};
  if (hasOwn(item, 'polishedDescription')) patch.polishedDescription = emptyToNull(item.polishedDescription);
  if (hasOwn(item, 'manufacturer')) patch.manufacturer = emptyToNull(item.manufacturer);
  if (hasOwn(item, 'vendor')) patch.vendor = emptyToNull(item.vendor);
  if (hasOwn(item, 'notes')) patch.notes = emptyToNull(item.notes);
  if (hasOwn(item, 'specs')) patch.specs = emptyToNull(item.specs);
  if (hasOwn(item, 'engineFamily')) {
    const family = normalizeEngineFamily(item.engineFamily);
    if (family.error) return family;
    patch.engineFamily = family.value;
  }
  if (hasOwn(item, 'sourceUrl')) {
    const url = normalizeSourceUrl(item.sourceUrl);
    if (url.error) return url;
    patch.sourceUrl = url.value;
  }
  if (hasOwn(item, 'aliases')) {
    const aliases = normalizeAliases(item.aliases);
    if (aliases.error) return aliases;
    patch.aliases = aliases.value;
  }
  if (hasOwn(item, 'kitComponents')) {
    const kits = normalizeKitComponents(item.kitComponents);
    if (kits.error) return kits;
    patch.kitComponents = kits.value;
  }
  if (hasOwn(item, 'parentId')) {
    const parentId = normalizeParentId(item.parentId);
    if (parentId.error) return parentId;
    patch.parentId = parentId.value;
  }
  if (hasOwn(item, 'lastEnrichedAt') && item.lastEnrichedAt) {
    const when = new Date(item.lastEnrichedAt);
    if (Number.isNaN(when.getTime())) return { error: 'lastEnrichedAt is not a valid date' };
    patch.lastEnrichedAt = when.toISOString();
  } else if (Object.keys(patch).length > 0) {
    patch.lastEnrichedAt = new Date(now).toISOString();
  }
  return { patch };
}

function findMatches(parts, item) {
  if (item.id != null && item.id !== '') {
    const id = Number(item.id);
    const byId = parts.filter((part) => part.id === id);
    if (byId.length > 0) return byId;
  }
  const norm = normalizePartNumber(item.partNumber);
  if (!norm) return [];
  return parts.filter((part) => normalizePartNumber(part.partNumber) === norm);
}

function itemsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.parts)) return payload.parts;
  return null;
}

function applyEnrichmentBatch(parts, payload, now = new Date()) {
  const items = itemsFromPayload(payload);
  if (!items) {
    return {
      error: 'Payload must be an array or { items: [...] }',
      parts,
      updated: [],
      unmatched: [],
      rejected: [],
      summary: null,
    };
  }

  const partsCopy = parts.map((part) => ({ ...part }));
  const updated = [];
  const unmatched = [];
  const rejected = [];
  let ignoredInventoryFields = 0;

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      rejected.push({ error: 'Each item must be an object' });
      continue;
    }
    const ignored = IGNORED_INVENTORY_KEYS.filter((key) => hasOwn(item, key));
    if (ignored.length) ignoredInventoryFields += 1;

    const built = buildPatch(item, now);
    if (built.error) {
      rejected.push({
        id: item.id ?? null,
        partNumber: item.partNumber ?? null,
        error: built.error,
      });
      continue;
    }
    if (!built.patch || Object.keys(built.patch).length === 0) {
      rejected.push({
        id: item.id ?? null,
        partNumber: item.partNumber ?? null,
        error: 'No enrichment fields provided',
      });
      continue;
    }

    const matches = findMatches(partsCopy, item);
    if (matches.length === 0) {
      unmatched.push({ id: item.id ?? null, partNumber: item.partNumber ?? null });
      continue;
    }

    for (const part of matches) {
      Object.assign(part, built.patch);
      updated.push({
        id: part.id,
        partNumber: part.partNumber,
        patch: { ...built.patch },
        duplicate: matches.length > 1,
      });
    }
  }

  if (partsCopy.length !== parts.length) {
    throw new Error('enrichment refused to change inventory size');
  }

  return {
    parts: partsCopy,
    updated,
    unmatched,
    rejected,
    summary: {
      input: items.length,
      partsUpdated: updated.length,
      unmatched: unmatched.length,
      rejected: rejected.length,
      ignoredInventoryFields,
      inventoryCountBefore: parts.length,
      inventoryCountAfter: partsCopy.length,
      deleted: 0,
    },
  };
}

function isFilled(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function enrichmentCoverage(parts) {
  const total = parts.length;
  const count = (pred) => parts.filter(pred).length;
  const byField = {
    polishedDescription: count((part) => isFilled(part.polishedDescription)),
    manufacturer: count((part) => isFilled(part.manufacturer)),
    vendor: count((part) => isFilled(part.vendor)),
    engineFamily: count((part) => ENGINE_FAMILIES.includes(part.engineFamily)),
    notesOrSpecs: count((part) => isFilled(part.notes) || isFilled(part.specs)),
    sourceUrl: count((part) => isFilled(part.sourceUrl)),
    lastEnrichedAt: count((part) => isFilled(part.lastEnrichedAt)),
    aliases: count((part) => isFilled(part.aliases)),
  };
  const byEngineFamily = { unset: 0 };
  for (const family of ENGINE_FAMILIES) byEngineFamily[family] = 0;
  for (const part of parts) {
    if (ENGINE_FAMILIES.includes(part.engineFamily)) byEngineFamily[part.engineFamily] += 1;
    else byEngineFamily.unset += 1;
  }
  const enriched = count((part) => ENRICHMENT_KEYS.some((key) => isFilled(part[key])) || isFilled(part.lastEnrichedAt));
  const percent = (value) => (total === 0 ? 0 : Math.round((value / total) * 1000) / 10);
  return {
    total,
    enriched,
    missing: total - enriched,
    percentEnriched: percent(enriched),
    byField,
    percentByField: Object.fromEntries(
      Object.entries(byField).map(([key, value]) => [key, percent(value)])
    ),
    byEngineFamily,
  };
}

module.exports = {
  ENGINE_FAMILIES,
  ENRICHMENT_KEYS,
  applyEnrichmentBatch,
  enrichmentCoverage,
};
