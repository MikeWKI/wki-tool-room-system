#!/usr/bin/env node
/**
 * Dry-run JB vs local JSON parts (no network, no writes).
 * Usage: node scripts/reconcile-jb-inventory.js [path/to/parts.json]
 */
const fs = require('fs');
const path = require('path');
const { reconcileJbWithLive } = require('../services/inventoryReconcile');

const partsPath =
  process.argv[2] ||
  path.join(__dirname, '../database/parts.json');

let parts = [];
try {
  parts = JSON.parse(fs.readFileSync(partsPath, 'utf8'));
} catch (e) {
  console.error('Could not read parts file:', e && e.name, e && e.code, 'store_error');
  process.exit(1);
}

const report = reconcileJbWithLive(parts);
console.log(JSON.stringify(report.meta, null, 2));
