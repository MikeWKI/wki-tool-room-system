#!/usr/bin/env node
/**
 * Load ~95 days of shop checkout/check-in history.
 * Does not delete parts. Re-running replaces the prior activity batch and
 * reassigns any leftover removed technician names.
 *
 * Dry run:
 *   node scripts/seed-shop-activity.js
 *
 * Apply against Mongo (MONGODB_URI) or the JSON fallback:
 *   node scripts/seed-shop-activity.js --apply
 *
 * Against the Render API after deploy (PIN stays on the server):
 *   curl -s -X POST "$API/api/audit/load-activity" \
 *     -H 'Content-Type: application/json' \
 *     -d '{"pin":"'"$MANAGE_PIN"'","confirm":false}'
 *   curl -s -X POST "$API/api/audit/load-activity" \
 *     -H 'Content-Type: application/json' \
 *     -d '{"pin":"'"$MANAGE_PIN"'","confirm":true}'
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const DatabaseService = require('../services/DatabaseService');
const { buildShopActivity } = require('../services/shopActivitySeed');
const { mergeActivityBatch, checkoutFieldPatches } = require('../services/shopActivityApply');

async function main() {
  const apply = process.argv.includes('--apply');
  const db = new DatabaseService();
  await db.initialize();
  const parts = await db.getParts();
  if (!parts.length) {
    console.error('No parts loaded. History was not written.');
    process.exit(1);
  }
  const generated = buildShopActivity({ parts, asOf: new Date() });
  const transactions = await db.getTransactions();
  const existingBatch = await db.getAuditBatch(generated.batchKey);
  const merged = mergeActivityBatch({ parts, transactions, existingBatch, generated });
  console.log(JSON.stringify({
    ...generated.summary,
    parts: parts.length,
    partsDeleted: 0,
    replacesBatch: true,
    outsideBatchRelabeled: merged.outsideBatchRelabeled,
    systemRelabeled: merged.systemRelabeled,
    checkedOutByReassigned: merged.checkedOutByReassigned,
    checkedOutByCleared: merged.checkedOutByCleared,
  }, null, 2));
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write history.');
    process.exit(0);
  }
  const batchRows = merged.transactions.filter((row) => row.batchKey === generated.batchKey);
  await db.applyActivityBatch(generated.batchKey, batchRows, merged.keptTransactions);
  const patches = checkoutFieldPatches(parts, merged.parts);
  if (patches.length) await db.patchPartsById(patches);
  await db.saveAuditBatch(merged.batch);
  console.log(`Replaced ${batchRows.length} history rows. Patched ${patches.length} parts. Relabeled leftover names: ${merged.outsideBatchRelabeled}. System labels: ${merged.systemRelabeled}. Deleted parts: 0.`);
  process.exit(0);
}

main().catch((error) => {
  const { logStoreError } = require('../services/safeLog');
  logStoreError('seed-shop-activity', error);
  process.exit(1);
});
