const mongoose = require('mongoose');

// Part Schema
const partSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  partNumber: { type: String, required: true },
  description: { type: String, default: '' }, // Allow empty descriptions
  shelf: { type: String, default: null },
  category: { type: String, required: true },
  status: { type: String, enum: ['available', 'checked_out'], default: 'available' },
  checkedOutBy: { type: String, default: null },
  checkedOutDate: { type: Date, default: null },
  quantity: { type: Number, default: 0 },
  minQuantity: { type: Number, default: 1 },
  lastLocationChange: { type: Date, default: null },
  previousLocation: { type: String, default: null },
  lastModified: { type: Date, default: Date.now },
  modifiedBy: { type: String, default: 'System' },
  // Enrichment (additive). Unknown stays null — never invent specs.
  polishedDescription: { type: String, default: null },
  manufacturer: { type: String, default: null },
  vendor: { type: String, default: null },
  engineFamily: { type: String, default: null },
  notes: { type: String, default: null },
  specs: { type: String, default: null },
  sourceUrl: { type: String, default: null },
  lastEnrichedAt: { type: Date, default: null },
  aliases: { type: [String], default: [] },
  parentId: { type: Number, default: null },
  kitComponents: {
    type: [{
      partNumber: { type: String, default: '' },
      description: { type: String, default: '' },
      qty: { type: Number, default: 1 },
    }],
    default: [],
  },
}, {
  timestamps: true,
  collection: 'parts'
});

// Shelf Schema
const shelfSchema = new mongoose.Schema({
  shelfId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  imageUrl: { type: String, default: null },
  section: { type: Number, default: null },
  area: { type: String, default: '' },
  locationType: { type: String, default: 'shelf' },
  shelfNumber: { type: Number, default: null },
  canonicalLabel: { type: String, default: '' },
  aliases: { type: [String], default: [] },
  sortOrder: { type: Number, default: 0 },
}, {
  timestamps: true,
  collection: 'shelves'
});

// Reconcile staging — draft accept/skip decisions; never mutates live parts directly
const reconcileStagingSchema = new mongoose.Schema({
  partNumber: { type: String, required: true },
  normalizedPartNumber: { type: String, required: true, index: true },
  decision: {
    type: String,
    enum: ['accept_jb', 'accept_live', 'skip'],
    required: true,
  },
  status: { type: String, enum: ['draft'], default: 'draft' },
  acceptedBy: { type: String, default: 'System' },
  jbSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  liveSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  proposedChanges: { type: mongoose.Schema.Types.Mixed, default: null },
  notes: { type: String, default: '' },
}, {
  timestamps: true,
  collection: 'reconcile_staging',
});

// Transaction Schema
const transactionSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  partId: { type: Number, default: null }, // Make optional for bulk imports
  partNumber: { type: String, required: true },
  action: { 
    type: String, 
    enum: ['checkout', 'checkin', 'location_change', 'quantity_update', 'created', 'updated', 'import'], // Add 'import'
    required: true 
  },
  user: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  fromLocation: { type: String, default: null },
  toLocation: { type: String, default: null },
  fromQuantity: { type: Number, default: null },
  toQuantity: { type: Number, default: null },
  notes: { type: String, default: '' },
  roNumber: { type: String, default: null },
  unitNumber: { type: String, default: null },
  checkoutId: { type: Number, default: null },
  // Internal batch marker for idempotent history loads. Stripped from public API responses.
  batchKey: { type: String, default: null },
}, {
  timestamps: true,
  collection: 'transactions'
});

// Create indexes for better performance
partSchema.index({ partNumber: 1 });
partSchema.index({ shelf: 1 });
partSchema.index({ category: 1 });
partSchema.index({ status: 1 });
partSchema.index({ quantity: 1 });

shelfSchema.index({ shelfId: 1 });

transactionSchema.index({ partId: 1 });
transactionSchema.index({ action: 1 });
transactionSchema.index({ timestamp: -1 });

reconcileStagingSchema.index({ normalizedPartNumber: 1 }, { unique: true });

partSchema.index({ engineFamily: 1 });
transactionSchema.index({ batchKey: 1 });

const auditBatchSchema = new mongoose.Schema({
  batchKey: { type: String, required: true, unique: true },
  transactionCount: { type: Number, default: 0 },
  partSnapshots: { type: [mongoose.Schema.Types.Mixed], default: [] },
  rangeStart: { type: Date, default: null },
  rangeEnd: { type: Date, default: null },
  appliedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
  collection: 'audit_batches',
});

const Part = mongoose.model('Part', partSchema);
const Shelf = mongoose.model('Shelf', shelfSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const ReconcileStaging = mongoose.model('ReconcileStaging', reconcileStagingSchema);
const AuditBatch = mongoose.model('AuditBatch', auditBatchSchema);

module.exports = {
  Part,
  Shelf,
  Transaction,
  ReconcileStaging,
  AuditBatch,
};