/**
 * Merge a generated activity batch into live transactions.
 * Replaces only rows with the same batchKey. Restores part snapshots from
 * the previous apply, then marks a few parts checked out. Never deletes parts.
 */

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
  };
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
  snapshotsEqual,
  clone,
};
