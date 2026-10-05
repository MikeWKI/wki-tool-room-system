/**
 * Merge a generated activity batch into live transactions.
 * Replaces every row with the same batchKey. Then rewrites leftover
 * transactions and checkedOutBy values that still name someone outside the
 * short roster. The fill-gaps apply label becomes System. Never deletes parts.
 */

const { TECHS, isAllowedTechName } = require('../data/techRoster');
const { mulberry32 } = require('./shopActivitySeed');

const SYSTEM_USER = 'System';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashString(text) {
  let hash = 2166136261;
  const value = String(text);
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function userKind(name) {
  const text = String(name || '').trim();
  if (!text) return 'blank';
  if (text.toLowerCase() === 'system') return 'system';
  if (/fill-gaps apply/i.test(text) || text === 'Reconcile fill-gaps') return 'internal';
  if (isAllowedTechName(text)) return 'tech';
  return 'removed';
}

function techForKey(key) {
  const rng = mulberry32(hashString(key) ^ 20261005);
  return TECHS[Math.floor(rng() * TECHS.length)].name;
}

function pairKey(row) {
  if (row.action === 'checkin' && row.checkoutId != null) return `pair:${row.checkoutId}`;
  if (row.action === 'checkout') return `pair:${row.id}`;
  return `row:${row.id}`;
}

function relabelHistory(transactions, parts) {
  let outsideBatchRelabeled = 0;
  let systemRelabeled = 0;
  let checkedOutByReassigned = 0;
  let checkedOutByCleared = 0;

  for (const row of transactions) {
    const kind = userKind(row.user);
    if (kind === 'internal' || kind === 'system') {
      if (row.user !== SYSTEM_USER) {
        row.user = SYSTEM_USER;
        systemRelabeled += 1;
      }
      continue;
    }
    if (kind === 'removed') {
      row.user = techForKey(pairKey(row));
      outsideBatchRelabeled += 1;
    }
  }

  for (const part of parts) {
    const kind = userKind(part.checkedOutBy);
    if (kind === 'tech' || kind === 'blank' || kind === 'system') continue;
    if (kind === 'internal') {
      part.checkedOutBy = null;
      part.checkedOutDate = null;
      if (part.status === 'checked_out') part.status = 'available';
      checkedOutByCleared += 1;
      continue;
    }
    part.checkedOutBy = techForKey(`part:${part.id}:${part.checkedOutDate || ''}`);
    checkedOutByReassigned += 1;
  }

  return {
    outsideBatchRelabeled,
    systemRelabeled,
    checkedOutByReassigned,
    checkedOutByCleared,
  };
}

function mergeActivityBatch({ parts, transactions, existingBatch, generated }) {
  const batchKey = generated.batchKey;
  const nextParts = parts.map((part) => ({ ...part }));
  const byId = new Map(nextParts.map((part) => [part.id, part]));
  let nextTx = (transactions || []).filter((row) => row.batchKey !== batchKey);

  for (const snap of existingBatch?.partSnapshots || []) {
    const part = byId.get(snap.id);
    if (!part) continue;
    part.status = snap.status;
    part.checkedOutBy = snap.checkedOutBy;
    part.checkedOutDate = snap.checkedOutDate;
    part.quantity = snap.quantity;
  }

  const relabel = relabelHistory(nextTx, nextParts);

  const snapshots = [];
  const appliedOpens = [];

  const closeUnapplied = (open) => {
    const start = new Date(open.checkedOutDate).getTime();
    const end = new Date(start + 48 * 60000);
    const ids = new Set(nextTx.map((row) => row.id));
    let id = end.getTime();
    while (ids.has(id)) id += 1;
    if (!nextTx.some((row) => row.id === open.checkout.id)) nextTx.push(open.checkout);
    nextTx.push({
      id,
      partId: open.partId,
      partNumber: open.checkout.partNumber,
      action: 'checkin',
      user: open.user,
      timestamp: end.toISOString(),
      notes: open.checkout.notes || '',
      roNumber: open.checkout.roNumber || null,
      unitNumber: open.checkout.unitNumber || null,
      checkoutId: open.checkout.id,
      batchKey,
    });
  };

  for (const open of generated.openParts || []) {
    const part = byId.get(open.partId);
    if (!part || part.status === 'checked_out') {
      closeUnapplied(open);
      continue;
    }
    snapshots.push({
      id: part.id,
      status: part.status,
      checkedOutBy: part.checkedOutBy ?? null,
      checkedOutDate: part.checkedOutDate ?? null,
      quantity: part.quantity,
    });
    part.status = 'checked_out';
    part.checkedOutBy = open.user;
    part.checkedOutDate = open.checkedOutDate;
    if (Number(part.quantity) > 0) part.quantity = Number(part.quantity) - 1;
    appliedOpens.push(open);
  }

  const already = new Set(nextTx.map((row) => row.id));
  for (const row of generated.transactions || []) {
    if (!already.has(row.id)) {
      nextTx.push(row);
      already.add(row.id);
    }
  }
  nextTx.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const originalIds = new Set(parts.map((part) => part.id));
  for (const id of originalIds) {
    if (!byId.has(id)) throw new Error('activity load refused to remove a live part');
  }
  if (nextParts.length !== parts.length) {
    throw new Error('activity load refused to change inventory size');
  }

  return {
    parts: nextParts,
    transactions: nextTx,
    batch: {
      batchKey,
      transactionCount: nextTx.filter((row) => row.batchKey === batchKey).length,
      partSnapshots: snapshots,
      openPartIds: appliedOpens.map((row) => row.partId),
      rangeStart: generated.rangeStart,
      rangeEnd: generated.rangeEnd,
      appliedAt: new Date().toISOString(),
    },
    touchedPartIds: snapshots.map((row) => row.id),
    partsDeleted: 0,
    ...relabel,
    keptTransactions: nextTx.filter((row) => row.batchKey !== batchKey),
  };
}

function sameCheckoutValue(left, right) {
  const norm = (value) => {
    if (value == null || value === '') return '';
    if (value instanceof Date) return value.toISOString();
    return String(value);
  };
  return norm(left) === norm(right);
}

function checkoutFieldPatches(beforeParts, afterParts) {
  const afterById = new Map(afterParts.map((part) => [part.id, part]));
  const patches = [];
  for (const before of beforeParts) {
    const after = afterById.get(before.id);
    if (!after) continue;
    const patch = {};
    let changed = false;
    for (const field of ['status', 'checkedOutBy', 'checkedOutDate', 'quantity']) {
      if (!sameCheckoutValue(before[field], after[field])) {
        patch[field] = after[field] ?? null;
        changed = true;
      }
    }
    if (changed) patches.push({ id: before.id, patch });
  }
  return patches;
}

function snapshotsEqual(parts, snapshots) {
  return snapshots.every((snap) => {
    const part = parts.find((row) => row.id === snap.id);
    if (!part) return false;
    return part.status === snap.status && part.quantity === snap.quantity;
  });
}

module.exports = {
  mergeActivityBatch,
  relabelHistory,
  userKind,
  checkoutFieldPatches,
  snapshotsEqual,
  clone,
};
