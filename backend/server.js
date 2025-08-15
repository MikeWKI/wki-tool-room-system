const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const path = require('path');
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
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Database file paths (using JSON files for simplicity - can be replaced with real database)
const DB_DIR = path.join(__dirname, 'database');
const PARTS_FILE = path.join(DB_DIR, 'parts.json');
const TRANSACTIONS_FILE = path.join(DB_DIR, 'transactions.json');
const SHELVES_FILE = path.join(DB_DIR, 'shelves.json');

// Initialize database directory and files
async function initializeDatabase() {
  try {
    await fs.mkdir(DB_DIR, { recursive: true });
    
    // Initialize parts data
    const initialParts = [
      { id: 1, partNumber: 'T800-001', description: 'Engine Oil Filter', shelf: 'A-01', category: 'Engine Parts', status: 'available', checkedOutBy: null, checkedOutDate: null, quantity: 5, minQuantity: 2 },
      { id: 2, partNumber: 'T800-002', description: 'Air Brake Valve', shelf: 'B-03', category: 'Brake System', status: 'available', checkedOutBy: null, checkedOutDate: null, quantity: 2, minQuantity: 1 },
      { id: 3, partNumber: 'T800-003', description: 'Transmission Seal Kit', shelf: 'C-05', category: 'Transmission', status: 'available', checkedOutBy: null, checkedOutDate: null, quantity: 3, minQuantity: 1 },
      { id: 4, partNumber: 'W900-001', description: 'Headlight Assembly', shelf: 'D-02', category: 'Electrical', status: 'available', checkedOutBy: null, checkedOutDate: null, quantity: 4, minQuantity: 2 },
      { id: 5, partNumber: 'W900-002', description: 'Fuel Pump', shelf: 'A-08', category: 'Fuel System', status: 'available', checkedOutBy: null, checkedOutDate: null, quantity: 1, minQuantity: 1 },
      { id: 6, partNumber: 'T680-001', description: 'Radiator Hose', shelf: 'E-01', category: 'Cooling System', status: 'available', checkedOutBy: null, checkedOutDate: null, quantity: 6, minQuantity: 2 },
      { id: 7, partNumber: 'T680-002', description: 'Starter Motor', shelf: 'D-05', category: 'Electrical', status: 'available', checkedOutBy: null, checkedOutDate: null, quantity: 2, minQuantity: 1 },
      { id: 8, partNumber: 'T370-001', description: 'Power Steering Pump', shelf: 'B-07', category: 'Steering', status: 'available', checkedOutBy: null, checkedOutDate: null, quantity: 1, minQuantity: 1 },
      { id: 9, partNumber: 'K270-001', description: 'Wiper Blade Set', shelf: 'F-03', category: 'Body Parts', status: 'available', checkedOutBy: null, checkedOutDate: null, quantity: 8, minQuantity: 3 },
      { id: 10, partNumber: 'K270-002', description: 'Door Handle', shelf: 'F-08', category: 'Body Parts', status: 'available', checkedOutBy: null, checkedOutDate: null, quantity: 3, minQuantity: 1 },
    ];

    // Initialize shelves data
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

    // Check if files exist, if not create them
    try {
      await fs.access(PARTS_FILE);
    } catch {
      await fs.writeFile(PARTS_FILE, JSON.stringify(initialParts, null, 2));
    }

    try {
      await fs.access(TRANSACTIONS_FILE);
    } catch {
      await fs.writeFile(TRANSACTIONS_FILE, JSON.stringify([], null, 2));
    }

    try {
      await fs.access(SHELVES_FILE);
    } catch {
      await fs.writeFile(SHELVES_FILE, JSON.stringify(initialShelves, null, 2));
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }
}

// Database helper functions
async function readParts() {
  try {
    const data = await fs.readFile(PARTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading parts:', error);
    return [];
  }
}

async function writeParts(parts) {
  try {
    await fs.writeFile(PARTS_FILE, JSON.stringify(parts, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing parts:', error);
    return false;
  }
}

async function readTransactions() {
  try {
    const data = await fs.readFile(TRANSACTIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading transactions:', error);
    return [];
  }
}

async function writeTransactions(transactions) {
  try {
    await fs.writeFile(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing transactions:', error);
    return false;
  }
}

async function readShelves() {
  try {
    const data = await fs.readFile(SHELVES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading shelves:', error);
    return {};
  }
}

async function writeShelves(shelves) {
  try {
    await fs.writeFile(SHELVES_FILE, JSON.stringify(shelves, null, 2));
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
    
    // Prevent updating checkout status through this endpoint
    delete updates.status;
    delete updates.checkedOutBy;
    delete updates.checkedOutDate;
    
    parts[partIndex] = { ...parts[partIndex], ...updates };
    await writeParts(parts);
    
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

// Get dashboard stats
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const parts = await readParts();
    const transactions = await readTransactions();
    
    const stats = {
      totalParts: parts.length,
      availableParts: parts.filter(p => p.status === 'available').length,
      checkedOutParts: parts.filter(p => p.status === 'checked_out').length,
      lowStockParts: parts.filter(p => p.quantity <= p.minQuantity).length,
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
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
  await initializeDatabase();
  
  app.listen(PORT, () => {
    console.log(`WKI Tool Room API Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`API endpoints available at: http://localhost:${PORT}/api/`);
  });
}

startServer().catch(console.error);

module.exports = app;