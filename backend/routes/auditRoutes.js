const { buildShopActivity } = require('../services/shopActivitySeed');
const { mergeActivityBatch, checkoutFieldPatches } = require('../services/shopActivityApply');

function pinRejected(req, res) {
  const expected = process.env.MANAGE_PIN;
  if (!expected) {
    res.status(503).json({
      ok: false,
      error: 'Manage PIN is not configured on the server (set MANAGE_PIN).',
    });
    return true;
  }
  const pin = req.body?.pin || req.get('x-manage-pin');
  if (String(pin) !== String(expected)) {
    res.status(401).json({ ok: false, error: 'Manage PIN rejected' });
    return true;
  }
  return false;
}

function registerAuditRoutes(app, deps) {
  const { readParts, readTransactions, dbService } = deps;

  app.post('/api/audit/load-activity', async (req, res) => {
    try {
      if (pinRejected(req, res)) return;
      const confirm = req.body?.confirm === true;
      const asOf = req.body?.asOf ? new Date(req.body.asOf) : new Date();
      if (Number.isNaN(asOf.getTime())) {
        return res.status(400).json({ error: 'asOf is not a valid date' });
      }

      const parts = await readParts();
      const generated = buildShopActivity({ parts, asOf });
      const transactions = await readTransactions();
      const existingBatch = await dbService.getAuditBatch(generated.batchKey);
      const merged = mergeActivityBatch({
        parts,
        transactions,
        existingBatch,
        generated,
      });
      const batchRows = merged.transactions.filter((row) => row.batchKey === generated.batchKey);
      const preview = {
        dryRun: !confirm,
        ...generated.summary,
        batchKey: generated.batchKey,
        rangeStart: generated.rangeStart,
        rangeEnd: generated.rangeEnd,
        partsInInventory: parts.length,
        partsDeleted: 0,
        replacesBatch: true,
        outsideBatchRelabeled: merged.outsideBatchRelabeled,
        systemRelabeled: merged.systemRelabeled,
        checkedOutByReassigned: merged.checkedOutByReassigned,
        checkedOutByCleared: merged.checkedOutByCleared,
      };

      if (!confirm) {
        return res.json({
          ...preview,
          message: 'Dry run. POST { "confirm": true } with the manage PIN to replace shop-activity-95d and clear removed names from other transactions and checked-out parts. Live parts are not deleted.',
        });
      }

      await dbService.replaceBatchTransactions(generated.batchKey, batchRows, merged.keptTransactions);
      const patches = checkoutFieldPatches(parts, merged.parts);
      if (patches.length > 0) await dbService.patchPartsById(patches);
      await dbService.saveAuditBatch(merged.batch);

      res.json({
        ...preview,
        dryRun: false,
        success: true,
        stillOpen: merged.batch.openPartIds.length,
        transactions: merged.batch.transactionCount,
        partsPatched: patches.length,
        partsDeleted: 0,
        message: 'Replaced shop-activity-95d. Removed technician names were reassigned on leftover transactions and checked-out parts. Fill-gaps apply labels were set to System. No parts were deleted.',
      });
    } catch (error) {
      res.status(500).json({ error: 'Activity history load failed', details: error.message });
    }
  });
}

module.exports = registerAuditRoutes;
