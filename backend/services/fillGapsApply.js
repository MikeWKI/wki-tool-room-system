const {
  normalizePartNumber,
  resolvePartLocationId,
  isSyntheticJbPartNumber,
} = require('../data/masterInventoryLayout');
const { reconcileJbWithLive, loadJbInventory } = require('./inventoryReconcile');

const IMPORT_STRATEGY = 'fill-gaps';

function isShelfTbdOrMissing(part) {
  const shelf = part?.shelf;
  if (!shelf || String(shelf).trim() === '') return true;
  if (String(shelf).toUpperCase() === 'TBD') return true;
  return !resolvePartLocationId(shelf, part.category);
}

function buildStagingIndex(stagingRecords) {
  const map = new Map();
  for (const row of stagingRecords || []) {
    const norm = row.normalizedPartNumber || normalizePartNumber(row.partNumber);
    if (norm) map.set(norm, row);
  }
  return map;
}

function stagingDecisionFor(stagingIndex, norm) {
  return stagingIndex.get(norm)?.decision || null;
}

/**
 * Compute fill-gaps plan (no writes).
 */
function planFillGapsApply(parts, stagingRecords = []) {
  const report = reconcileJbWithLive(parts);
  const stagingIndex = buildStagingIndex(stagingRecords);
  const actions = {
    updateShelfFromJb: [],
    updateFieldsFromJb: [],
    addFromJb: [],
    skippedLocationConflict: [],
    skippedStaging: [],
    skippedDuplicateLive: [],
    unchanged: [],
  };

  for (const row of report.matched) {
    const norm = normalizePartNumber(row.partNumber);
    const decision = stagingDecisionFor(stagingIndex, norm);
    const live = row.live;
    const jb = row.jb;

    if (decision === 'skip' || decision === 'accept_live') {
      actions.skippedStaging.push({
        partNumber: row.partNumber,
        reason: decision,
      });
      continue;
    }

    const shelfJb = jb.shelf;
    const tbd = isShelfTbdOrMissing(live);
    const locationConflict =
      row.locationMismatch && !tbd;

    if (locationConflict && decision !== 'accept_jb') {
      actions.skippedLocationConflict.push({
        partNumber: row.partNumber,
        liveShelf: live.shelf,
        jbShelf: shelfJb,
        message: 'Non-TBD shelf differs from JB; requires staging accept_jb',
      });
      continue;
    }

    const patch = {};
    if (tbd || locationConflict) {
      if (shelfJb && shelfJb !== live.shelf) {
        patch.shelf = shelfJb;
      }
    }

    if (decision === 'accept_jb') {
      if (jb.description && jb.description !== live.description) {
        patch.description = jb.description;
      }
      if (jb.category && jb.category !== live.category) {
        patch.category = jb.category;
      }
      if (
        jb.quantity != null &&
        Number(jb.quantity) !== Number(live.quantity)
      ) {
        patch.quantity = Number(jb.quantity);
      }
      if (shelfJb && shelfJb !== live.shelf && !patch.shelf) {
        patch.shelf = shelfJb;
      }
    }

    if (Object.keys(patch).length === 0) {
      actions.unchanged.push({ partNumber: row.partNumber });
      continue;
    }

    if (patch.shelf) {
      actions.updateShelfFromJb.push({
        partNumber: row.partNumber,
        liveId: live.id,
        from: live.shelf,
        to: patch.shelf,
        autoTbd: tbd,
        acceptedJb: decision === 'accept_jb',
      });
    }

    const fieldPatch = { ...patch };
    delete fieldPatch.shelf;
    if (Object.keys(fieldPatch).length > 0) {
      actions.updateFieldsFromJb.push({
        partNumber: row.partNumber,
        liveId: live.id,
        patch: fieldPatch,
      });
    }
  }

  for (const jbRow of report.jbOnly) {
    if (isSyntheticJbPartNumber(jbRow.partNumber)) continue;
    const norm = normalizePartNumber(jbRow.partNumber);
    const decision = stagingDecisionFor(stagingIndex, norm);
    if (decision === 'skip' || decision === 'accept_live') {
      actions.skippedStaging.push({
        partNumber: jbRow.partNumber,
        reason: decision || 'none',
      });
      continue;
    }
    actions.addFromJb.push({
      partNumber: jbRow.partNumber,
      description: jbRow.description,
      shelf: jbRow.shelf,
      category: jbRow.category,
      quantity: jbRow.quantity ?? 1,
    });
  }

  return {
    strategy: IMPORT_STRATEGY,
    meta: report.meta,
    counts: {
      updateShelfFromJb: actions.updateShelfFromJb.length,
      updateFieldsFromJb: actions.updateFieldsFromJb.length,
      addFromJb: actions.addFromJb.length,
      skippedLocationConflict: actions.skippedLocationConflict.length,
      skippedStaging: actions.skippedStaging.length,
      unchanged: actions.unchanged.length,
    },
    actions,
  };
}

