const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const { Part, Shelf, Transaction, AuditBatch } = require('../models');
const { withStoreLock } = require('./storeLock');
const { writeJsonAtomic } = require('./atomicJson');
const { logStoreError } = require('./safeLog');

const PART_KEYS = [
  'id',
  'partNumber',
  'description',
  'shelf',
  'category',
  'status',
  'checkedOutBy',
  'checkedOutDate',
  'quantity',
  'minQuantity',
  'lastLocationChange',
  'previousLocation',
  'lastModified',
  'modifiedBy',
  'polishedDescription',
  'manufacturer',
  'vendor',
  'engineFamily',
  'notes',
  'specs',
  'sourceUrl',
  'lastEnrichedAt',
  'aliases',
  'parentId',
  'kitComponents',
];

function cleanPart(part) {
  const clean = {};
  for (const key of PART_KEYS) {
    if (part[key] !== undefined) clean[key] = part[key];
  }
  if (clean.description == null) clean.description = '';
  if (clean.category == null) clean.category = 'Uncategorized';
  if (clean.quantity != null) clean.quantity = Number(clean.quantity) || 0;
  if (clean.minQuantity != null) clean.minQuantity = Number(clean.minQuantity) || 1;
  return clean;
}

function cleanPatch(patch) {
  const clean = {};
  for (const key of PART_KEYS) {
    if (key === 'id') continue;
    if (patch[key] !== undefined) clean[key] = patch[key];
  }
  return clean;
}

function cleanTransaction(transaction) {
  const clean = { ...transaction };
  delete clean._id;
  delete clean.__v;
  delete clean.createdAt;
  delete clean.updatedAt;
  if (clean.partId === undefined) clean.partId = null;
  if (!clean.action) clean.action = 'created';
  if (!clean.user) clean.user = 'System';
  if (!clean.timestamp) clean.timestamp = new Date();
  return clean;
}

function storeFailure(scope, error) {
  logStoreError(scope, error);
  const failure = new Error('store_unavailable');
  failure.name = 'StoreUnavailableError';
  failure.code = 'STORE_UNAVAILABLE';
  failure.status = 503;
  return failure;
}

function unreadable(label) {
  logStoreError(label, { name: 'SyntaxError', code: 'STORE_READ_FAILED' });
  const failure = new Error('store_unreadable');
  failure.name = 'SyntaxError';
  failure.code = 'STORE_READ_FAILED';
  failure.status = 503;
  return failure;
}

class DatabaseService {
  constructor() {
    this.isConnected = false;
    this.useMongoDb = false;

    // JSON file paths. WKI_DATA_DIR is a test override only; production leaves it unset.
    const dataDir = process.env.WKI_DATA_DIR;
    this.DB_DIR = dataDir ? path.resolve(dataDir) : path.join(__dirname, '../database');
    this.PARTS_FILE = path.join(this.DB_DIR, 'parts.json');
    this.TRANSACTIONS_FILE = path.join(this.DB_DIR, 'transactions.json');
    this.SHELVES_FILE = path.join(this.DB_DIR, 'shelves.json');
    this.AUDIT_BATCH_FILE = path.join(this.DB_DIR, 'audit-batches.json');
  }

  fail(scope, error) {
    return storeFailure(scope, error);
  }

  transactionModel() {
    return this._transactionModel || Transaction;
  }

  async initialize() {
    // Mongo when MONGODB_URI is set and the connection succeeds.
    // A failed startup connection selects JSON for the process.
    // After useMongoDb is true, request paths never fall back to JSON.
    if (process.env.MONGODB_URI) {
      try {
        await this.connectToMongoDB();
        await this.migrateFromJsonFiles();
        this.useMongoDb = true;
        console.log('✅ Using MongoDB for data persistence');
        return;
      } catch (error) {
        logStoreError('MongoDB connection failed', error);
      }
    }

    await this.initializeJsonFiles();
    console.log('⚠️ Using JSON files - data will be lost on redeployment');
  }

  async connectToMongoDB() {
    await mongoose.connect(process.env.MONGODB_URI);
    this.isConnected = true;
    console.log('🔗 Connected to MongoDB Atlas');
    await mongoose.connection.db.admin().ping();
    console.log('🏓 MongoDB connection verified');
  }

