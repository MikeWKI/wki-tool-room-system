const joi = require('joi');

// Part validation schema
const partSchema = joi.object({
  partNumber: joi.string().required().min(3).max(50).pattern(/^[A-Z0-9-]+$/),
  description: joi.string().required().min(3).max(200),
  shelf: joi.string().required().min(2).max(20),
  category: joi.string().required().min(3).max(50),
  quantity: joi.number().integer().min(0).max(9999).required(),
  minQuantity: joi.number().integer().min(0).max(999).required(),
  status: joi.string().valid('available', 'checked_out').default('available'),
  checkedOutBy: joi.string().allow(null).default(null),
  checkedOutDate: joi.date().allow(null).default(null),
  lastUpdated: joi.date().default(() => new Date()),
  cost: joi.number().precision(2).min(0).max(99999.99).optional(),
  supplier: joi.string().max(100).optional(),
  notes: joi.string().max(500).optional(),
});

// Shelf validation schema
const shelfSchema = joi.object({
  id: joi.string().required().min(2).max(20).pattern(/^[A-Z0-9-]+$/),
  name: joi.string().required().min(5).max(100),
  description: joi.string().max(500).optional(),
  imageUrl: joi.string().uri().allow(null).optional(),
  location: joi.string().max(100).optional(),
  capacity: joi.number().integer().min(1).max(9999).optional(),
  currentCount: joi.number().integer().min(0).optional(),
});

// User checkout validation schema
const checkoutSchema = joi.object({
  userId: joi.string().required().min(2).max(50),
  notes: joi.string().max(200).optional(),
  expectedReturnDate: joi.date().greater('now').optional(),
});

// Search validation schema
const searchSchema = joi.object({
  query: joi.string().required().min(1).max(100),
  fields: joi.array().items(joi.string().valid('partNumber', 'description', 'category', 'shelf')).optional(),
  limit: joi.number().integer().min(1).max(100).default(50),
  offset: joi.number().integer().min(0).default(0),
});

// Validation middleware
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }

    req[property] = value;
    next();
  };
};

// Custom validation functions
const validatePartExists = async (partId, parts) => {
  const part = parts.find(p => p.id === parseInt(partId));
  if (!part) {
    throw new Error('Part not found');
  }
  return part;
};

const validateShelfExists = async (shelfId, shelves) => {
  if (!shelves[shelfId]) {
    throw new Error('Shelf not found');
  }
  return shelves[shelfId];
};

const validatePartAvailable = (part) => {
  if (part.status !== 'available') {
    throw new Error('Part is not available for checkout');
  }
  if (part.quantity <= 0) {
    throw new Error('Part is out of stock');
  }
};

const validatePartCheckedOut = (part) => {
  if (part.status !== 'checked_out') {
    throw new Error('Part is not checked out');
  }
};

// Business logic validation
const validateBusinessRules = {
  checkDuplicatePartNumber: (parts, partNumber, excludeId = null) => {
    const existing = parts.find(p => 
      p.partNumber.toLowerCase() === partNumber.toLowerCase() && 
      p.id !== excludeId
    );
    if (existing) {
      throw new Error('Part number already exists');
    }
  },

  checkShelfCapacity: (shelves, shelfId, currentParts, newQuantity = 0) => {
    const shelf = shelves[shelfId];
    if (shelf && shelf.capacity) {
      const currentShelfCount = currentParts
        .filter(p => p.shelf === shelfId)
        .reduce((sum, p) => sum + p.quantity, 0);
      
      if (currentShelfCount + newQuantity > shelf.capacity) {
        throw new Error(`Shelf capacity exceeded. Available space: ${shelf.capacity - currentShelfCount}`);
      }
    }
  },

  validateMinQuantity: (quantity, minQuantity) => {
    if (quantity < minQuantity) {
      return {
        warning: `Quantity (${quantity}) is below minimum threshold (${minQuantity})`,
        isLowStock: true,
      };
    }
    return { isLowStock: false };
  },
};

module.exports = {
  partSchema,
  shelfSchema,
  checkoutSchema,
  searchSchema,
  validate,
  validatePartExists,
  validateShelfExists,
  validatePartAvailable,
  validatePartCheckedOut,
  validateBusinessRules,
};
