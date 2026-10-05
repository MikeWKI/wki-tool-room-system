const fs = require('fs').promises;
const path = require('path');
const { ReconcileStaging } = require('../models');
const { normalizePartNumber } = require('../data/masterInventoryLayout');

class ReconcileStagingService {
  constructor(dbService) {
    this.dbService = dbService;
    this.filePath = path.join(__dirname, '../database/reconcile_staging.json');
    this.memoryStore = new Map();
  }

  useMongo() {
    return this.dbService?.useMongoDb && this.dbService?.isConnected;
  }

  async readAll() {
    if (this.useMongo()) {
      return ReconcileStaging.find({}).lean();
    }
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      if (e.code === 'ENOENT') return Array.from(this.memoryStore.values());
      throw e;
    }
  }

  async upsertDecision(payload) {
    const norm = normalizePartNumber(payload.partNumber);
    if (!norm) {
      throw new Error('partNumber is required');
    }

    const doc = {
      partNumber: payload.partNumber,
      normalizedPartNumber: norm,
      decision: payload.decision,
      status: 'draft',
      acceptedBy: payload.acceptedBy || 'System',
      jbSnapshot: payload.jbSnapshot || null,
      liveSnapshot: payload.liveSnapshot || null,
      proposedChanges: payload.proposedChanges || null,
      notes: payload.notes || '',
    };

    if (this.useMongo()) {
      return ReconcileStaging.findOneAndUpdate(
        { normalizedPartNumber: norm },
        { $set: doc },
        { upsert: true, new: true, lean: true }
      );
    }

    const records = await this.readAll();
    const idx = records.findIndex((r) => r.normalizedPartNumber === norm);
    const withMeta = { ...doc, updatedAt: new Date().toISOString() };
    if (idx >= 0) {
      records[idx] = { ...records[idx], ...withMeta };
    } else {
      records.push({ ...withMeta, createdAt: new Date().toISOString() });
    }
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(records, null, 2));
    this.memoryStore.set(norm, withMeta);
    return withMeta;
  }

  async clearAll() {
    if (this.useMongo()) {
      await ReconcileStaging.deleteMany({});
      return { cleared: true };
    }
    this.memoryStore.clear();
    await fs.writeFile(this.filePath, JSON.stringify([], null, 2));
    return { cleared: true };
  }
}

module.exports = ReconcileStagingService;
