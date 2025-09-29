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
  modifiedBy: { type: String, default: 'System' }
}, {
  timestamps: true,
  collection: 'parts'
});

// Shelf Schema
const shelfSchema = new mongoose.Schema({
  shelfId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  imageUrl: { type: String, default: null }
}, {
  timestamps: true,
  collection: 'shelves'
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
  notes: { type: String, default: '' }
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

const Part = mongoose.model('Part', partSchema);
const Shelf = mongoose.model('Shelf', shelfSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = {
  Part,
  Shelf,
  Transaction
};