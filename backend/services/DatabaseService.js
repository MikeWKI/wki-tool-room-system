const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const { Part, Shelf, Transaction } = require('../models');

class DatabaseService {
  constructor() {
    this.isConnected = false;
    this.useMongoDb = false;
    
    // JSON file paths (fallback)
    this.DB_DIR = path.join(__dirname, '../database');
    this.PARTS_FILE = path.join(this.DB_DIR, 'parts.json');
    this.TRANSACTIONS_FILE = path.join(this.DB_DIR, 'transactions.json');
    this.SHELVES_FILE = path.join(this.DB_DIR, 'shelves.json');
  }

  async initialize() {
    // Try to connect to MongoDB first
    if (process.env.MONGODB_URI) {
      try {
        await this.connectToMongoDB();
        await this.migrateFromJsonFiles();
        console.log('✅ Using MongoDB for data persistence');
        return;
      } catch (error) {
        console.error('❌ MongoDB connection failed, falling back to JSON files:', error.message);
      }
    }

    // Fallback to JSON files
    await this.initializeJsonFiles();
    console.log('⚠️ Using JSON files for data persistence (not recommended for production)');
  }

  async connectToMongoDB() {
    if (this.isConnected) return;

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable not set');
    }

    await mongoose.connect(mongoUri, {
      dbName: 'WKI-ToolRoomINV-WIC', // Your specific database name
      retryWrites: true,
      w: 'majority'
    });

