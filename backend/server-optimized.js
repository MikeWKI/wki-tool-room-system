const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
require('dotenv').config();

// Import our enhanced middleware and services
const DatabaseService = require('./services/DatabaseService');
const { 
  AppError, 
  ValidationError, 
  NotFoundError, 
  ConflictError,
  errorHandler, 
  asyncHandler, 
  notFoundHandler, 
  timeoutHandler,
  rateLimitHandler,
  getErrorStats
} = require('./middleware/errorHandler');
const { 
  partSchema, 
  shelfSchema, 
  checkoutSchema,
  validate,
  validatePartExists,
  validateShelfExists,
  validatePartAvailable,
  validatePartCheckedOut,
  validateBusinessRules
} = require('./middleware/validation');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database service
const db = new DatabaseService();

// Enhanced rate limiting with different tiers
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message, code: 'RATE_LIMIT_EXCEEDED' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Different rate limits for different endpoints
const generalLimiter = createRateLimit(15 * 60 * 1000, 1000, 'Too many requests'); // 15 min, 1000 requests
const authLimiter = createRateLimit(15 * 60 * 1000, 50, 'Too many authentication attempts'); // 15 min, 50 requests
const strictLimiter = createRateLimit(15 * 60 * 1000, 100, 'Too many requests to this endpoint'); // 15 min, 100 requests

// Enhanced security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// Compression middleware
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
}));

// Request timeout
app.use(timeoutHandler(30000));

// Rate limiting
app.use('/api/auth', authLimiter);
app.use('/api/parts/:id/checkout', strictLimiter);
app.use('/api/parts/:id/checkin', strictLimiter);
app.use('/api', generalLimiter);

// CORS with enhanced options
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.CORS_ORIGIN || 'https://wki-tool-room-system.onrender.com',
      // Only include localhost in development
      ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:3001'] : [])
    ].filter(Boolean);
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body parsing with size limits
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Health check endpoint
app.get('/api/health', asyncHandler(async (req, res) => {
  const dbHealth = await db.healthCheck();
  const errorStats = await getErrorStats();
  
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.2.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    database: dbHealth,
    errors: errorStats,
  };
  
  const statusCode = dbHealth.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
}));

// Enhanced Parts API with validation and error handling

// Get all parts with pagination and filtering
app.get('/api/parts', asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 50, 
    category, 
    status, 
    shelf,
    lowStock,
    search 
  } = req.query;
  
  let parts = await db.getParts();
  
  // Apply filters
  if (category) {
    parts = parts.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }
  
  if (status) {
    parts = parts.filter(p => p.status === status);
  }
  
  if (shelf) {
    parts = parts.filter(p => p.shelf === shelf);
  }
  
  if (lowStock === 'true') {
    parts = parts.filter(p => p.quantity === 0);
  }
  
  if (search) {
    parts = await db.searchParts(search);
  }
  
  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + parseInt(limit);
  const paginatedParts = parts.slice(startIndex, endIndex);
  
  res.json({
    data: paginatedParts,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(parts.length / limit),
      totalItems: parts.length,
      itemsPerPage: parseInt(limit),
      hasNextPage: endIndex < parts.length,
      hasPrevPage: page > 1,
    },
    filters: { category, status, shelf, lowStock, search },
  });
}));

// Get specific part by ID
app.get('/api/parts/:id', asyncHandler(async (req, res) => {
  const parts = await db.getParts();
  const part = await validatePartExists(req.params.id, parts);
  res.json(part);
}));

