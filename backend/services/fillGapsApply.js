const {
  normalizePartNumber,
  isSyntheticJbPartNumber,
  resolvePartLocationId,
} = require('../data/masterInventoryLayout');
const { reconcileJbWithLive } = require('./inventoryReconcile');

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

function textDiff(a, b) {
  return String(a ?? '').trim() !== String(b ?? '').trim();
}

/**
 * Fields that must not be written to live unless staging decision is accept_jb.
 * TBD / empty / unmapped shelf fills are the fill-gaps exception.
 */
function reviewFieldsFor(row, live, jb, { locationConflict, tbd }) {
  const fields = [];
  const shelfDiff = jb.shelf && textDiff(jb.shelf, live.shelf);
  if (locationConflict || (shelfDiff && !tbd)) {
    fields.push('shelf');
  }
  for (const diff of row.diffs || []) {
    if (diff.field === 'shelf') continue;
    if (!fields.includes(diff.field)) fields.push(diff.field);
  }
  return fields;
}

function acceptedFieldPatch(jb, live) {
  const patch = {};
  if (jb.description && textDiff(jb.description, live.description)) {
    patch.description = jb.description;
  }
  if (jb.category && textDiff(jb.category, live.category)) {
    patch.category = jb.category;
  }
  if (jb.quantity != null && Number(jb.quantity) !== Number(live.quantity)) {
    patch.quantity = Number(jb.quantity);
  }
  return patch;
}

function pushJbStaging(actions, row, reason, fields) {
  const location = reason === 'location_conflict';
  actions.jbStaging.push({
    partNumber: row.partNumber,
    liveId: row.live.id,
    reason,
    fields,
    live: {
      description: row.live.description,
      shelf: row.live.shelf,
      category: row.live.category,
      quantity: row.live.quantity,
    },
    jb: {
      description: row.jb.description,
      shelf: row.jb.shelf,
      category: row.jb.category,
      quantity: row.jb.quantity,
    },
    message: location
      ? 'Location conflict stays in JB Staging until Accept JB. Fill-gaps will not move this shelf.'
      : 'Field differences stay in JB Staging until Accept JB. Fill-gaps will not overwrite these fields.',
  });
}

