const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const dbService = require('./services/DatabaseService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(helmet());
app.use(limiter);
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    process.env.CORS_ORIGIN || 'https://wki-tool-room-system.onrender.com',
    'https://wki-tool-room-system-1.onrender.com',
    /https:\/\/.*\.onrender\.com$/, // Allow any Render subdomain
    /https:\/\/wki-tool-room.*\.onrender\.com$/ // Allow any WKI tool room variants
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.includes('sheet') || file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'), false);
    }
  }
});

// Database service is now handled by DatabaseService.js
// The old JSON file initialization is no longer needed as the DatabaseService
// handles both MongoDB and JSON file operations automatically

// Database helper functions using the new DatabaseService
async function readParts() {
  try {
    return await dbService.getParts();
  } catch (error) {
    console.error('Error reading parts:', error);
    return [];
  }
}

async function writeParts(parts) {
  try {
    await dbService.write('parts', parts);
    return true;
  } catch (error) {
    console.error('Error writing parts:', error);
    return false;
  }
}

async function readTransactions() {
  try {
    return await dbService.getTransactions();
  } catch (error) {
    console.error('Error reading transactions:', error);
    return [];
  }
}

async function writeTransactions(transactions) {
  try {
    await dbService.write('transactions', transactions);
    return true;
  } catch (error) {
    console.error('Error writing transactions:', error);
    return false;
  }
}

async function readShelves() {
  try {
    return await dbService.getShelves();
  } catch (error) {
    console.error('Error reading shelves:', error);
    return {};
  }
}

async function writeShelves(shelves) {
  try {
    await dbService.write('shelves', shelves);
    return true;
  } catch (error) {
    console.error('Error writing shelves:', error);
    return false;
  }
}

// API Routes