  async initializeJsonFiles() {
    try {
      await fs.mkdir(this.DB_DIR, { recursive: true });
      const files = [
        { path: this.PARTS_FILE, default: [] },
        { path: this.TRANSACTIONS_FILE, default: [] },
        { path: this.SHELVES_FILE, default: this.getDefaultShelves() },
      ];

      for (const file of files) {
        try {
          await fs.access(file.path);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          await writeJsonAtomic(file.path, file.default);
          console.log(`📁 Created ${path.basename(file.path)}`);
        }
      }
    } catch (error) {
      logStoreError('initialize JSON files', error);
      throw error;
    }
  }

  async migrateFromJsonFiles() {
    // useMongoDb is still false here, so this returns immediately.
    // Startup does not copy JSON into a database that already has inventory.
    if (!this.useMongoDb) return;

    try {
      console.log('🔄 Checking for data migration from JSON files...');
      const partsCount = await Part.countDocuments();
      const shelvesCount = await Shelf.countDocuments();

      if (partsCount === 0 || shelvesCount === 0) {
        console.log('📦 MongoDB collections are empty, attempting migration...');
        const jsonData = await this.readJsonFilesForMigration();

        if (jsonData.parts.length > 0) {
          await Part.insertMany(jsonData.parts);
          console.log(`✅ Migrated ${jsonData.parts.length} parts to MongoDB`);
        }

        if (Object.keys(jsonData.shelves).length > 0) {
          const shelfDocs = Object.entries(jsonData.shelves).map(([id, data]) => ({
            shelfId: id,
            ...data,
          }));
          await Shelf.insertMany(shelfDocs);
          console.log(`✅ Migrated ${shelfDocs.length} shelves to MongoDB`);
        }

        if (jsonData.transactions.length > 0) {
          await Transaction.insertMany(jsonData.transactions);
          console.log(`✅ Migrated ${jsonData.transactions.length} transactions to MongoDB`);
        }

        console.log('🎉 Data migration completed successfully');
      } else {
        console.log('📊 MongoDB already contains data, skipping migration');
      }
    } catch (error) {
      logStoreError('migration failed', error);
    }
  }

