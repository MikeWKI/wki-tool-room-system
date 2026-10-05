const {
  SECTIONS,
  ALL_LOCATIONS,
  resolvePartLocationId,
  formatLocationLabel,
  shelfRecordsForSeed,
  normalizePartNumber,
} = require('../data/masterInventoryLayout');
const { loadJbInventory, reconcileJbWithLive } = require('../services/inventoryReconcile');
const ReconcileStagingService = require('../services/reconcileStagingService');

const APPLY_TO_LIVE_ENABLED = process.env.RECONCILE_APPLY_TO_LIVE === 'true';

function registerMasterInventoryRoutes(app, deps) {
  const { dbService, readParts, readShelves, writeShelves } = deps;
  const stagingService = new ReconcileStagingService(dbService);

  app.get('/api/inventory/layout', (req, res) => {
    res.json({
      sections: SECTIONS,
      locations: ALL_LOCATIONS,
      section1WestRackNote:
        'Section 1 maps to the physical West Rack (Cummins shelves 1–7, MX shelves 8–12).',
    });
  });

  app.get('/api/jb-inventory', (req, res) => {
    try {
      res.json({
        source: 'inventory-jb-2026-02-04.json',
        count: loadJbInventory().length,
        parts: loadJbInventory(),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to load JB inventory', details: error.message });
    }
  });

  app.get('/api/reconcile/report', async (req, res) => {
    try {
      const parts = await readParts();
      const report = reconcileJbWithLive(parts);
      const staging = await stagingService.readAll();
      res.json({
        ...report,
        staging: {
          count: staging.length,
          decisions: staging,
        },
        applyToLiveEnabled: APPLY_TO_LIVE_ENABLED,
      });
    } catch (error) {
      res.status(500).json({ error: 'Reconcile report failed', details: error.message });
    }
  });

  app.get('/api/reconcile/staging', async (req, res) => {
    try {
      const staging = await stagingService.readAll();
      res.json({ count: staging.length, decisions: staging, applyToLiveEnabled: APPLY_TO_LIVE_ENABLED });
    } catch (error) {
      res.status(500).json({ error: 'Failed to read staging', details: error.message });
    }
  });

  app.post('/api/reconcile/staging/accept', async (req, res) => {
    try {
      const { partNumber, decision, acceptedBy, jbSnapshot, liveSnapshot, proposedChanges, notes } =
        req.body || {};

      if (!partNumber || !['accept_jb', 'accept_live', 'skip'].includes(decision)) {
        return res.status(400).json({
          error: 'partNumber and decision (accept_jb | accept_live | skip) are required',
        });
      }

      const saved = await stagingService.upsertDecision({
        partNumber,
        decision,
        acceptedBy,
        jbSnapshot,
        liveSnapshot,
        proposedChanges,
        notes,
      });

      res.json({
        success: true,
        staging: saved,
        applyToLiveEnabled: APPLY_TO_LIVE_ENABLED,
        message: APPLY_TO_LIVE_ENABLED
          ? 'Draft saved (apply pipeline not implemented in this PR).'
          : 'Draft saved. Apply-to-live is disabled until Michael selects an import strategy.',
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save staging decision', details: error.message });
    }
  });

  app.post('/api/reconcile/staging/clear', async (req, res) => {
    try {
      await stagingService.clearAll();
      res.json({ success: true, message: 'Staging decisions cleared (draft only).' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to clear staging', details: error.message });
    }
  });

  app.post('/api/reconcile/apply', async (req, res) => {
    res.status(403).json({
      error: 'Apply-to-live is disabled',
      applyToLiveEnabled: APPLY_TO_LIVE_ENABLED,
      message:
        'Reconcile apply is gated. Set RECONCILE_APPLY_TO_LIVE=true only after Michael approves an import strategy. This endpoint never runs in the current draft.',
    });
  });

  app.post('/api/shelves/seed-jb-layout', async (req, res) => {
    try {
      const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;
      const records = shelfRecordsForSeed();
      if (dryRun) {
        return res.json({
          dryRun: true,
          wouldUpsert: records.length,
          sample: records.slice(0, 5),
        });
      }

      const shelves = await readShelves();
      let upserted = 0;
      for (const rec of records) {
        shelves[rec.shelfId] = {
          name: rec.name,
          description: rec.description,
          imageUrl: rec.imageUrl,
          section: rec.section,
          area: rec.area,
          locationType: rec.locationType,
          shelfNumber: rec.shelfNumber,
          canonicalLabel: rec.canonicalLabel,
          aliases: rec.aliases,
          sortOrder: rec.sortOrder,
        };
        upserted += 1;
      }
      await writeShelves(shelves);
      res.json({
        success: true,
        upserted,
        message: 'JB layout shelves merged (additive upsert; no parts deleted).',
      });
    } catch (error) {
      res.status(500).json({ error: 'Shelf seed failed', details: error.message });
    }
  });

  app.post('/api/auth/manage-pin', (req, res) => {
    const expected = process.env.MANAGE_PIN;
    if (!expected) {
      return res.status(503).json({
        ok: false,
        error: 'Manage PIN is not configured on the server (set MANAGE_PIN).',
      });
    }
    const { pin } = req.body || {};
    res.json({ ok: String(pin) === String(expected) });
  });

  app.post('/api/auth/camera-access', (req, res) => {
    const expected = process.env.CAMERA_ACCESS_PASSWORD;
    if (!expected) {
      return res.status(503).json({
        ok: false,
        error: 'Camera password is not configured (set CAMERA_ACCESS_PASSWORD).',
      });
    }
    const { password } = req.body || {};
    res.json({ ok: String(password) === String(expected) });
  });

  app.get('/api/inventory/master-summary', async (req, res) => {
    try {
      const parts = await readParts();
      const byLocation = {};
      for (const loc of ALL_LOCATIONS) {
        byLocation[loc.id] = { location: loc, parts: [], partCount: 0 };
      }
      const unassigned = [];
      for (const part of parts) {
        const locId = resolvePartLocationId(part.shelf, part.category);
        if (locId && byLocation[locId]) {
          byLocation[locId].parts.push(part);
          byLocation[locId].partCount += 1;
        } else {
          unassigned.push(part);
        }
      }
      res.json({
        section1WestRackAlias: true,
        byLocation: Object.values(byLocation).map((bucket) => ({
          locationId: bucket.location.id,
          label: formatLocationLabel(bucket.location.id) || bucket.location.label,
          section: bucket.location.section,
          area: bucket.location.area,
          partCount: bucket.partCount,
        })),
        unassignedCount: unassigned.length,
        totalParts: parts.length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Summary failed', details: error.message });
    }
  });
}

module.exports = registerMasterInventoryRoutes;
