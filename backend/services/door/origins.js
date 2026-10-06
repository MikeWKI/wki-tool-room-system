/**
 * Seeded shop history is already distinguishable. buildShopActivity stamps
 * batchKey 'shop-activity-95d' on every generated row (see shopActivitySeed).
 * Those rows are not rewritten. Metrics treat that batch key, or an explicit
 * source of 'seed', as seeded. Simulated door traffic uses source 'simulated'.
 */

const { BATCH_KEY } = require('../shopActivitySeed');

function transactionOrigin(row) {
  if (!row || typeof row !== 'object') return 'live';
  if (row.source === 'simulated' || row.source === 'seed') return row.source;
  if (row.batchKey === BATCH_KEY) return 'seed';
  return 'live';
}

function countsInMetrics(origin, { includeSeed = false, includeSimulated = false } = {}) {
  if (origin === 'seed' && !includeSeed) return false;
  if (origin === 'simulated' && !includeSimulated) return false;
  return true;
}

module.exports = {
  SEED_BATCH_KEY: BATCH_KEY,
  transactionOrigin,
  countsInMetrics,
};
