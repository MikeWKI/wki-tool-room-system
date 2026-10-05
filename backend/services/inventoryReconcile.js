const fs = require('fs');
const path = require('path');
const {
  normalizePartNumber,
  resolvePartLocationId,
  isSyntheticJbPartNumber,
  getLocationById,
  formatLocationLabel,
} = require('../data/masterInventoryLayout');

const JB_FILE = path.join(__dirname, '../data/inventory-jb-2026-02-04.json');

function loadJbInventory() {
  const raw = fs.readFileSync(JB_FILE, 'utf8');
  return JSON.parse(raw);
}

function buildLivePartIndex(parts) {
  const byPn = new Map();
  const duplicates = [];

  for (const part of parts) {
    if (isSyntheticJbPartNumber(part.partNumber)) continue;
    const norm = normalizePartNumber(part.partNumber);
    if (!norm) continue;
    if (byPn.has(norm)) {
      duplicates.push({
        partNumber: part.partNumber,
        ids: [byPn.get(norm).id, part.id],
      });
    } else {
      byPn.set(norm, part);
    }
  }

  return { byPn, duplicates };
}

function diffFields(live, jb) {
  const diffs = [];
  const compare = [
    ['shelf', 'shelf'],
    ['description', 'description'],
    ['category', 'category'],
    ['quantity', 'quantity'],
  ];
  for (const [liveKey, jbKey] of compare) {
    const a = live?.[liveKey];
    const b = jb?.[jbKey];
    if (String(a ?? '').trim() !== String(b ?? '').trim()) {
      diffs.push({ field: liveKey, live: a, jb: b });
    }
  }
  return diffs;
}

/**
 * Dry-run reconcile JB JSON against live parts (read-only).
 */
function reconcileJbWithLive(parts) {
  const jbParts = loadJbInventory();
  const { byPn: liveByPn, duplicates: liveDuplicates } = buildLivePartIndex(parts);

  const jbByPn = new Map();
  const jbDuplicates = [];
  const jbNoPn = [];

  for (const row of jbParts) {
    if (isSyntheticJbPartNumber(row.partNumber)) {
      jbNoPn.push(row);
      continue;
    }
    const norm = normalizePartNumber(row.partNumber);
    if (!norm) continue;
    if (jbByPn.has(norm)) {
      jbDuplicates.push({ partNumber: row.partNumber, norm });
    } else {
      jbByPn.set(norm, row);
    }
  }

  const matched = [];
  const jbOnly = [];
  const liveOnly = [];

  for (const [norm, jbRow] of jbByPn.entries()) {
    const live = liveByPn.get(norm);
    if (!live) {
      jbOnly.push({
        partNumber: jbRow.partNumber,
        description: jbRow.description,
        shelf: jbRow.shelf,
        category: jbRow.category,
        quantity: jbRow.quantity,
      });
      continue;
    }

    const diffs = diffFields(live, jbRow);
    const liveLocId = resolvePartLocationId(live.shelf, live.category);
    const jbLocId = resolvePartLocationId(jbRow.shelf, jbRow.category);

    matched.push({
      partNumber: live.partNumber,
      liveId: live.id,
      live: {
        id: live.id,
        partNumber: live.partNumber,
        description: live.description,
        shelf: live.shelf,
        category: live.category,
        quantity: live.quantity,
        status: live.status,
        locationId: liveLocId,
        locationLabel: liveLocId ? formatLocationLabel(liveLocId) : null,
      },
      jb: {
        partNumber: jbRow.partNumber,
        description: jbRow.description,
        shelf: jbRow.shelf,
        category: jbRow.category,
        quantity: jbRow.quantity,
        locationId: jbLocId,
        locationLabel: jbLocId ? formatLocationLabel(jbLocId) : null,
      },
      diffs,
      locationMismatch: Boolean(
        jbLocId && liveLocId && jbLocId !== liveLocId
      ),
    });
  }

  for (const [norm, live] of liveByPn.entries()) {
    if (!jbByPn.has(norm)) {
      liveOnly.push({
        id: live.id,
        partNumber: live.partNumber,
        description: live.description,
        shelf: live.shelf,
        category: live.category,
        quantity: live.quantity,
        status: live.status,
      });
    }
  }

  const tbdOrUnmapped = parts.filter((p) => {
    const shelf = p.shelf;
    if (!shelf || String(shelf).toUpperCase() === 'TBD') return true;
    return !resolvePartLocationId(shelf, p.category);
  });

  const matchedWithDiffs = matched.filter(
    (m) => m.diffs.length > 0 || m.locationMismatch
  );
  const matchedClean = matched.filter(
    (m) => m.diffs.length === 0 && !m.locationMismatch
  );

  return {
    meta: {
      jbSource: 'inventory-jb-2026-02-04.json',
      jbTotalRows: jbParts.length,
      jbWithPartNumber: jbByPn.size,
      jbNoPartNumberRows: jbNoPn.length,
      liveTotal: parts.length,
      matched: matched.length,
      matchedClean: matchedClean.length,
      matchedWithDiffs: matchedWithDiffs.length,
      jbOnly: jbOnly.length,
      liveOnly: liveOnly.length,
      liveDuplicatePartNumbers: liveDuplicates.length,
      jbDuplicatePartNumbers: jbDuplicates.length,
      tbdOrUnmappedShelf: tbdOrUnmapped.length,
    },
    jbOnly,
    liveOnly,
    matched,
    matchedWithDiffs,
    matchedClean,
    jbNoPartNumber: jbNoPn,
    liveDuplicatePartNumbers: liveDuplicates,
    jbDuplicatePartNumbers: jbDuplicates,
    tbdOrUnmapped: tbdOrUnmapped.map((p) => ({
      id: p.id,
      partNumber: p.partNumber,
      shelf: p.shelf,
      category: p.category,
    })),
  };
}

module.exports = {
  loadJbInventory,
  reconcileJbWithLive,
  buildLivePartIndex,
  JB_FILE,
};