  async readJsonFilesForMigration() {
    const defaultData = {
      parts: [],
      shelves: {},
      transactions: [],
    };

    const readOne = async (filePath, assign, missingLabel) => {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        try {
          assign(JSON.parse(raw));
        } catch (error) {
          throw unreadable(missingLabel);
        }
      } catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
      }
    };

    await readOne(this.PARTS_FILE, (value) => {
      defaultData.parts = value;
    }, 'migration parts parse');
    try {
      await readOne(this.SHELVES_FILE, (value) => {
        defaultData.shelves = value;
      }, 'migration shelves parse');
    } catch (error) {
      if (error.code === 'ENOENT') defaultData.shelves = this.getDefaultShelves();
      else throw error;
    }
    if (!defaultData.shelves || Object.keys(defaultData.shelves).length === 0) {
      try {
        await fs.access(this.SHELVES_FILE);
      } catch (error) {
        if (error.code === 'ENOENT') defaultData.shelves = this.getDefaultShelves();
      }
    }
    await readOne(this.TRANSACTIONS_FILE, (value) => {
      defaultData.transactions = value;
    }, 'migration transactions parse');
    return defaultData;
  }

  async readJsonArray(filePath, label) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch (error) {
        throw unreadable(label);
      }
      if (!Array.isArray(parsed)) throw unreadable(label);
      return parsed;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async getParts() {
    if (this.useMongoDb) {
      try {
        return await Part.find({}).lean();
      } catch (error) {
        throw this.fail('getParts', error);
      }
    }
    return this.readPartsFromFile();
  }

  async readPartsFromFile() {
    return this.readJsonArray(this.PARTS_FILE, 'parts_json_parse');
  }

  async findPart(id) {
    if (this.useMongoDb) {
      try {
        return await Part.findOne({ id }).lean();
      } catch (error) {
        throw this.fail('findPart', error);
      }
    }
    const parts = await this.readPartsFromFile();
    return parts.find((part) => part.id === id) || null;
  }

  /**
   * Upsert each given part. Does not delete parts that are absent from the
   * list, and does not deleteMany/insertMany. Checkout does not call this.
   */
  async saveParts(parts) {
    if (this.useMongoDb) {
      try {
        for (const part of parts) {
          const clean = cleanPart(part);
          if (part._id) await Part.updateOne({ _id: part._id }, { $set: clean });
          else await Part.updateOne({ id: clean.id }, { $set: clean }, { upsert: true });
        }
        return true;
      } catch (error) {
        throw this.fail('saveParts', error);
      }
    }
    return withStoreLock(async () => {
      await this.savePartsToFile(parts);
      return true;
    });
  }

  async savePartsToFile(parts) {
    await writeJsonAtomic(this.PARTS_FILE, parts);
    return true;
  }

  cleanPart(part) {
    return cleanPart(part);
  }

  cleanTransaction(transaction) {
    return cleanTransaction(transaction);
  }

  async insertPart(part) {
    const clean = cleanPart(part);
    if (this.useMongoDb) {
      try {
        await Part.insertOne(clean);
        return clean;
      } catch (error) {
        throw this.fail('insertPart', error);
      }
    }
    return withStoreLock(async () => {
      const parts = await this.readPartsFromFile();
      parts.push({ ...part, ...clean });
      await this.savePartsToFile(parts);
      return { ...part, ...clean };
    });
  }

  async addPart(fields) {
    if (this.useMongoDb) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const latest = await Part.findOne().sort({ id: -1 }).select('id').lean();
        const id = (latest && Number.isFinite(Number(latest.id)) ? Number(latest.id) : 0) + 1;
        const part = cleanPart({
          ...fields,
          id,
          status: fields.status || 'available',
        });
        try {
          await Part.insertOne(part);
          return part;
        } catch (error) {
          if (String(error.code) === '11000' && attempt < 4) continue;
          throw this.fail('addPart', error);
        }
      }
    }
    return withStoreLock(async () => {
      const parts = await this.readPartsFromFile();
      const id = Math.max(0, ...parts.map((part) => Number(part.id) || 0)) + 1;
      const part = {
        ...fields,
        id,
        status: fields.status || 'available',
        checkedOutBy: fields.checkedOutBy ?? null,
        checkedOutDate: fields.checkedOutDate ?? null,
        quantity: Number(fields.quantity) || 0,
        minQuantity: Number(fields.minQuantity) || 1,
        description: fields.description || '',
        category: fields.category || 'Uncategorized',
      };
      parts.push(part);
      await this.savePartsToFile(parts);
      return part;
    });
  }

  async updatePartById(id, patch) {
    const clean = cleanPatch(patch);
    if (this.useMongoDb) {
      try {
        const result = await Part.updateOne({ id }, { $set: clean });
        if (!result.matchedCount) return null;
        return Part.findOne({ id }).lean();
      } catch (error) {
        throw this.fail('updatePartById', error);
      }
    }
    return withStoreLock(async () => {
      const parts = await this.readPartsFromFile();
      const index = parts.findIndex((part) => part.id === id);
      if (index < 0) return null;
      parts[index] = { ...parts[index], ...clean };
      await this.savePartsToFile(parts);
      return parts[index];
    });
  }

  async deletePartById(id) {
    if (this.useMongoDb) {
      try {
        const existing = await Part.findOne({ id }).lean();
        if (!existing) return null;
        await Part.deleteOne({ id });
        return existing;
      } catch (error) {
        throw this.fail('deletePartById', error);
      }
    }
    return withStoreLock(async () => {
      const parts = await this.readPartsFromFile();
      const index = parts.findIndex((part) => part.id === id);
      if (index < 0) return null;
      const [deleted] = parts.splice(index, 1);
      await this.savePartsToFile(parts);
      return deleted;
    });
  }

  async renamePartsShelf(oldShelf, newShelf) {
    if (this.useMongoDb) {
      try {
        const rows = await Part.find({ shelf: oldShelf }).select('id').lean();
        for (const row of rows) {
          await Part.updateOne({ id: row.id }, { $set: { shelf: newShelf } });
        }
        return rows.length;
      } catch (error) {
        throw this.fail('renamePartsShelf', error);
      }
    }
    return withStoreLock(async () => {
      const parts = await this.readPartsFromFile();
      let count = 0;
      for (const part of parts) {
        if (part.shelf === oldShelf) {
          part.shelf = newShelf;
          count += 1;
        }
      }
      if (count) await this.savePartsToFile(parts);
      return count;
    });
  }

  /**
   * Apply inserts and field diffs. Quantity diffs are absolute $set values.
   * Checkout and check-in use $inc instead of this method.
   * allowDelete uses deleteOne per id. Never deleteMany.
   */
  async applyPartListEdits(beforeList, afterList, options = {}) {
    const allowDelete = options.allowDelete === true;
    const beforeById = new Map((beforeList || []).map((part) => [part.id, part]));
    const afterIds = new Set();
    const inserts = [];
    const patches = [];
    for (const after of afterList || []) {
      afterIds.add(after.id);
      const before = beforeById.get(after.id);
      if (!before) {
        inserts.push(after);
        continue;
      }
      const patch = {};
      for (const key of PART_KEYS) {
        if (key === 'id') continue;
        if (after[key] !== undefined && JSON.stringify(after[key]) !== JSON.stringify(before[key])) {
          patch[key] = after[key];
        }
      }
      if (Object.keys(patch).length) patches.push({ id: after.id, patch });
    }
    const deleteIds = [];
    if (allowDelete) {
      for (const before of beforeList || []) {
        if (!afterIds.has(before.id)) deleteIds.push(before.id);
      }
    }

    if (this.useMongoDb) {
      try {
        for (const part of inserts) await Part.insertOne(cleanPart(part));
        for (const row of patches) {
          await Part.updateOne({ id: row.id }, { $set: cleanPatch(row.patch) });
        }
        for (const id of deleteIds) await Part.deleteOne({ id });
        return { inserts: inserts.length, patches: patches.length, deleted: deleteIds.length };
      } catch (error) {
        throw this.fail('applyPartListEdits', error);
      }
    }

    return withStoreLock(async () => {
      const parts = await this.readPartsFromFile();
      const byId = new Map(parts.map((part) => [part.id, part]));
      for (const part of inserts) {
        if (!byId.has(part.id)) {
          const clean = { ...part, ...cleanPart(part) };
          parts.push(clean);
          byId.set(part.id, clean);
        }
      }
      for (const row of patches) {
        const part = byId.get(row.id);
        if (part) Object.assign(part, cleanPatch(row.patch));
      }
      const remove = new Set(deleteIds);
      const next = allowDelete ? parts.filter((part) => !remove.has(part.id)) : parts;
      await this.savePartsToFile(next);
      return { inserts: inserts.length, patches: patches.length, deleted: deleteIds.length };
    });
  }

  async restoreParts(parts) {
    if (!Array.isArray(parts)) {
      const error = new Error('invalid_parts');
      error.status = 400;
      return Promise.reject(error);
    }
    if (this.useMongoDb) {
      try {
        const existing = await Part.find({}).select('id').lean();
        const nextIds = new Set(parts.map((part) => part.id));
        for (const part of parts) {
          const clean = cleanPart(part);
          await Part.updateOne({ id: clean.id }, { $set: clean }, { upsert: true });
        }
        for (const row of existing) {
          if (!nextIds.has(row.id)) await Part.deleteOne({ id: row.id });
        }
        return parts.length;
      } catch (error) {
        throw this.fail('restoreParts', error);
      }
    }
    return withStoreLock(async () => {
      await this.savePartsToFile(parts);
      return parts.length;
    });
  }

  buildMovementTransaction(part, input, action, quantityAfter) {
    return {
      id: Date.now(),
      partId: part.id,
      partNumber: part.partNumber,
      action,
      user: input.user,
      timestamp: new Date().toISOString(),
      notes: input.notes || '',
      roNumber: input.roNumber || null,
      unitNumber: input.unitNumber || null,
      quantityBefore: part.quantity,
      quantityAfter,
    };
  }

  async checkoutPart(input) {
    if (this.useMongoDb) return this.checkoutPartMongo(input);
    return withStoreLock(() => this.checkoutPartJson(input));
  }

  async checkoutPartMongo(input) {
    const before = await this.findPart(input.id);
    if (!before) return { error: 'not_found' };
    let result;
    try {
      result = await Part.updateOne(
        { id: input.id, status: { $ne: 'checked_out' }, quantity: { $gt: 0 } },
        {
          $inc: { quantity: -1 },
          $set: {
            status: 'checked_out',
            checkedOutBy: input.user,
            checkedOutDate: input.checkedOutDate,
          },
        }
      );
    } catch (error) {
      throw this.fail('checkoutPart', error);
    }
    if (!result.matchedCount) {
      const current = await this.findPart(input.id);
      if (!current) return { error: 'not_found' };
      if (current.status === 'checked_out') return { error: 'checked_out' };
      return { error: 'out_of_stock' };
    }
    const part = {
      ...before,
      status: 'checked_out',
      checkedOutBy: input.user,
      checkedOutDate: input.checkedOutDate,
      quantity: Number(before.quantity) - 1,
    };
    const transaction = this.buildMovementTransaction(before, input, 'checkout', part.quantity);
    await this.insertTransaction(transaction);
    return { part, transaction };
  }

  async checkoutPartJson(input) {
    const parts = await this.readPartsFromFile();
    const index = parts.findIndex((part) => part.id === input.id);
    if (index < 0) return { error: 'not_found' };
    const before = parts[index];
    if (before.status === 'checked_out') return { error: 'checked_out' };
    const quantity = Number(before.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: 'out_of_stock' };
    const part = {
      ...before,
      status: 'checked_out',
      checkedOutBy: input.user,
      checkedOutDate: input.checkedOutDate,
      quantity: quantity - 1,
    };
    parts[index] = part;
    await this.savePartsToFile(parts);
    const transaction = this.buildMovementTransaction(before, input, 'checkout', part.quantity);
    await this.appendTransactionUnlocked(transaction);
    return { part, transaction };
  }

  async checkinPart(input) {
    if (this.useMongoDb) return this.checkinPartMongo(input);
    return withStoreLock(() => this.checkinPartJson(input));
  }

  async checkinPartMongo(input) {
    const before = await this.findPart(input.id);
    if (!before) return { error: 'not_found' };
    let result;
    try {
      result = await Part.updateOne(
        { id: input.id, status: 'checked_out' },
        {
          $inc: { quantity: 1 },
          $set: {
            status: 'available',
            checkedOutBy: null,
            checkedOutDate: null,
          },
        }
      );
    } catch (error) {
      throw this.fail('checkinPart', error);
    }
    if (!result.matchedCount) {
      const current = await this.findPart(input.id);
      if (!current) return { error: 'not_found' };
      return { error: 'not_checked_out' };
    }
    const part = {
      ...before,
      status: 'available',
      checkedOutBy: null,
      checkedOutDate: null,
      quantity: Number(before.quantity) + 1,
    };
    const transaction = {
      id: Date.now(),
      partId: before.id,
      partNumber: before.partNumber,
      action: 'checkin',
      user: input.user,
      timestamp: new Date().toISOString(),
      notes: input.notes || '',
      quantityBefore: before.quantity,
      quantityAfter: part.quantity,
    };
    await this.insertTransaction(transaction);
    return { part, transaction };
  }

  async checkinPartJson(input) {
    const parts = await this.readPartsFromFile();
    const index = parts.findIndex((part) => part.id === input.id);
    if (index < 0) return { error: 'not_found' };
    const before = parts[index];
    if (before.status !== 'checked_out') return { error: 'not_checked_out' };
    const part = {
      ...before,
      status: 'available',
      checkedOutBy: null,
      checkedOutDate: null,
      quantity: Number(before.quantity) + 1,
    };
    parts[index] = part;
    await this.savePartsToFile(parts);
    const transaction = {
      id: Date.now(),
      partId: before.id,
      partNumber: before.partNumber,
      action: 'checkin',
      user: input.user,
      timestamp: new Date().toISOString(),
      notes: input.notes || '',
      quantityBefore: before.quantity,
      quantityAfter: part.quantity,
    };
    await this.appendTransactionUnlocked(transaction);
    return { part, transaction };
  }

  async getTransactions() {
    if (this.useMongoDb) {
      try {
        return await Transaction.find({}).lean();
      } catch (error) {
        throw this.fail('getTransactions', error);
      }
    }
    return this.readTransactionsFromFile();
  }

  async readTransactionsFromFile() {
    return this.readJsonArray(this.TRANSACTIONS_FILE, 'transactions_json_parse');
  }

  /**
   * Append one row. Mongo uses a single insert. JSON reads, appends, and
   * atomically replaces the file. Never deleteMany/insertMany.
   */
  async appendTransaction(entry) {
    return withStoreLock(() => this.appendTransactionUnlocked(entry));
  }

  async appendTransactionUnlocked(entry) {
    if (this.useMongoDb) {
      const Model = this.transactionModel();
      const clean = cleanTransaction(entry);
      try {
        if (typeof Model.insertOne === 'function') await Model.insertOne(clean);
        else await Model.create(clean);
      } catch (error) {
        throw this.fail('appendTransaction', error);
      }
      return entry;
    }
    const rows = await this.readTransactionsFromFile();
    rows.unshift(entry);
    await this.saveTransactionsToFile(rows);
    return entry;
  }

  async insertTransaction(entry) {
    return this.appendTransaction(entry);
  }

  async updateTransactionById(id, patch) {
    const clean = { ...patch };
    delete clean._id;
    delete clean.id;
    if (this.useMongoDb) {
      try {
        await Transaction.updateOne({ id }, { $set: clean });
        return true;
      } catch (error) {
        throw this.fail('updateTransactionById', error);
      }
    }
    return withStoreLock(async () => {
      const rows = await this.readTransactionsFromFile();
      let changed = false;
      for (const row of rows) {
        if (row.id === id) {
          Object.assign(row, clean);
          changed = true;
        }
      }
      if (changed) await this.saveTransactionsToFile(rows);
      return changed;
    });
  }

  async mutateTransactions(mutator) {
    return withStoreLock(async () => {
      const current = await this.getTransactions();
      const next = await mutator(current);
      await this.saveTransactions(next);
      return next;
    });
  }

  async saveTransactions(transactions) {
    return withStoreLock(() => this.writeAllTransactions(transactions));
  }

  /**
   * Persist the provided rows without deleting the collection.
   * Existing Mongo rows are updateOne by _id. New rows are insertOne.
   */
  async writeAllTransactions(transactions) {
    if (this.useMongoDb) {
      try {
        for (const row of transactions) {
          const clean = cleanTransaction(row);
          if (row._id) await Transaction.updateOne({ _id: row._id }, { $set: clean });
          else await Transaction.insertOne(clean);
        }
        return true;
      } catch (error) {
        throw this.fail('saveTransactions', error);
      }
    }
    await this.saveTransactionsToFile(transactions);
    return true;
  }

  async saveTransactionsToFile(transactions) {
    await writeJsonAtomic(this.TRANSACTIONS_FILE, transactions);
    return true;
  }

  async restoreTransactions(transactions) {
    if (!Array.isArray(transactions)) {
      const error = new Error('invalid_transactions');
      error.status = 400;
      return Promise.reject(error);
    }
    if (this.useMongoDb) {
      try {
        const existing = await Transaction.find({}).select('_id').lean();
        const kept = new Set();
        for (const row of transactions) {
          const clean = cleanTransaction(row);
          if (row._id) {
            await Transaction.updateOne({ _id: row._id }, { $set: clean }, { upsert: true });
            kept.add(String(row._id));
          } else {
            const inserted = await Transaction.insertOne(clean);
            const insertedId = inserted && (inserted._id || inserted.insertedId);
            if (insertedId) kept.add(String(insertedId));
          }
        }
        for (const row of existing) {
          if (!kept.has(String(row._id))) await Transaction.deleteOne({ _id: row._id });
        }
        return transactions.length;
      } catch (error) {
        throw this.fail('restoreTransactions', error);
      }
    }
    return withStoreLock(async () => {
      await this.saveTransactionsToFile(transactions);
      return transactions.length;
    });
  }

  async getShelves() {
    if (this.useMongoDb) {
      try {
        const shelves = await Shelf.find({}).lean();
        const shelvesObj = {};
        shelves.forEach((shelf) => {
          const { shelfId, name, imageUrl, description, section, area, locationType,
            shelfNumber, canonicalLabel, aliases, sortOrder, ...rest } = shelf;
          shelvesObj[shelf.shelfId] = {
            name,
            imageUrl,
            description,
            section,
            area,
            locationType,
            shelfNumber,
            canonicalLabel,
            aliases,
            sortOrder,
            ...rest,
          };
        });
        return shelvesObj;
      } catch (error) {
        throw this.fail('getShelves', error);
      }
    }
    return this.readShelvesFromFile();
  }

  async readShelvesFromFile() {
    try {
      const data = await fs.readFile(this.SHELVES_FILE, 'utf8');
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch (error) {
        throw unreadable('shelves_json_parse');
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw unreadable('shelves_json_parse');
      }
      return parsed;
    } catch (error) {
      if (error.code === 'ENOENT') return this.getDefaultShelves();
      throw error;
    }
  }

  async saveShelves(shelves) {
    if (this.useMongoDb) {
      try {
        const entries = Object.entries(shelves || {});
        const ids = new Set(entries.map(([id]) => id));
        for (const [id, shelfData] of entries) {
          await Shelf.updateOne(
            { shelfId: id },
            {
              $set: {
                shelfId: id,
                name: shelfData.name,
                imageUrl: shelfData.imageUrl,
                description: shelfData.description,
                section: shelfData.section,
                area: shelfData.area,
                locationType: shelfData.locationType,
                shelfNumber: shelfData.shelfNumber,
                canonicalLabel: shelfData.canonicalLabel,
                aliases: shelfData.aliases,
                sortOrder: shelfData.sortOrder,
              },
            },
            { upsert: true }
          );
        }
        const existing = await Shelf.find({}).select('shelfId').lean();
        for (const row of existing) {
          if (!ids.has(row.shelfId)) await Shelf.deleteOne({ shelfId: row.shelfId });
        }
        return true;
      } catch (error) {
        throw this.fail('saveShelves', error);
      }
    }
    return withStoreLock(async () => {
      await this.saveShelvesToFile(shelves);
      return true;
    });
  }

  async saveShelvesToFile(shelves) {
    await writeJsonAtomic(this.SHELVES_FILE, shelves);
    return true;
  }

  async patchPartsById(patches) {
    if (!patches || patches.length === 0) return 0;
    if (this.useMongoDb) {
      try {
        const ops = patches.map((row) => ({
          updateOne: {
            filter: { id: row.id },
            update: { $set: row.patch },
          },
        }));
        await Part.bulkWrite(ops, { ordered: false });
        return patches.length;
      } catch (error) {
        throw this.fail('patchPartsById', error);
      }
    }
    return withStoreLock(async () => {
      const parts = await this.readPartsFromFile();
      const byId = new Map(parts.map((part) => [part.id, part]));
      for (const row of patches) {
        const part = byId.get(row.id);
        if (part) Object.assign(part, row.patch);
      }
      await this.savePartsToFile(parts);
      return patches.length;
    });
  }

  /**
   * Admin batch replace used by scripts/seed-shop-activity.js only.
   * Request handlers must call applyActivityBatch (deleteOne + insertOne +
   * updateOne). This method still uses deleteMany({ batchKey }) + insertMany.
   */
  async replaceBatchTransactions(batchKey, batchTransactions, keptTransactions) {
    const kept = Array.isArray(keptTransactions) ? keptTransactions : null;
    if (this.useMongoDb) {
      await Transaction.deleteMany({ batchKey });
      if (batchTransactions.length > 0) {
        await Transaction.insertMany(batchTransactions);
      }
      if (kept && kept.length > 0) {
        const ops = kept.map((row) => ({
          updateOne: {
            filter: { id: row.id },
            update: { $set: { user: row.user } },
          },
        }));
        await Transaction.bulkWrite(ops, { ordered: false });
      }
      return batchTransactions.length;
    }
    return withStoreLock(async () => {
      const existing = await this.readTransactionsFromFile();
      const keptRows = kept || existing.filter((row) => row.batchKey !== batchKey);
      await this.saveTransactionsToFile([...batchTransactions, ...keptRows]);
      return batchTransactions.length;
    });
  }

  async applyActivityBatch(batchKey, batchTransactions, keptTransactions) {
    const kept = Array.isArray(keptTransactions) ? keptTransactions : null;
    if (this.useMongoDb) {
      try {
        const existing = await Transaction.find({ batchKey }).select('_id').lean();
        for (const row of existing) {
          await Transaction.deleteOne({ _id: row._id });
        }
        for (const row of batchTransactions) {
          await Transaction.insertOne(cleanTransaction(row));
        }
        if (kept && kept.length > 0) {
          for (const row of kept) {
            await Transaction.updateOne({ id: row.id }, { $set: { user: row.user } });
          }
        }
        return batchTransactions.length;
      } catch (error) {
        throw this.fail('applyActivityBatch', error);
      }
    }
    return withStoreLock(async () => {
      const existing = await this.readTransactionsFromFile();
      const keptRows = kept || existing.filter((row) => row.batchKey !== batchKey);
      await this.saveTransactionsToFile([...batchTransactions, ...keptRows]);
      return batchTransactions.length;
    });
  }

  async getAuditBatch(batchKey) {
    if (this.useMongoDb) {
      try {
        const doc = await AuditBatch.findOne({ batchKey }).lean();
        return doc || null;
      } catch (error) {
        throw this.fail('getAuditBatch', error);
      }
    }
    try {
      const raw = await fs.readFile(this.AUDIT_BATCH_FILE, 'utf8');
      let rows;
      try {
        rows = JSON.parse(raw);
      } catch (error) {
        throw unreadable('audit_json_parse');
      }
      if (!Array.isArray(rows)) throw unreadable('audit_json_parse');
      return rows.find((row) => row.batchKey === batchKey) || null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async saveAuditBatch(batch) {
    if (this.useMongoDb) {
      try {
        await AuditBatch.findOneAndUpdate({ batchKey: batch.batchKey }, batch, {
          upsert: true,
          new: true,
        });
        return batch;
      } catch (error) {
        throw this.fail('saveAuditBatch', error);
      }
    }
    return withStoreLock(async () => {
      let rows = [];
      try {
        const raw = await fs.readFile(this.AUDIT_BATCH_FILE, 'utf8');
        try {
          rows = JSON.parse(raw);
        } catch (error) {
          throw unreadable('audit_json_parse');
        }
        if (!Array.isArray(rows)) throw unreadable('audit_json_parse');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const index = rows.findIndex((row) => row.batchKey === batch.batchKey);
      if (index >= 0) rows[index] = batch;
      else rows.push(batch);
      await writeJsonAtomic(this.AUDIT_BATCH_FILE, rows);
      return batch;
    });
  }

  async applyQuantityUpdates(updates, modifiedBy = 'System') {
    const timestamp = new Date().toISOString();
    const updatedParts = [];
    const transactions = [];

    const consume = async (part, update, write) => {
      if (!part) return;
      const originalQuantity = Number(part.quantity) || 0;
      let nextQuantity = originalQuantity;
      let delta = 0;
      if (update.quantity !== undefined) {
        nextQuantity = Math.max(0, parseInt(update.quantity, 10) || 0);
        delta = nextQuantity - originalQuantity;
        await write(part.id, { mode: 'set', quantity: nextQuantity, delta });
      } else if (update.adjustment !== undefined) {
        const adjustment = parseInt(update.adjustment, 10) || 0;
        nextQuantity = Math.max(0, originalQuantity + adjustment);
        delta = nextQuantity - originalQuantity;
        await write(part.id, { mode: 'inc', quantity: nextQuantity, delta });
      } else {
        return;
      }
      const updated = {
        ...part,
        quantity: nextQuantity,
        lastModified: timestamp,
        modifiedBy,
      };
      updatedParts.push(updated);
      transactions.push({
        id: Date.now() + Number(part.id || 0),
        partId: part.id,
        partNumber: part.partNumber,
        action: 'quantity_update',
        fromQuantity: originalQuantity,
        toQuantity: nextQuantity,
        user: modifiedBy,
        timestamp,
        notes: `Quantity updated: ${originalQuantity} → ${nextQuantity}`,
      });
    };

    if (this.useMongoDb) {
      try {
        for (const update of updates) {
          const id = parseInt(update.id, 10);
          const part = await Part.findOne({ id }).lean();
          await consume(part, update, async (partId, change) => {
            if (change.mode === 'inc' && change.delta !== 0) {
              await Part.updateOne(
                { id: partId },
                { $inc: { quantity: change.delta }, $set: { lastModified: timestamp, modifiedBy } }
              );
              return;
            }
            await Part.updateOne(
              { id: partId },
              { $set: { quantity: change.quantity, lastModified: timestamp, modifiedBy } }
            );
          });
        }
        return { updatedParts, transactions };
      } catch (error) {
        throw this.fail('applyQuantityUpdates', error);
      }
    }

    return withStoreLock(async () => {
      const parts = await this.readPartsFromFile();
      const byId = new Map(parts.map((part) => [part.id, part]));
      for (const update of updates) {
        const id = parseInt(update.id, 10);
        await consume(byId.get(id), update, async (partId, change) => {
          const part = byId.get(partId);
          part.quantity = change.mode === 'inc'
            ? Math.max(0, (Number(part.quantity) || 0) + change.delta)
            : change.quantity;
          part.lastModified = timestamp;
          part.modifiedBy = modifiedBy;
        });
      }
      await this.savePartsToFile(parts);
      return { updatedParts, transactions };
    });
  }

  getDefaultShelves() {
    return {
      'A-01': { name: 'Tool Room North Wall - Section A, Position 1', imageUrl: null, description: 'Engine filters and maintenance parts' },
      'A-08': { name: 'Tool Room North Wall - Section A, Position 8', imageUrl: null, description: 'Fuel system components' },
      'B-03': { name: 'Tool Room East Wall - Section B, Position 3', imageUrl: null, description: 'Brake system parts' },
      'B-07': { name: 'Tool Room East Wall - Section B, Position 7', imageUrl: null, description: 'Steering components' },
      'C-05': { name: 'Tool Room South Wall - Section C, Position 5', imageUrl: null, description: 'Transmission parts and seals' },
      'D-02': { name: 'Tool Room West Wall - Section D, Position 2', imageUrl: null, description: 'Lighting and electrical components' },
      'D-05': { name: 'Tool Room West Wall - Section D, Position 5', imageUrl: null, description: 'Starting and charging system' },
      'E-01': { name: 'Tool Room Center Aisle - Section E, Position 1', imageUrl: null, description: 'Radiator and cooling parts' },
      'F-03': { name: 'Tool Room Center Aisle - Section F, Position 3', imageUrl: null, description: 'Exterior body components' },
      'F-08': { name: 'Tool Room Center Aisle - Section F, Position 8', imageUrl: null, description: 'Cab and body hardware' },
    };
  }
}

module.exports = DatabaseService;