/**
 * Compute fill-gaps plan (no writes).
 * Strategy name stays fill-gaps. JB Staging is the existing accept_jb review path,
 * not a separate import strategy.
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
    jbStaging: [],
  };

  for (const row of report.matched) {
    const norm = normalizePartNumber(row.partNumber);
    const decision = stagingDecisionFor(stagingIndex, norm);
    const live = row.live;
    const jb = row.jb;
    const acceptedJb = decision === 'accept_jb';

    if (decision === 'skip' || decision === 'accept_live') {
      actions.skippedStaging.push({
        partNumber: row.partNumber,
        reason: decision,
      });
      continue;
    }

    const tbd = isShelfTbdOrMissing(live);
    const locationConflict = row.locationMismatch && !tbd;
    const shelfJb = jb.shelf;
    const shelfDiff = Boolean(shelfJb && textDiff(shelfJb, live.shelf));
    const fields = reviewFieldsFor(row, live, jb, { locationConflict, tbd });

    if (locationConflict && !acceptedJb) {
      actions.skippedLocationConflict.push({
        partNumber: row.partNumber,
        liveShelf: live.shelf,
        jbShelf: shelfJb,
        message: 'Non-TBD shelf differs from JB; requires JB Staging accept_jb',
      });
      pushJbStaging(actions, row, 'location_conflict', fields.length ? fields : ['shelf']);
      continue;
    }

    if (!acceptedJb && fields.length > 0) {
      pushJbStaging(actions, row, 'field_diff', fields);
    }

    const patch = {};
    if (tbd && shelfDiff && !locationConflict) {
      patch.shelf = shelfJb;
    }

    let fieldPatch = {};
    if (acceptedJb) {
      fieldPatch = acceptedFieldPatch(jb, live);
      if (shelfDiff) patch.shelf = shelfJb;
      Object.assign(patch, fieldPatch);
    }

    if (!acceptedJb) {
      delete patch.description;
      delete patch.category;
      delete patch.quantity;
      if (!tbd) delete patch.shelf;
    }

    if (Object.keys(patch).length === 0) {
      const held = actions.jbStaging.some(
        (item) => item.partNumber === row.partNumber && item.liveId === live.id
      );
      if (!held) actions.unchanged.push({ partNumber: row.partNumber });
      continue;
    }

    if (patch.shelf) {
      actions.updateShelfFromJb.push({
        partNumber: row.partNumber,
        liveId: live.id,
        from: live.shelf,
        to: patch.shelf,
        autoTbd: tbd && !locationConflict,
        acceptedJb,
      });
    }

    const onlyFields = { ...patch };
    delete onlyFields.shelf;
    if (Object.keys(onlyFields).length > 0) {
      if (!acceptedJb) continue;
      actions.updateFieldsFromJb.push({
        partNumber: row.partNumber,
        liveId: live.id,
        patch: onlyFields,
        acceptedJb: true,
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
    reviewPath: 'jb-staging',
    policy: {
      strategy: IMPORT_STRATEGY,
      autoOnApply: [
        'Fill TBD, empty, or unmapped shelves from JB',
        'Add JB part numbers that are missing live (NOPN rows are not added)',
      ],
      jbStagingRequired: [
        'Non-TBD location conflicts',
        'Description, category, and quantity differences',
        'Any other non-TBD shelf difference',
      ],
      never: [
        'Delete live parts',
        'Overwrite conflicting fields without Accept JB in staging',
      ],
    },
    meta: report.meta,
    counts: {
      updateShelfFromJb: actions.updateShelfFromJb.length,
      updateFieldsFromJb: actions.updateFieldsFromJb.length,
      addFromJb: actions.addFromJb.length,
      skippedLocationConflict: actions.skippedLocationConflict.length,
      skippedStaging: actions.skippedStaging.length,
      unchanged: actions.unchanged.length,
      jbStaging: actions.jbStaging.length,
    },
    actions,
  };
}

function applyFillGapsToParts(parts, stagingRecords, appliedBy = 'Reconcile fill-gaps') {
  const plan = planFillGapsApply(parts, stagingRecords);
  const partsCopy = parts.map((p) => ({ ...p }));
  const byId = new Map(partsCopy.map((p) => [p.id, p]));
  let nextId = Math.max(0, ...partsCopy.map((p) => p.id || 0)) + 1;
  const originalIds = new Set(parts.map((p) => p.id));

  const applied = {
    shelvesUpdated: 0,
    fieldsUpdated: 0,
    partsAdded: 0,
    details: [],
  };

  const applyPatch = (liveId, patch, partNumber) => {
    const part = byId.get(liveId);
    if (!part) return;
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
    applied.details.push({ partNumber, id: liveId });
  };

  for (const row of plan.actions.updateShelfFromJb) {
    if (!row.autoTbd && !row.acceptedJb) continue;
    applyPatch(row.liveId, { shelf: row.to }, row.partNumber);
  }

  for (const row of plan.actions.updateFieldsFromJb) {
    if (!row.acceptedJb) continue;
    const safe = { ...row.patch };
    delete safe.shelf;
    applyPatch(row.liveId, safe, row.partNumber);
  }

  for (const row of plan.actions.addFromJb) {
    const exists = partsCopy.some(
      (p) => normalizePartNumber(p.partNumber) === normalizePartNumber(row.partNumber)
    );
    if (exists) continue;
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

  for (const id of originalIds) {
    if (!byId.has(id)) {
      throw new Error('fill-gaps refused to remove a live part');
    }
  }
  if (partsCopy.length < parts.length) {
    throw new Error('fill-gaps refused to shrink inventory');
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
