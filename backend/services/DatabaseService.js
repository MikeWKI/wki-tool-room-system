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
        this.useMongoDb = true;
        console.log('✅ Using MongoDB for data persistence');
        return;
      } catch (error) {
        console.error('❌ MongoDB connection failed, falling back to JSON files:', error.message);
      }
    }

    // Fallback to JSON files
    await this.initializeJsonFiles();
    console.log('⚠️ Using JSON files - data will be lost on redeployment');
  }

  async connectToMongoDB() {
    await mongoose.connect(process.env.MONGODB_URI);
    this.isConnected = true;
    console.log('🔗 Connected to MongoDB Atlas');
    
    // Test the connection
    await mongoose.connection.db.admin().ping();
    console.log('🏓 MongoDB connection verified');
  }

  async initializeJsonFiles() {
    try {
      await fs.mkdir(this.DB_DIR, { recursive: true });
      
      // Initialize files if they don't exist
      const files = [
        { path: this.PARTS_FILE, default: [] },
        { path: this.TRANSACTIONS_FILE, default: [] },
        { path: this.SHELVES_FILE, default: this.getDefaultShelves() }
      ];

      for (const file of files) {
        try {
          await fs.access(file.path);
        } catch (error) {
          await fs.writeFile(file.path, JSON.stringify(file.default, null, 2));
          console.log(`📁 Created ${path.basename(file.path)}`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to initialize JSON files:', error.message);
      throw error;
    }
  }

  async migrateFromJsonFiles() {
    if (!this.useMongoDb) return;

    try {
      console.log('🔄 Checking for data migration from JSON files...');

      // Check if MongoDB collections are empty
      const partsCount = await Part.countDocuments();
      const shelvesCount = await Shelf.countDocuments();

      if (partsCount === 0 || shelvesCount === 0) {
        console.log('📦 MongoDB collections are empty, attempting migration...');

        // Read JSON files if they exist
        const jsonData = await this.readJsonFilesForMigration();

        if (jsonData.parts.length > 0) {
          await Part.insertMany(jsonData.parts);
          console.log(`✅ Migrated ${jsonData.parts.length} parts to MongoDB`);
        }

        if (Object.keys(jsonData.shelves).length > 0) {
          const shelfDocs = Object.entries(jsonData.shelves).map(([id, data]) => ({
            shelfId: id,
            ...data
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
      console.error('❌ Migration failed:', error.message);
      // Don't throw - continue with MongoDB even if migration fails
    }
  }

  async readJsonFilesForMigration() {
    const defaultData = {
      parts: [],
      shelves: {},
      transactions: []
    };

    try {
      // Read parts
      try {
        const partsData = await fs.readFile(this.PARTS_FILE, 'utf8');
        defaultData.parts = JSON.parse(partsData);
      } catch (error) {
        console.log('📁 No parts.json found for migration');
      }

      // Read shelves
      try {
        const shelvesData = await fs.readFile(this.SHELVES_FILE, 'utf8');
        defaultData.shelves = JSON.parse(shelvesData);
      } catch (error) {
        console.log('📁 No shelves.json found for migration');
        defaultData.shelves = this.getDefaultShelves();
      }

      // Read transactions
      try {
        const transactionsData = await fs.readFile(this.TRANSACTIONS_FILE, 'utf8');
        defaultData.transactions = JSON.parse(transactionsData);
      } catch (error) {
        console.log('📁 No transactions.json found for migration');
      }

      return defaultData;
    } catch (error) {
      console.error('❌ Error reading JSON files for migration:', error.message);
      return defaultData;
    }
  }

  async getParts() {
    if (this.useMongoDb) {
      return await Part.find({}).lean();
    } else {
      try {
        const data = await fs.readFile(this.PARTS_FILE, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        return [];
      }
    }
  }

  async saveParts(parts) {
    if (this.useMongoDb) {
      await Part.deleteMany({});
      if (parts.length > 0) {
        await Part.insertMany(parts);
      }
    } else {
      try {
        await fs.mkdir(this.DB_DIR, { recursive: true });
        await fs.writeFile(this.PARTS_FILE, JSON.stringify(parts, null, 2));
      } catch (error) {
        console.error('Error saving parts:', error);
      }
    }
  }

  async getTransactions() {
    if (this.useMongoDb) {
      return await Transaction.find({}).lean();
    } else {
      try {
        const data = await fs.readFile(this.TRANSACTIONS_FILE, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        return [];
      }
    }
  }

  async saveTransactions(transactions) {
    if (this.useMongoDb) {
      await Transaction.deleteMany({});
      if (transactions.length > 0) {
        await Transaction.insertMany(transactions);
      }
    } else {
      try {
        await fs.mkdir(this.DB_DIR, { recursive: true });
        await fs.writeFile(this.TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
      } catch (error) {
        console.error('Error saving transactions:', error);
      }
    }
  }

  async getShelves() {
    if (this.useMongoDb) {
      const shelves = await Shelf.find({}).lean();
      const shelvesObj = {};
      shelves.forEach(shelf => {
        shelvesObj[shelf.shelfId] = {
          name: shelf.name,
          imageUrl: shelf.imageUrl,
          description: shelf.description
        };
      });
      return shelvesObj;
    } else {
      try {
        const data = await fs.readFile(this.SHELVES_FILE, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        return this.getDefaultShelves();
      }
    }
  }

  async saveShelves(shelves) {
    if (this.useMongoDb) {
      await Shelf.deleteMany({});
      const shelfDocs = Object.entries(shelves).map(([id, shelfData]) => ({
        shelfId: id,
        name: shelfData.name,
        imageUrl: shelfData.imageUrl,
        description: shelfData.description
      }));
      if (shelfDocs.length > 0) {
        await Shelf.insertMany(shelfDocs);
      }
    } else {
      try {
        await fs.mkdir(this.DB_DIR, { recursive: true });
        await fs.writeFile(this.SHELVES_FILE, JSON.stringify(shelves, null, 2));
      } catch (error) {
        console.error('Error saving shelves:', error);
      }
    }
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
      'F-08': { name: 'Tool Room Center Aisle - Section F, Position 8', imageUrl: null, description: 'Cab and body hardware' }
    };
  }
}

module.exports = DatabaseService;