// Get all parts
app.get('/api/parts', async (req, res) => {
  try {
    const parts = await readParts();
    res.json(parts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch parts' });
  }
});

// Get specific part by ID
app.get('/api/parts/:id', async (req, res) => {
  try {
    const parts = await readParts();
    const part = parts.find(p => p.id === parseInt(req.params.id));
    
    if (!part) {
      return res.status(404).json({ error: 'Part not found' });
    }
    
    res.json(part);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch part' });
  }
});

// Search parts
app.get('/api/parts/search/:query', async (req, res) => {
  try {
    const parts = await readParts();
    const query = req.params.query.toLowerCase();
    
    const filteredParts = parts.filter(part => 
      part.partNumber.toLowerCase().includes(query) ||
      part.description.toLowerCase().includes(query) ||
      part.category.toLowerCase().includes(query)
    );
    
    res.json(filteredParts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search parts' });
  }
});

// Check out a part
app.post('/api/parts/:id/checkout', async (req, res) => {
  try {
    const { user, notes } = req.body;
    const partId = parseInt(req.params.id);
    
    if (!user) {
      return res.status(400).json({ error: 'User name is required' });
    }
    
    const parts = await readParts();
    const partIndex = parts.findIndex(p => p.id === partId);
    
    if (partIndex === -1) {
      return res.status(404).json({ error: 'Part not found' });
    }
    
    const part = parts[partIndex];
    
    if (part.status === 'checked_out') {
      return res.status(400).json({ error: 'Part is already checked out' });
    }
    
    if (part.quantity <= 0) {
      return res.status(400).json({ error: 'Part is out of stock' });
    }
    
    // Update part status
    parts[partIndex] = {
      ...part,
      status: 'checked_out',
      checkedOutBy: user,
      checkedOutDate: new Date().toISOString(),
      quantity: part.quantity - 1
    };
    
    // Save updated parts
    await writeParts(parts);
    
    // Create transaction record
    const transactions = await readTransactions();
    const newTransaction = {
      id: Date.now(),
      partId: partId,
      partNumber: part.partNumber,
      action: 'checkout',
      user: user,
      timestamp: new Date().toISOString(),
      notes: notes || '',
      quantityBefore: part.quantity,
      quantityAfter: part.quantity - 1
    };
    
    transactions.unshift(newTransaction);
    await writeTransactions(transactions);
    
    res.json({ 
      success: true, 
      part: parts[partIndex], 
      transaction: newTransaction 
    });
    
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Failed to check out part' });
  }
});

// Check in a part
app.post('/api/parts/:id/checkin', async (req, res) => {
  try {
    const { user, notes } = req.body;
    const partId = parseInt(req.params.id);
    
    if (!user) {
      return res.status(400).json({ error: 'User name is required' });
    }
    
    const parts = await readParts();
    const partIndex = parts.findIndex(p => p.id === partId);
    
    if (partIndex === -1) {
      return res.status(404).json({ error: 'Part not found' });
    }
    
    const part = parts[partIndex];
    
    if (part.status !== 'checked_out') {
      return res.status(400).json({ error: 'Part is not checked out' });
    }
    
    // Update part status
    parts[partIndex] = {
      ...part,
      status: 'available',
      checkedOutBy: null,
      checkedOutDate: null,
      quantity: part.quantity + 1
    };
    
    // Save updated parts
    await writeParts(parts);
    
    // Create transaction record
    const transactions = await readTransactions();
    const newTransaction = {
      id: Date.now(),
      partId: partId,
      partNumber: part.partNumber,
      action: 'checkin',
      user: user,
      timestamp: new Date().toISOString(),
      notes: notes || '',
      quantityBefore: part.quantity,
      quantityAfter: part.quantity + 1
    };
    
    transactions.unshift(newTransaction);
    await writeTransactions(transactions);
    
    res.json({ 
      success: true, 
      part: parts[partIndex], 
      transaction: newTransaction 
    });
    
  } catch (error) {
    console.error('Checkin error:', error);
    res.status(500).json({ error: 'Failed to check in part' });
  }
});

// Get all transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const transactions = await readTransactions();
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get transactions for a specific part
app.get('/api/parts/:id/transactions', async (req, res) => {
  try {
    const partId = parseInt(req.params.id);
    const transactions = await readTransactions();
    const partTransactions = transactions.filter(t => t.partId === partId);
    res.json(partTransactions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch part transactions' });
  }
});

// Get all shelves
app.get('/api/shelves', async (req, res) => {
  try {
    const shelves = await readShelves();
    res.json(shelves);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shelves' });
  }
});

// Get specific shelf
app.get('/api/shelves/:shelfId', async (req, res) => {
  try {
    const shelves = await readShelves();
    const shelf = shelves[req.params.shelfId];
    
    if (!shelf) {
      return res.status(404).json({ error: 'Shelf not found' });
    }
    
    res.json(shelf);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shelf' });
  }
});

// Add new part
app.post('/api/parts', async (req, res) => {
  try {
    const { partNumber, description, shelf, category, quantity, minQuantity } = req.body;
    
    if (!partNumber || !description || !shelf || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const parts = await readParts();
    
    // Check if part number already exists
    const existingPart = parts.find(p => p.partNumber === partNumber);
    if (existingPart) {
      return res.status(400).json({ error: 'Part number already exists' });
    }
    
    const newPart = {
      id: Math.max(...parts.map(p => p.id), 0) + 1,
      partNumber,
      description,
      shelf,
      category,
      status: 'available',
      checkedOutBy: null,
      checkedOutDate: null,
      quantity: quantity || 1,
      minQuantity: minQuantity || 1
    };
    
    parts.push(newPart);
    await writeParts(parts);
    
    res.status(201).json(newPart);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add part' });
  }
});

// Update part
app.put('/api/parts/:id', async (req, res) => {
  try {
    const partId = parseInt(req.params.id);
    const updates = req.body;
    
    const parts = await readParts();
    const partIndex = parts.findIndex(p => p.id === partId);
    
    if (partIndex === -1) {
      return res.status(404).json({ error: 'Part not found' });
    }
    
    const originalPart = { ...parts[partIndex] };
    
    // Prevent updating checkout status through this endpoint
    delete updates.status;
    delete updates.checkedOutBy;
    delete updates.checkedOutDate;
    
    // Track location changes for audit trail
    if (updates.shelf && updates.shelf !== originalPart.shelf) {
      updates.lastLocationChange = new Date().toISOString();
      updates.previousLocation = originalPart.shelf;
    }
    
    // Update last modified timestamp
    updates.lastModified = new Date().toISOString();
    updates.modifiedBy = updates.modifiedBy || 'System';
    
    parts[partIndex] = { ...parts[partIndex], ...updates };
    await writeParts(parts);

    // Log the location change in transactions if shelf was updated
    if (updates.shelf && updates.shelf !== originalPart.shelf) {
      const transactions = await readTransactions();
      const locationChangeRecord = {
        id: Date.now(),
        partId: partId,
        partNumber: parts[partIndex].partNumber,
        action: 'location_change',
        fromLocation: originalPart.shelf,
        toLocation: updates.shelf,
        user: updates.modifiedBy || 'System',
        timestamp: new Date().toISOString(),
        notes: `Part moved from ${originalPart.shelf} to ${updates.shelf}`
      };
      transactions.push(locationChangeRecord);
      await writeTransactions(transactions);
    }
    
    res.json(parts[partIndex]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update part' });
  }
});

// Delete part
app.delete('/api/parts/:id', async (req, res) => {
  try {
    const partId = parseInt(req.params.id);
    
    const parts = await readParts();
    const partIndex = parts.findIndex(p => p.id === partId);
    
    if (partIndex === -1) {
      return res.status(404).json({ error: 'Part not found' });
    }
    
    const deletedPart = parts.splice(partIndex, 1)[0];
    await writeParts(parts);
    
    res.json({ success: true, deletedPart });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete part' });
  }
});

// Bulk update parts locations
app.put('/api/parts/bulk/locations', async (req, res) => {
  try {
    const { updates, modifiedBy = 'System' } = req.body;
    // updates should be an array of { id, shelf }
    
    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'Updates must be an array' });
    }
    
    const parts = await readParts();
    const transactions = await readTransactions();
    const timestamp = new Date().toISOString();
    const updatedParts = [];
    const locationChanges = [];
    
    for (const update of updates) {
      const partIndex = parts.findIndex(p => p.id === parseInt(update.id));
      if (partIndex !== -1) {
        const originalPart = { ...parts[partIndex] };
        
        if (update.shelf && update.shelf !== originalPart.shelf) {
          parts[partIndex].shelf = update.shelf;
          parts[partIndex].lastLocationChange = timestamp;
          parts[partIndex].previousLocation = originalPart.shelf;
          parts[partIndex].lastModified = timestamp;
          parts[partIndex].modifiedBy = modifiedBy;
          
          updatedParts.push(parts[partIndex]);
          
          // Track location change for transaction log
          locationChanges.push({
            id: Date.now() + partIndex, // Ensure unique ID
            partId: parts[partIndex].id,
            partNumber: parts[partIndex].partNumber,
            action: 'location_change',
            fromLocation: originalPart.shelf,
            toLocation: update.shelf,
            user: modifiedBy,
            timestamp: timestamp,
            notes: `Bulk location update: ${originalPart.shelf} → ${update.shelf}`
          });
        }
      }
    }
    
    await writeParts(parts);
    
    // Add all location changes to transaction history
    if (locationChanges.length > 0) {
      transactions.push(...locationChanges);
      await writeTransactions(transactions);
    }
    
    res.json({ 
      success: true, 
      updated: updatedParts.length,
      updatedParts 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to bulk update locations' });
  }
});

// Bulk update part quantities
app.put('/api/parts/bulk/quantities', async (req, res) => {
  try {
    const { updates, modifiedBy = 'System' } = req.body;
    // updates should be an array of { id, quantity, adjustment }
    
    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'Updates must be an array' });
    }
    
    const parts = await readParts();
    const transactions = await readTransactions();
    const timestamp = new Date().toISOString();
    const updatedParts = [];
    
    for (const update of updates) {
      const partIndex = parts.findIndex(p => p.id === parseInt(update.id));
      if (partIndex !== -1) {
        const originalQuantity = parts[partIndex].quantity;
        
        if (update.quantity !== undefined) {
          parts[partIndex].quantity = Math.max(0, parseInt(update.quantity));
        } else if (update.adjustment !== undefined) {
          parts[partIndex].quantity = Math.max(0, originalQuantity + parseInt(update.adjustment));
        }
        
        parts[partIndex].lastModified = timestamp;
        parts[partIndex].modifiedBy = modifiedBy;
        
        updatedParts.push(parts[partIndex]);
        
        // Log quantity change
        transactions.push({
          id: Date.now() + partIndex,
          partId: parts[partIndex].id,
          partNumber: parts[partIndex].partNumber,
          action: 'quantity_update',
          fromQuantity: originalQuantity,
          toQuantity: parts[partIndex].quantity,
          user: modifiedBy,
          timestamp: timestamp,
          notes: `Quantity updated: ${originalQuantity} → ${parts[partIndex].quantity}`
        });
      }
    }
    
    await writeParts(parts);
    await writeTransactions(transactions);
    
    res.json({ 
      success: true, 
      updated: updatedParts.length,
      updatedParts 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to bulk update quantities' });
  }
});

// Get parts by location/shelf
app.get('/api/parts/by-location/:shelf', async (req, res) => {
  try {
    const shelf = decodeURIComponent(req.params.shelf);
    const parts = await readParts();
    
    const partsInLocation = parts.filter(part => 
      part.shelf && part.shelf.toLowerCase().includes(shelf.toLowerCase())
    );
    
    res.json(partsInLocation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get parts by location' });
  }
});

// Get inventory report
app.get('/api/reports/inventory', async (req, res) => {
  try {
    const parts = await readParts();
    const shelves = await readShelves();
    
    // Group parts by shelf
    const locationReport = {};
    parts.forEach(part => {
      const shelf = part.shelf || 'Unassigned';
      if (!locationReport[shelf]) {
        locationReport[shelf] = {
          shelfInfo: shelves[shelf] || { name: shelf, description: 'No description' },
          parts: [],
          totalQuantity: 0,
          categories: new Set()
        };
      }
      locationReport[shelf].parts.push(part);
      locationReport[shelf].totalQuantity += part.quantity || 0;
      locationReport[shelf].categories.add(part.category);
    });
    
    // Convert categories Set to Array for JSON serialization
    Object.values(locationReport).forEach(location => {
      location.categories = Array.from(location.categories);
    });
    
    // Low stock alerts
    const lowStockParts = parts.filter(part => 
      part.quantity <= (part.minQuantity || 1)
    );
    
    // Category breakdown
    const categoryStats = parts.reduce((acc, part) => {
      const category = part.category || 'Uncategorized';
      if (!acc[category]) {
        acc[category] = { count: 0, totalQuantity: 0 };
      }
      acc[category].count++;
      acc[category].totalQuantity += part.quantity || 0;
      return acc;
    }, {});
    
    res.json({
      locationReport,
      lowStockParts,
      categoryStats,
      totalParts: parts.length,
      totalQuantity: parts.reduce((sum, part) => sum + (part.quantity || 0), 0),
      reportGenerated: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate inventory report' });
  }
});

// Data backup and validation endpoints
// Create full data backup
app.get('/api/backup/create', async (req, res) => {
  try {
    const parts = await readParts();
    const shelves = await readShelves();
    const transactions = await readTransactions();
    
    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      data: {
        parts,
        shelves,
        transactions
      },
      metadata: {
        totalParts: parts.length,
        totalTransactions: transactions.length,
        totalShelves: Object.keys(shelves).length
      }
    };
    
    res.json(backup);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// Validate data integrity
app.get('/api/backup/validate', async (req, res) => {
  try {
    const parts = await readParts();
    const shelves = await readShelves();
    const transactions = await readTransactions();
    
    const validation = {
      timestamp: new Date().toISOString(),
      isValid: true,
      errors: [],
      warnings: [],
      summary: {
        totalParts: parts.length,
        totalShelves: Object.keys(shelves).length,
        totalTransactions: transactions.length
      }
    };
    
    // Validate parts data
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
    
    // Check for duplicate part numbers
    const partNumbers = parts.map(p => p.partNumber);
    const duplicatePartNumbers = partNumbers.filter((num, index) => partNumbers.indexOf(num) !== index);
    if (duplicatePartNumbers.length > 0) {
      validation.warnings.push(`Duplicate part numbers found: ${[...new Set(duplicatePartNumbers)].join(', ')}`);
    }
    
    // Validate transactions reference existing parts
    const partIds = new Set(parts.map(p => p.id));
    transactions.forEach((transaction, index) => {
      if (transaction.partId && !partIds.has(transaction.partId)) {
        validation.warnings.push(`Transaction ${transaction.id} references non-existent part ID: ${transaction.partId}`);
      }
    });
    
    res.json(validation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to validate data' });
  }
});

// Restore from backup (POST with backup data)
app.post('/api/backup/restore', async (req, res) => {
  try {
    const { data, confirm } = req.body;
    
    if (!confirm) {
      return res.status(400).json({ error: 'Restoration requires confirmation' });
    }
    
    if (!data || !data.parts || !data.shelves || !data.transactions) {
      return res.status(400).json({ error: 'Invalid backup data format' });
    }
    
    // Create backup of current data before restoration
    const currentBackup = {
      timestamp: new Date().toISOString(),
      parts: await readParts(),
      shelves: await readShelves(),
      transactions: await readTransactions()
    };
    
    // Write backup data to disk
    await writeParts(data.parts);
    await writeShelves(data.shelves);
    await writeTransactions(data.transactions);
    
    res.json({ 
      success: true, 
      message: 'Data restored successfully',
      restoredCounts: {
        parts: data.parts.length,
        shelves: Object.keys(data.shelves).length,
        transactions: data.transactions.length
      },
      previousBackup: currentBackup
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

// Auto-backup creation endpoint (can be called by cron job)
app.post('/api/backup/auto-create', async (req, res) => {
  try {
    const parts = await readParts();
    const shelves = await readShelves();
    const transactions = await readTransactions();
    
    const backupFileName = `backup-${new Date().toISOString().split('T')[0]}.json`;
    const backupPath = path.join(__dirname, 'backups', backupFileName);
    
    // Ensure backups directory exists
    await fs.mkdir(path.join(__dirname, 'backups'), { recursive: true });
    
    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      data: { parts, shelves, transactions },
      metadata: {
        totalParts: parts.length,
        totalTransactions: transactions.length,
        totalShelves: Object.keys(shelves).length
      }
    };
    
    await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));
    
    res.json({ 
      success: true, 
      backupFile: backupFileName,
      backupPath: backupPath,
      size: JSON.stringify(backup).length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create auto-backup' });
  }
});

// Get dashboard stats
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const parts = await readParts();
    const transactions = await readTransactions();
    
    const stats = {
      totalParts: parts.length,
      availableParts: parts.filter(p => p.status === 'available').length,
      checkedOutParts: parts.filter(p => p.status === 'checked_out').length,
      noStockParts: parts.filter(p => p.quantity === 0).length,
      totalTransactions: transactions.length,
      recentCheckouts: transactions.filter(t => t.action === 'checkout').slice(0, 5),
      categories: [...new Set(parts.map(p => p.category))].length
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Shelf Management Routes

// Get all shelves
app.get('/api/shelves', async (req, res) => {
  try {
    const shelves = await readShelves();
    const shelvesArray = Object.entries(shelves).map(([key, value]) => ({
      id: key,
      name: key,
      location: value.name || key,
      description: value.description || '',
      imagePath: value.imageUrl || null
    }));
    res.json(shelvesArray);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shelves' });
  }
});

// Get single shelf
app.get('/api/shelves/:id', async (req, res) => {
  try {
    const shelves = await readShelves();
    const shelf = shelves[req.params.id];
    
    if (!shelf) {
      return res.status(404).json({ error: 'Shelf not found' });
    }
    
    res.json({
      id: req.params.id,
      name: req.params.id,
      location: shelf.name || req.params.id,
      description: shelf.description || '',
      imagePath: shelf.imageUrl || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shelf' });
  }
});

// Create new shelf
app.post('/api/shelves', async (req, res) => {
  try {
    const { name, location, description, image } = req.body;
    
    if (!name || !location) {
      return res.status(400).json({ error: 'Name and location are required' });
    }
    
    const shelves = await readShelves();
    
    if (shelves[name]) {
      return res.status(400).json({ error: 'Shelf with this name already exists' });
    }
    
    const newShelf = {
      name: location,
      description: description || '',
      imageUrl: null // For now, image handling can be added later
    };
    
    shelves[name] = newShelf;
    
    const success = await writeShelves(shelves);
    if (!success) {
      return res.status(500).json({ error: 'Failed to create shelf' });
    }
    
    res.status(201).json({
      id: name,
      name: name,
      location: location,
      description: description || '',
      imagePath: null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create shelf' });
  }
});

// Update shelf
app.put('/api/shelves/:id', async (req, res) => {
  try {
    const { name, location, description } = req.body;
    const shelfId = req.params.id;
    
    if (!name || !location) {
      return res.status(400).json({ error: 'Name and location are required' });
    }
    
    const shelves = await readShelves();
    
    if (!shelves[shelfId]) {
      return res.status(404).json({ error: 'Shelf not found' });
    }
    
    // If name changed, we need to update parts that reference this shelf
    if (name !== shelfId) {
      const parts = await readParts();
      const updatedParts = parts.map(part => 
        part.shelf === shelfId ? { ...part, shelf: name } : part
      );
      await writeParts(updatedParts);
      
      // Remove old shelf and add new one
      delete shelves[shelfId];
      shelves[name] = {
        name: location,
        description: description || '',
        imageUrl: shelves[shelfId]?.imageUrl || null
      };
    } else {
      // Just update the existing shelf
      shelves[shelfId] = {
        name: location,
        description: description || '',
        imageUrl: shelves[shelfId]?.imageUrl || null
      };
    }
    
    const success = await writeShelves(shelves);
    if (!success) {
      return res.status(500).json({ error: 'Failed to update shelf' });
    }
    
    res.json({
      id: name,
      name: name,
      location: location,
      description: description || '',
      imagePath: shelves[name]?.imageUrl || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update shelf' });
  }
});

// Delete shelf
app.delete('/api/shelves/:id', async (req, res) => {
  try {
    const shelfId = req.params.id;
    const shelves = await readShelves();
    
    if (!shelves[shelfId]) {
      return res.status(404).json({ error: 'Shelf not found' });
    }
    
    // Check if any parts are assigned to this shelf
    const parts = await readParts();
    const partsOnShelf = parts.filter(part => part.shelf === shelfId);
    
    if (partsOnShelf.length > 0) {
      return res.status(400).json({ 
        error: `Cannot delete shelf. ${partsOnShelf.length} parts are assigned to this shelf.` 
      });
    }
    
    delete shelves[shelfId];
    
    const success = await writeShelves(shelves);
    if (!success) {
      return res.status(500).json({ error: 'Failed to delete shelf' });
    }
    
    res.json({ message: 'Shelf deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete shelf' });
  }
});

// Excel Import endpoint
app.post('/api/import/excel', upload.single('excelFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file provided' });
    }

    const partsData = JSON.parse(req.body.partsData || '[]');
    
    if (!Array.isArray(partsData) || partsData.length === 0) {
      return res.status(400).json({ error: 'No valid parts data provided' });
    }

    // Save uploaded Excel file for reference
    const uploadsDir = path.join(__dirname, 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const savedFileName = `imported_${timestamp}_${req.file.originalname}`;
    const savedFilePath = path.join(uploadsDir, savedFileName);
    
    await fs.writeFile(savedFilePath, req.file.buffer);
    console.log(`Excel file saved: ${savedFilePath}`);

    // Read existing parts to get the next available ID
    const existingParts = await readParts();
    let nextId = Math.max(...existingParts.map(p => p.id), 0) + 1;

    // Process and validate parts data
    const validParts = [];
    const errors = [];

    partsData.forEach((part, index) => {
      // Validate required fields
      if (!part.partNumber && !part.description) {
        errors.push(`Row ${index + 1}: Part must have either a part number or description`);
        return;
      }

      // Create validated part object
      const validatedPart = {
        id: nextId++,
        partNumber: (part.partNumber || '').toString().trim(),
        description: (part.description || '').toString().trim(),
        shelf: (part.shelf || 'TBD').toString().trim(),
        category: (part.category || 'General').toString().trim(),
        status: 'available',
        checkedOutBy: null,
        checkedOutDate: null,
        quantity: Math.max(parseInt(part.quantity) || 1, 0),
        minQuantity: Math.max(parseInt(part.minQuantity) || 1, 0)
      };

      validParts.push(validatedPart);
    });

    if (errors.length > 0 && validParts.length === 0) {
      return res.status(400).json({ 
        error: 'No valid parts found', 
        details: errors 
      });
    }

    // Add parts to existing inventory
    const updatedParts = [...existingParts, ...validParts];
    const success = await writeParts(updatedParts);

    if (!success) {
      return res.status(500).json({ error: 'Failed to save imported parts' });
    }

    // Create transaction records for the import
    const transactions = await readTransactions();
    const importTransaction = {
      id: Date.now(),
      partId: null,
      partNumber: 'BULK_IMPORT',
      action: 'import',
      user: 'System',
      timestamp: new Date().toISOString(),
      notes: `Imported ${validParts.length} parts from Excel file: ${req.file.originalname}`,
      quantityBefore: existingParts.length,
      quantityAfter: updatedParts.length
    };

    transactions.unshift(importTransaction);
    await writeTransactions(transactions);

    res.json({
      success: true,
      message: `Successfully imported ${validParts.length} parts`,
      importedCount: validParts.length,
      totalParts: updatedParts.length,
      errors: errors.length > 0 ? errors : null,
      transaction: importTransaction
    });

  } catch (error) {
    console.error('Excel import error:', error);
    res.status(500).json({ 
      error: 'Failed to process Excel import', 
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    cors_origins: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      process.env.CORS_ORIGIN || 'https://wki-tool-room-system.onrender.com',
      'https://wki-tool-room-system-1.onrender.com'
    ]
  });
});

// CORS preflight handler
app.options('*', cors());

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({
    error: 'Internal Server Error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint to check database status
app.get('/api/debug/database', async (req, res) => {
  try {
    const parts = await readParts();
    const transactions = await readTransactions();
    const shelves = await readShelves();
    
    res.json({
      parts: {
        count: parts.length,
        sample: parts.slice(0, 3)
      },
      transactions: {
        count: transactions.length,
        latest: transactions.slice(0, 2)
      },
      shelves: {
        count: Object.keys(shelves).length,
        sample: Object.keys(shelves).slice(0, 3)
      },
      files: {
        partsFile: PARTS_FILE,
        transactionsFile: TRANSACTIONS_FILE,
        shelvesFile: SHELVES_FILE
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Database debug failed', 
      details: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database service (MongoDB or JSON fallback)
    await dbService.initialize();
    
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? `https://wki-tool-room-system-1.onrender.com` 
      : `http://localhost:${PORT}`;

    app.listen(PORT, () => {
      console.log(`WKI Tool Room API Server running on port ${PORT}`);
      console.log(`Health check: ${baseUrl}/api/health`);
      console.log(`API endpoints available at: ${baseUrl}/api/`);
      
      if (dbService.useMongoDb) {
        console.log('📊 Connected to MongoDB - Data will persist through deployments');
      } else {
        console.log('⚠️  Using JSON files - Data will be lost on redeployment');
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer().catch(console.error);

module.exports = app;