    this.isConnected = true;
    this.useMongoDb = true;

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
      this.isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
      this.isConnected = true;
    });
  }

  async migrateFromJsonFiles() {
    if (!this.useMongoDb) return;

    try {
      // Check if MongoDB collections are empty
      const partCount = await Part.countDocuments();
      const shelfCount = await Shelf.countDocuments();
      const transactionCount = await Transaction.countDocuments();

      if (partCount === 0 && shelfCount === 0 && transactionCount === 0) {
        console.log('🔄 Migrating data from JSON files to MongoDB...');

        // Migrate parts
        try {
          const partsData = await fs.readFile(this.PARTS_FILE, 'utf8');
          const parts = JSON.parse(partsData);
          if (parts.length > 0) {
            await Part.insertMany(parts);
            console.log(`✅ Migrated ${parts.length} parts to MongoDB`);
          }
        } catch (error) {
          console.log('No parts data to migrate');
        }

        // Migrate shelves
        try {
          const shelvesData = await fs.readFile(this.SHELVES_FILE, 'utf8');
          const shelvesObj = JSON.parse(shelvesData);
          const shelves = Object.entries(shelvesObj).map(([shelfId, data]) => ({
            shelfId,
            ...data
          }));
          if (shelves.length > 0) {
            await Shelf.insertMany(shelves);
            console.log(`✅ Migrated ${shelves.length} shelves to MongoDB`);
          }
        } catch (error) {
          console.log('No shelves data to migrate');
        }

        // Migrate transactions
        try {
          const transactionsData = await fs.readFile(this.TRANSACTIONS_FILE, 'utf8');
          const transactions = JSON.parse(transactionsData);
          if (transactions.length > 0) {
            await Transaction.insertMany(transactions);
            console.log(`✅ Migrated ${transactions.length} transactions to MongoDB`);
          }
        } catch (error) {
          console.log('No transactions data to migrate');
        }

        console.log('🎉 Data migration completed successfully!');
      }
    } catch (error) {
      console.error('Migration error:', error);
    }
  }

  async initializeJsonFiles() {
    try {
      await fs.mkdir(this.DB_DIR, { recursive: true });
      
      // Initialize with default data if files don't exist
      const initialShelves = {
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

      // Check and create files if they don't exist
      const files = [
        { path: this.PARTS_FILE, data: [] },
        { path: this.TRANSACTIONS_FILE, data: [] },
        { path: this.SHELVES_FILE, data: initialShelves }
      ];

      for (const file of files) {
        try {
          await fs.access(file.path);
        } catch {
          await fs.writeFile(file.path, JSON.stringify(file.data, null, 2));
        }
      }
    } catch (error) {
      console.error('Failed to initialize JSON files:', error);
    }
  }

  // Parts operations
  async getParts() {
    if (this.useMongoDb && this.isConnected) {
      return await Part.find().lean();
    } else {
      const data = await fs.readFile(this.PARTS_FILE, 'utf8');
      return JSON.parse(data);
    }
  }

  async addPart(partData) {
    if (this.useMongoDb && this.isConnected) {
      const part = new Part(partData);
      return await part.save();
    } else {
      const parts = await this.getParts();
      parts.push(partData);
      await fs.writeFile(this.PARTS_FILE, JSON.stringify(parts, null, 2));
      return partData;
    }
  }

  async updatePart(id, updateData) {
    if (this.useMongoDb && this.isConnected) {
      return await Part.findOneAndUpdate({ id }, updateData, { new: true });
    } else {
      const parts = await this.getParts();
      const index = parts.findIndex(p => p.id === id);
      if (index !== -1) {
        parts[index] = { ...parts[index], ...updateData };
        await fs.writeFile(this.PARTS_FILE, JSON.stringify(parts, null, 2));
        return parts[index];
      }
      return null;
    }
  }

  async deletePart(id) {
    if (this.useMongoDb && this.isConnected) {
      return await Part.findOneAndDelete({ id });
    } else {
      const parts = await this.getParts();
      const index = parts.findIndex(p => p.id === id);
      if (index !== -1) {
        const deleted = parts.splice(index, 1)[0];
        await fs.writeFile(this.PARTS_FILE, JSON.stringify(parts, null, 2));
        return deleted;
      }
      return null;
    }
  }

  // Shelves operations
  async getShelves() {
    if (this.useMongoDb && this.isConnected) {
      const shelves = await Shelf.find().lean();
      // Convert to object format for backward compatibility
      const shelvesObj = {};
      shelves.forEach(shelf => {
        shelvesObj[shelf.shelfId] = {
          name: shelf.name,
          description: shelf.description,
          imageUrl: shelf.imageUrl
        };
      });
      return shelvesObj;
    } else {
      const data = await fs.readFile(this.SHELVES_FILE, 'utf8');
      return JSON.parse(data);
    }
  }

  async updateShelf(shelfId, updateData) {
    if (this.useMongoDb && this.isConnected) {
      return await Shelf.findOneAndUpdate(
        { shelfId }, 
        { shelfId, ...updateData }, 
        { new: true, upsert: true }
      );
    } else {
      const shelves = await this.getShelves();
      shelves[shelfId] = { ...shelves[shelfId], ...updateData };
      await fs.writeFile(this.SHELVES_FILE, JSON.stringify(shelves, null, 2));
      return shelves[shelfId];
    }
  }

  // Transactions operations
  async getTransactions() {
    if (this.useMongoDb && this.isConnected) {
      return await Transaction.find().sort({ timestamp: -1 }).lean();
    } else {
      const data = await fs.readFile(this.TRANSACTIONS_FILE, 'utf8');
      return JSON.parse(data);
    }
  }

  async addTransaction(transactionData) {
    if (this.useMongoDb && this.isConnected) {
      const transaction = new Transaction(transactionData);
      return await transaction.save();
    } else {
      const transactions = await this.getTransactions();
      transactions.push(transactionData);
      await fs.writeFile(this.TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
      return transactionData;
    }
  }

  // Bulk operations
  async bulkUpdateParts(updates) {
    if (this.useMongoDb && this.isConnected) {
      const bulkOps = updates.map(update => ({
        updateOne: {
          filter: { id: update.id },
          update: { $set: update.data }
        }
      }));
      return await Part.bulkWrite(bulkOps);
    } else {
      const parts = await this.getParts();
      const updatedParts = [];
      
      updates.forEach(update => {
        const index = parts.findIndex(p => p.id === update.id);
        if (index !== -1) {
          parts[index] = { ...parts[index], ...update.data };
          updatedParts.push(parts[index]);
        }
      });
      
      await fs.writeFile(this.PARTS_FILE, JSON.stringify(parts, null, 2));
      return { modifiedCount: updatedParts.length, updatedParts };
    }
  }

  // Backup operations
  async createBackup() {
    const data = {
      parts: await this.getParts(),
      shelves: await this.getShelves(),
      transactions: await this.getTransactions()
    };
    return data;
  }

  async restoreBackup(backupData) {
    if (this.useMongoDb && this.isConnected) {
      // Clear existing data
      await Part.deleteMany({});
      await Shelf.deleteMany({});
      await Transaction.deleteMany({});
      
      // Insert backup data
      if (backupData.parts && backupData.parts.length > 0) {
        await Part.insertMany(backupData.parts);
      }
      
      if (backupData.shelves) {
        const shelves = Object.entries(backupData.shelves).map(([shelfId, data]) => ({
          shelfId,
          ...data
        }));
        if (shelves.length > 0) {
          await Shelf.insertMany(shelves);
        }
      }
      
      if (backupData.transactions && backupData.transactions.length > 0) {
        await Transaction.insertMany(backupData.transactions);
      }
    } else {
      // JSON file restoration
      await fs.writeFile(this.PARTS_FILE, JSON.stringify(backupData.parts || [], null, 2));
      await fs.writeFile(this.SHELVES_FILE, JSON.stringify(backupData.shelves || {}, null, 2));
      await fs.writeFile(this.TRANSACTIONS_FILE, JSON.stringify(backupData.transactions || [], null, 2));
    }
  }

  async validateData() {
    const parts = await this.getParts();
    const shelves = await this.getShelves();
    const transactions = await this.getTransactions();
    
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      summary: {
        totalParts: parts.length,
        totalShelves: Object.keys(shelves).length,
        totalTransactions: transactions.length
      }
    };
    
    // Validate parts
    parts.forEach((part, index) => {
      if (!part.id) {
        validation.errors.push(`Part at index ${index} missing ID`);
        validation.isValid = false;
      }
      if (!part.partNumber) {
        validation.errors.push(`Part ${part.id} missing part number`);
        validation.isValid = false;
      }
      if (part.quantity < 0) {
        validation.warnings.push(`Part ${part.partNumber} has negative quantity`);
      }
      if (part.shelf && !shelves[part.shelf]) {
        validation.warnings.push(`Part ${part.partNumber} references non-existent shelf: ${part.shelf}`);
      }
    });
    
    return validation;
  }

  // Legacy methods for backward compatibility
  async read(type) {
    switch (type) {
      case 'parts': return await this.getParts();
      case 'shelves': return await this.getShelves();
      case 'transactions': return await this.getTransactions();
      default: throw new Error(`Unknown data type: ${type}`);
    }
  }

  async write(type, data) {
    switch (type) {
      case 'parts':
        if (this.useMongoDb && this.isConnected) {
          await Part.deleteMany({});
          await Part.insertMany(data);
        } else {
          await fs.writeFile(this.PARTS_FILE, JSON.stringify(data, null, 2));
        }
        break;
      case 'shelves':
        if (this.useMongoDb && this.isConnected) {
          await Shelf.deleteMany({});
          const shelves = Object.entries(data).map(([shelfId, shelfData]) => ({
            shelfId,
            ...shelfData
          }));
          await Shelf.insertMany(shelves);
        } else {
          await fs.writeFile(this.SHELVES_FILE, JSON.stringify(data, null, 2));
        }
        break;
      case 'transactions':
        if (this.useMongoDb && this.isConnected) {
          await Transaction.deleteMany({});
          await Transaction.insertMany(data);
        } else {
          await fs.writeFile(this.TRANSACTIONS_FILE, JSON.stringify(data, null, 2));
        }
        break;
      default:
        throw new Error(`Unknown data type: ${type}`);
    }
  }
}