// Advanced search with scoring
app.get('/api/parts/search/:query', asyncHandler(async (req, res) => {
  const { query } = req.params;
  const { fields, limit = 50, offset = 0 } = req.query;
  
  const searchFields = fields ? fields.split(',') : ['partNumber', 'description', 'category'];
  const results = await db.searchParts(query, searchFields);
  
  const paginatedResults = results.slice(offset, offset + parseInt(limit));
  
  res.json({
    data: paginatedResults,
    total: results.length,
    query,
    fields: searchFields,
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
}));

// Create new part with enhanced validation
app.post('/api/parts', validate(partSchema), asyncHandler(async (req, res) => {
  await db.transaction(async (database) => {
    const parts = await database.getParts();
    const shelves = await database.getShelves();
    
    // Business rule validations
    validateBusinessRules.checkDuplicatePartNumber(parts, req.body.partNumber);
    await validateShelfExists(req.body.shelf, shelves);
    validateBusinessRules.checkShelfCapacity(shelves, req.body.shelf, parts, req.body.quantity);
    
    // Generate new ID
    const newId = parts.length > 0 ? Math.max(...parts.map(p => p.id)) + 1 : 1;
    
    const newPart = {
      ...req.body,
      id: newId,
      status: 'available',
      checkedOutBy: null,
      checkedOutDate: null,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    
    // Check for low stock warning
    const stockCheck = validateBusinessRules.validateMinQuantity(newPart.quantity, newPart.minQuantity);
    
    parts.push(newPart);
    await database.saveParts(parts);
    
    // Log transaction
    const transactions = await database.getTransactions();
    transactions.push({
      id: transactions.length + 1,
      type: 'part_created',
      partId: newId,
      partNumber: newPart.partNumber,
      description: newPart.description,
      quantity: newPart.quantity,
      timestamp: new Date().toISOString(),
      metadata: { stockCheck }
    });
    await database.saveTransactions(transactions);
    
    res.status(201).json({
      ...newPart,
      warnings: stockCheck.isNoStock ? [stockCheck.warning] : []
    });
  });
}));

// Update part with validation
app.put('/api/parts/:id', validate(partSchema), asyncHandler(async (req, res) => {
  await db.transaction(async (database) => {
    const parts = await database.getParts();
    const shelves = await database.getShelves();
    
    const existingPart = await validatePartExists(req.params.id, parts);
    
    // Business rule validations
    if (req.body.partNumber !== existingPart.partNumber) {
      validateBusinessRules.checkDuplicatePartNumber(parts, req.body.partNumber, existingPart.id);
    }
    
    if (req.body.shelf !== existingPart.shelf) {
      await validateShelfExists(req.body.shelf, shelves);
      const quantityDiff = req.body.quantity - existingPart.quantity;
      validateBusinessRules.checkShelfCapacity(shelves, req.body.shelf, parts, quantityDiff);
    }
    
    // Update part
    const updatedPart = {
      ...existingPart,
      ...req.body,
      lastUpdated: new Date().toISOString(),
    };
    
    const stockCheck = validateBusinessRules.validateMinQuantity(updatedPart.quantity, updatedPart.minQuantity);
    
    const index = parts.findIndex(p => p.id === parseInt(req.params.id));
    parts[index] = updatedPart;
    await database.saveParts(parts);
    
    // Log transaction
    const transactions = await database.getTransactions();
    transactions.push({
      id: transactions.length + 1,
      type: 'part_updated',
      partId: updatedPart.id,
      partNumber: updatedPart.partNumber,
      description: updatedPart.description,
      changes: Object.keys(req.body),
      timestamp: new Date().toISOString(),
      metadata: { stockCheck, previousQuantity: existingPart.quantity }
    });
    await database.saveTransactions(transactions);
    
    res.json({
      ...updatedPart,
      warnings: stockCheck.isNoStock ? [stockCheck.warning] : []
    });
  });
}));

// Delete part
app.delete('/api/parts/:id', asyncHandler(async (req, res) => {
  await db.transaction(async (database) => {
    const parts = await database.getParts();
    const part = await validatePartExists(req.params.id, parts);
    
    if (part.status === 'checked_out') {
      throw new ConflictError('Cannot delete a checked out part');
    }
    
    const updatedParts = parts.filter(p => p.id !== parseInt(req.params.id));
    await database.saveParts(updatedParts);
    
    // Log transaction
    const transactions = await database.getTransactions();
    transactions.push({
      id: transactions.length + 1,
      type: 'part_deleted',
      partId: part.id,
      partNumber: part.partNumber,
      description: part.description,
      timestamp: new Date().toISOString(),
    });
    await database.saveTransactions(transactions);
    
    res.json({ message: 'Part deleted successfully', deletedPart: part });
  });
}));

// Enhanced checkout with validation
app.post('/api/parts/:id/checkout', validate(checkoutSchema), asyncHandler(async (req, res) => {
  await db.transaction(async (database) => {
    const parts = await database.getParts();
    const part = await validatePartExists(req.params.id, parts);
    
    validatePartAvailable(part);
    
    // Update part
    const updatedPart = {
      ...part,
      status: 'checked_out',
      checkedOutBy: req.body.userId,
      checkedOutDate: new Date().toISOString(),
      quantity: part.quantity - 1,
      lastUpdated: new Date().toISOString(),
    };
    
    const stockCheck = validateBusinessRules.validateMinQuantity(updatedPart.quantity, updatedPart.minQuantity);
    
    const index = parts.findIndex(p => p.id === parseInt(req.params.id));
    parts[index] = updatedPart;
    await database.saveParts(parts);
    
    // Log transaction
    const transactions = await database.getTransactions();
    transactions.push({
      id: transactions.length + 1,
      type: 'checkout',
      partId: part.id,
      partNumber: part.partNumber,
      description: part.description,
      userId: req.body.userId,
      notes: req.body.notes,
      expectedReturnDate: req.body.expectedReturnDate,
      timestamp: new Date().toISOString(),
      metadata: { stockCheck, remainingQuantity: updatedPart.quantity }
    });
    await database.saveTransactions(transactions);
    
    res.json({
      ...updatedPart,
      warnings: stockCheck.isNoStock ? [stockCheck.warning] : []
    });
  });
}));

// Enhanced checkin
app.post('/api/parts/:id/checkin', asyncHandler(async (req, res) => {
  await db.transaction(async (database) => {
    const parts = await database.getParts();
    const part = await validatePartExists(req.params.id, parts);
    
    validatePartCheckedOut(part);
    
    // Update part
    const updatedPart = {
      ...part,
      status: 'available',
      checkedOutBy: null,
      checkedOutDate: null,
      quantity: part.quantity + 1,
      lastUpdated: new Date().toISOString(),
    };
    
    const index = parts.findIndex(p => p.id === parseInt(req.params.id));
    parts[index] = updatedPart;
    await database.saveParts(parts);
    
    // Log transaction
    const transactions = await database.getTransactions();
    transactions.push({
      id: transactions.length + 1,
      type: 'checkin',
      partId: part.id,
      partNumber: part.partNumber,
      description: part.description,
      returnedBy: part.checkedOutBy,
      timestamp: new Date().toISOString(),
      metadata: { newQuantity: updatedPart.quantity }
    });
    await database.saveTransactions(transactions);
    
    res.json(updatedPart);
  });
}));

// Get transactions with filtering
app.get('/api/transactions', asyncHandler(async (req, res) => {
  const { 
    type, 
    partId, 
    userId, 
    startDate, 
    endDate, 
    page = 1, 
    limit = 50 
  } = req.query;
  
  let transactions = await db.getTransactions();
  
  // Apply filters
  if (type) {
    transactions = transactions.filter(t => t.type === type);
  }
  
  if (partId) {
    transactions = transactions.filter(t => t.partId === parseInt(partId));
  }
  
  if (userId) {
    transactions = transactions.filter(t => t.userId === userId || t.returnedBy === userId);
  }
  
  if (startDate) {
    transactions = transactions.filter(t => new Date(t.timestamp) >= new Date(startDate));
  }
  
  if (endDate) {
    transactions = transactions.filter(t => new Date(t.timestamp) <= new Date(endDate));
  }
  
  // Sort by timestamp (newest first)
  transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + parseInt(limit);
  const paginatedTransactions = transactions.slice(startIndex, endIndex);
  
  res.json({
    data: paginatedTransactions,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(transactions.length / limit),
      totalItems: transactions.length,
      itemsPerPage: parseInt(limit),
    },
    filters: { type, partId, userId, startDate, endDate },
  });
}));

// Enhanced shelf management with validation
app.get('/api/shelves', asyncHandler(async (req, res) => {
  const shelves = await db.getShelves();
  const parts = await db.getParts();
  
  // Add current counts to shelves
  const shelvesWithCounts = Object.entries(shelves).map(([id, shelf]) => {
    const currentCount = parts
      .filter(part => part.shelf === id)
      .reduce((sum, part) => sum + part.quantity, 0);
    
    return {
      id,
      ...shelf,
      currentCount,
      utilizationRate: shelf.capacity ? Math.round((currentCount / shelf.capacity) * 100) : null,
    };
  });
  
  res.json(shelvesWithCounts);
}));

app.post('/api/shelves', validate(shelfSchema), asyncHandler(async (req, res) => {
  await db.transaction(async (database) => {
    const shelves = await database.getShelves();
    
    if (shelves[req.body.id]) {
      throw new ConflictError('Shelf ID already exists');
    }
    
    shelves[req.body.id] = {
      ...req.body,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    delete shelves[req.body.id].id; // Remove id from the object since it's the key
    
    await database.saveShelves(shelves);
    
    res.status(201).json({ id: req.body.id, ...shelves[req.body.id] });
  });
}));

// Enhanced dashboard stats
app.get('/api/dashboard/stats', asyncHandler(async (req, res) => {
  const stats = await db.getStats();
  const parts = await db.getParts();
  
  // Additional analytics
  const categoryStats = parts.reduce((acc, part) => {
    acc[part.category] = (acc[part.category] || 0) + 1;
    return acc;
  }, {});
  
  const shelfUtilization = await db.getShelves();
  const shelves = await db.getShelves();
  
  const utilizationStats = Object.entries(shelves).map(([id, shelf]) => {
    const currentCount = parts
      .filter(part => part.shelf === id)
      .reduce((sum, part) => sum + part.quantity, 0);
    
    return {
      shelfId: id,
      name: shelf.name,
      currentCount,
      capacity: shelf.capacity || 0,
      utilizationRate: shelf.capacity ? Math.round((currentCount / shelf.capacity) * 100) : 0,
    };
  });
  
  res.json({
    ...stats,
    analytics: {
      categoryDistribution: categoryStats,
      shelfUtilization: utilizationStats,
      topCategories: Object.entries(categoryStats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([category, count]) => ({ category, count })),
    },
  });
}));

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  const baseUrl = process.env.NODE_ENV === 'production' 
    ? `https://wki-tool-room-system-1.onrender.com` 
    : `http://localhost:${PORT}`;

  console.log(`
🚀 WKI Tool Room Inventory API Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Environment: ${process.env.NODE_ENV || 'development'}
🌐 Server: ${baseUrl}
🏥 Health: ${baseUrl}/api/health
📚 API Base: ${baseUrl}/api
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});

module.exports = app;
