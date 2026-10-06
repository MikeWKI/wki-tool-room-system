#!/usr/bin/env node
/**
 * Load part enrichment JSON. Does not create or delete inventory rows.
 *
 * Dry run (default):
 *   node scripts/load-enrichment.js ./data/enrichment.example.json
 *
 * Apply:
 *   node scripts/load-enrichment.js ./data/enrichment.json --apply
 *
 * JSON shape: { "items": [ { "partNumber": "...", "engineFamily": null, ... } ] }
 * See backend/services/partEnrichment.js for the field list.
 * Unknown values should be null. Do not invent specs.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const DatabaseService = require('../services/DatabaseService');
const { applyEnrichmentBatch } = require('../services/partEnrichment');

async function main() {
  const fileArg = process.argv.find((arg) => !arg.startsWith('-') && arg !== process.argv[0] && arg !== process.argv[1]);
  const apply = process.argv.includes('--apply');
  if (!fileArg) {
    console.error('Usage: node scripts/load-enrichment.js <file.json> [--apply]');
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(path.resolve(fileArg), 'utf8'));
  const db = new DatabaseService();
  await db.initialize();
  const parts = await db.getParts();
  const result = applyEnrichmentBatch(parts, payload);
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  console.log(JSON.stringify(result.summary, null, 2));
  if (result.rejected.length) {
    console.log('Rejected:', JSON.stringify(result.rejected.slice(0, 20), null, 2));
  }
  if (result.unmatched.length) {
    console.log('Unmatched:', JSON.stringify(result.unmatched.slice(0, 20), null, 2));
  }
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write enrichment fields.');
    process.exit(0);
  }
  if (result.summary.deleted !== 0 || result.summary.inventoryCountAfter !== parts.length) {
    console.error('Refusing to write: inventory size would change.');
    process.exit(1);
  }
  await db.patchPartsById(result.updated.map((row) => ({ id: row.id, patch: row.patch })));
  console.log(`Updated ${result.updated.length} parts. No inventory rows deleted.`);
  process.exit(0);
}

main().catch((error) => {
  const { logStoreError } = require('../services/safeLog');
  logStoreError('load-enrichment', error);
  process.exit(1);
});