module.exports = new DatabaseService();
        timestamp: Date.now(),
      });

      return parsed;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return default based on type
        const defaultData = this.getDefaultData(fileName);
        await this.write(fileName, defaultData);
        return defaultData;
      }
      throw new Error(`Failed to read ${fileName}: ${error.message}`);
    }
  }

  // Generic write with atomic operations
  async write(fileName, data) {
    const filePath = this.files[fileName];
    if (!filePath) {
      throw new Error(`Unknown file: ${fileName}`);
    }

    try {
      // Create backup
      const backupPath = `${filePath}.backup`;
      try {
        await fs.copyFile(filePath, backupPath);
      } catch (err) {
        // Ignore if original doesn't exist
      }

      // Write to temporary file first
      const tempPath = `${filePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
      
      // Atomic rename
      await fs.rename(tempPath, filePath);
      
      // Update cache
      this.cache.set(fileName, {
        data: data,
        timestamp: Date.now(),
      });

      // Clean up backup after successful write
      try {
        await fs.unlink(backupPath);
      } catch (err) {
        // Ignore cleanup errors
      }

    } catch (error) {
      // Try to restore from backup
      const backupPath = `${filePath}.backup`;
      try {
        await fs.copyFile(backupPath, filePath);
      } catch (restoreError) {
        // If restore fails, log both errors
        console.error('Write failed and backup restore failed:', {
          writeError: error.message,
          restoreError: restoreError.message,
        });
      }
      throw new Error(`Failed to write ${fileName}: ${error.message}`);
    }
  }

  // Transaction-like operations
  async transaction(operations) {
    const backups = {};
    const cacheBackups = new Map();

    try {
      // Create backups
      for (const fileName of Object.keys(this.files)) {
        try {
          backups[fileName] = await this.read(fileName);
          cacheBackups.set(fileName, this.cache.get(fileName));
        } catch (error) {
          // If read fails, use empty default
          backups[fileName] = this.getDefaultData(fileName);
        }
      }

      // Execute operations
      const results = await operations(this);
      
      return results;
    } catch (error) {
      // Rollback on error
      console.log('Transaction failed, rolling back...');
      for (const [fileName, data] of Object.entries(backups)) {
        try {
          await this.write(fileName, data);
          // Restore cache
          const cacheData = cacheBackups.get(fileName);
          if (cacheData) {
            this.cache.set(fileName, cacheData);
          }
        } catch (rollbackError) {
          console.error(`Rollback failed for ${fileName}:`, rollbackError);
        }
      }
      throw error;
    }
  }

  // Specific data operations
  async getParts() {
    return this.read('parts');
  }

  async saveParts(parts) {
    if (!Array.isArray(parts)) {
      throw new Error('Parts must be an array');
    }
    return this.write('parts', parts);
  }

  async getTransactions() {
    return this.read('transactions');
  }

  async saveTransactions(transactions) {
    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }
    return this.write('transactions', transactions);
  }

  async getShelves() {
    return this.read('shelves');
  }

  async saveShelves(shelves) {
    if (typeof shelves !== 'object' || Array.isArray(shelves)) {
      throw new Error('Shelves must be an object');
    }
    return this.write('shelves', shelves);
  }

  // Helper methods
  getDefaultData(fileName) {
    switch (fileName) {
      case 'parts':
        return this.getDefaultParts();
      case 'transactions':
        return [];
      case 'shelves':
        return this.getDefaultShelves();
      default:
        return null;
    }
  }

  getDefaultParts() {
    return [
      {
        id: 1,
        partNumber: 'T800-001',
        description: 'Engine Oil Filter',
        shelf: 'A-01',
        category: 'Engine Parts',
        status: 'available',
        checkedOutBy: null,
        checkedOutDate: null,
        quantity: 5,
        minQuantity: 2,
        cost: 25.99,
        supplier: 'Kenworth Parts',
        lastUpdated: new Date().toISOString(),
      },
      {
        id: 2,
        partNumber: 'T800-002',
        description: 'Air Brake Valve',
        shelf: 'B-03',
        category: 'Brake System',
        status: 'available',
        checkedOutBy: null,
        checkedOutDate: null,
        quantity: 2,
        minQuantity: 1,
        cost: 89.50,
        supplier: 'Bendix',
        lastUpdated: new Date().toISOString(),
      },
      // Add more default parts as needed
    ];
  }

  getDefaultShelves() {
    return {
      'A-01': {
        name: 'Tool Room North Wall - Section A, Position 1',
        description: 'Engine filters and maintenance parts',
        imageUrl: null,
        location: 'North Wall',
        capacity: 50,
        currentCount: 0,
      },
      'B-03': {
        name: 'Tool Room East Wall - Section B, Position 3',
        description: 'Brake system parts',
        imageUrl: null,
        location: 'East Wall',
        capacity: 30,
        currentCount: 0,
      },
      // Add more default shelves as needed
    };
  }

  // Search with indexing
  async searchParts(query, fields = ['partNumber', 'description', 'category']) {
    const parts = await this.getParts();
    const lowerQuery = query.toLowerCase();
    
    return parts.filter(part => {
      return fields.some(field => {
        const value = part[field];
        return value && value.toString().toLowerCase().includes(lowerQuery);
      });
    });
  }

  // Advanced filtering
  async filterParts(filters) {
    const parts = await this.getParts();
    
    return parts.filter(part => {
      return Object.entries(filters).every(([key, value]) => {
        if (value === null || value === undefined || value === '') {
          return true;
        }
        
        if (Array.isArray(value)) {
          return value.includes(part[key]);
        }
        
        if (typeof value === 'object' && value.min !== undefined || value.max !== undefined) {
          const partValue = part[key];
          if (value.min !== undefined && partValue < value.min) return false;
          if (value.max !== undefined && partValue > value.max) return false;
          return true;
        }
        
        return part[key] === value;
      });
    });
  }

  // Statistics and analytics
  async getStats() {
    const [parts, transactions] = await Promise.all([
      this.getParts(),
      this.getTransactions()
    ]);

    const availableParts = parts.filter(p => p.status === 'available').length;
    const checkedOutParts = parts.filter(p => p.status === 'checked_out').length;
    const noStockParts = parts.filter(p => p.quantity === 0).length;
    const totalValue = parts.reduce((sum, p) => sum + (p.cost || 0) * p.quantity, 0);

    // Recent transactions (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentTransactions = transactions.filter(t => new Date(t.timestamp) > thirtyDaysAgo);

    return {
      totalParts: parts.length,
      availableParts,
      checkedOutParts,
      noStockParts,
      totalValue: Math.round(totalValue * 100) / 100,
      totalTransactions: transactions.length,
      recentTransactions: recentTransactions.length,
      lastUpdated: new Date().toISOString(),
    };
  }

  // Clear cache
  clearCache(fileName = null) {
    if (fileName) {
      this.cache.delete(fileName);
    } else {
      this.cache.clear();
    }
  }

  // Health check
  async healthCheck() {
    try {
      const stats = await this.getStats();
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        cacheSize: this.cache.size,
        ...stats,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

module.exports = DatabaseService;
