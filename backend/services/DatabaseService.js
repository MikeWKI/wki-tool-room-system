const fs = require('fs').promises;
const path = require('path');

class DatabaseService {
  constructor(dbDir = path.join(__dirname, '../database')) {
    this.dbDir = dbDir;
    this.cache = new Map();
    this.cacheTimeout = 30000; // 30 seconds
    
    // File paths
    this.files = {
      parts: path.join(dbDir, 'parts.json'),
      transactions: path.join(dbDir, 'transactions.json'),
      shelves: path.join(dbDir, 'shelves.json'),
    };

    // Ensure database directory exists
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.dbDir, { recursive: true });
      console.log('Database service initialized');
    } catch (error) {
      console.error('Failed to initialize database service:', error);
    }
  }

  // Generic read with caching
  async read(fileName) {
    const filePath = this.files[fileName];
    if (!filePath) {
      throw new Error(`Unknown file: ${fileName}`);
    }

    // Check cache first
    const cacheKey = fileName;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(data);
      
      // Update cache
      this.cache.set(cacheKey, {
        data: parsed,
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
    const lowStockParts = parts.filter(p => p.quantity <= p.minQuantity).length;
    const totalValue = parts.reduce((sum, p) => sum + (p.cost || 0) * p.quantity, 0);

    // Recent transactions (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentTransactions = transactions.filter(t => new Date(t.timestamp) > thirtyDaysAgo);

    return {
      totalParts: parts.length,
      availableParts,
      checkedOutParts,
      lowStockParts,
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