function applyFillGapsToParts(parts, stagingRecords, appliedBy = 'Reconcile fill-gaps') {
  const plan = planFillGapsApply(parts, stagingRecords);
  const partsCopy = parts.map((p) => ({ ...p }));
  const byId = new Map(partsCopy.map((p) => [p.id, p]));
  let nextId = Math.max(0, ...partsCopy.map((p) => p.id || 0)) + 1;

  const applied = {
    shelvesUpdated: 0,
    fieldsUpdated: 0,
    partsAdded: 0,
    details: [],
  };

  const applyPatch = (liveId, patch, partNumber) => {
    const part = byId.get(liveId);
    if (!part) return;
    const before = { ...part };
    let touched = false;
    if (patch.shelf && patch.shelf !== part.shelf) {
      part.previousLocation = part.shelf;
      part.lastLocationChange = new Date().toISOString();
      part.shelf = patch.shelf;
      applied.shelvesUpdated += 1;
      touched = true;
    }
    if (patch.description && patch.description !== part.description) {
      part.description = patch.description;
      touched = true;
    }
    if (patch.category && patch.category !== part.category) {
      part.category = patch.category;
      touched = true;
    }
    if (patch.quantity != null && Number(patch.quantity) !== Number(part.quantity)) {
      part.quantity = patch.quantity;
      touched = true;
    }
    if (!touched) return;
    part.lastModified = new Date().toISOString();
    part.modifiedBy = appliedBy;
    applied.fieldsUpdated += 1;
    applied.details.push({ partNumber, before, after: { ...part } });
  };

  for (const row of plan.actions.updateShelfFromJb) {
    applyPatch(row.liveId, { shelf: row.to }, row.partNumber);
  }

  for (const row of plan.actions.updateFieldsFromJb) {
    applyPatch(row.liveId, row.patch, row.partNumber);
  }

  for (const row of plan.actions.addFromJb) {
    const exists = partsCopy.some(
      (p) =>
        normalizePartNumber(p.partNumber) === normalizePartNumber(row.partNumber)
    );
    if (exists) {
      continue;
    }
    const newPart = {
      id: nextId++,
      partNumber: row.partNumber,
      description: row.description || '',
      shelf: row.shelf || 'TBD',
      category: row.category || 'Uncategorized',
      status: 'available',
      checkedOutBy: null,
      checkedOutDate: null,
      quantity: row.quantity ?? 1,
      minQuantity: 1,
      lastModified: new Date().toISOString(),
      modifiedBy: appliedBy,
    };
    partsCopy.push(newPart);
    byId.set(newPart.id, newPart);
    applied.partsAdded += 1;
    applied.details.push({ added: newPart.partNumber, id: newPart.id });
  }

  return {
    strategy: IMPORT_STRATEGY,
    plan,
    parts: partsCopy,
    applied,
    liveCountBefore: parts.length,
    liveCountAfter: partsCopy.length,
  };
}

module.exports = {
  IMPORT_STRATEGY,
  isShelfTbdOrMissing,
  planFillGapsApply,
  applyFillGapsToParts,
};
