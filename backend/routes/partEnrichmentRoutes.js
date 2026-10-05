const { applyEnrichmentBatch, enrichmentCoverage } = require('../services/partEnrichment');

function registerPartEnrichmentRoutes(app, deps) {
  const { readParts, dbService } = deps;

  app.get('/api/parts/enrichment-coverage', async (req, res) => {
    try {
      const parts = await readParts();
      res.json(enrichmentCoverage(parts));
    } catch (error) {
      res.status(500).json({ error: 'Enrichment coverage failed', details: error.message });
    }
  });

  app.post('/api/parts/enrich-batch', async (req, res) => {
    try {
      const parts = await readParts();
      const result = applyEnrichmentBatch(parts, req.body || {});
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      if (result.summary.inventoryCountAfter !== parts.length || result.summary.deleted !== 0) {
        return res.status(409).json({ error: 'Enrichment refused to change inventory size' });
      }
      if (result.updated.length > 0) {
        await dbService.patchPartsById(
          result.updated.map((row) => ({ id: row.id, patch: row.patch }))
        );
      }
      res.json({
        success: true,
        summary: result.summary,
        updated: result.updated.map((row) => ({
          id: row.id,
          partNumber: row.partNumber,
          fields: Object.keys(row.patch),
        })),
        unmatched: result.unmatched,
        rejected: result.rejected,
        message: 'Enrichment fields updated. Inventory rows were not created or deleted.',
      });
    } catch (error) {
      res.status(500).json({ error: 'Enrichment batch failed', details: error.message });
    }
  });
}

module.exports = registerPartEnrichmentRoutes;
