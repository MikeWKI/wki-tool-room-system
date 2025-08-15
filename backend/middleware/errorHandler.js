const fs = require('fs').promises;
const path = require('path');

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

// Error logger
class ErrorLogger {
  constructor() {
    this.logDir = path.join(__dirname, '../logs');
    this.ensureLogDir();
  }

  async ensureLogDir() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  async log(error, req = null, level = 'error') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.statusCode,
    };

    if (req) {
      logEntry.request = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      };
    }

    // Log to console
    console.error(`[${level.toUpperCase()}] ${error.message}`, {
      code: error.code,
      statusCode: error.statusCode,
    });

    // Log to file
    try {
      const logFile = path.join(this.logDir, `${level}-${new Date().toISOString().split('T')[0]}.json`);
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(logFile, logLine);
    } catch (fileError) {
      console.error('Failed to write to log file:', fileError);
    }

    // In production, you might want to send to external logging service
    if (process.env.NODE_ENV === 'production') {
      // Send to external logging service (e.g., Sentry, LogRocket, etc.)
      this.sendToExternalService(logEntry);
    }
  }

  sendToExternalService(logEntry) {
    // Placeholder for external logging service integration
    // e.g., Sentry.captureException(error);
  }
}

const errorLogger = new ErrorLogger();

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  // Log error
  errorLogger.log(err, req, err.statusCode >= 500 ? 'error' : 'warn');

  // Operational errors (trusted errors) - send to client
  if (err.isOperational) {
    const response = {
      error: err.message,
      code: err.code,
      timestamp: new Date().toISOString(),
    };

    // Add details for validation errors
    if (err instanceof ValidationError && err.details) {
      response.details = err.details;
    }

    return res.status(err.statusCode).json(response);
  }

  // Programming errors or unknown errors - don't leak to client
  console.error('UNKNOWN ERROR:', err);
  
  const response = {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
  };

  // In development, include stack trace
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
    response.originalMessage = err.message;
  }

  res.status(500).json(response);
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

// Request timeout middleware
const timeoutHandler = (timeout = 30000) => {
  return (req, res, next) => {
    res.setTimeout(timeout, () => {
      const error = new AppError('Request timeout', 408, 'TIMEOUT');
      next(error);
    });
    next();
  };
};

// Rate limit error handler
const rateLimitHandler = (req, res) => {
  const error = new AppError('Too many requests', 429, 'RATE_LIMIT_EXCEEDED');
  errorLogger.log(error, req, 'warn');
  
  res.status(429).json({
    error: error.message,
    code: error.code,
    retryAfter: Math.round(req.rateLimit.resetTime / 1000),
    timestamp: new Date().toISOString(),
  });
};

// Health check for error logging
const getErrorStats = async () => {
  try {
    const logDir = path.join(__dirname, '../logs');
    const files = await fs.readdir(logDir);
    const errorFiles = files.filter(f => f.startsWith('error-'));
    const warnFiles = files.filter(f => f.startsWith('warn-'));
    
    let errorCount = 0;
    let warnCount = 0;
    
    // Count errors from today's files
    const today = new Date().toISOString().split('T')[0];
    const todayErrorFile = `error-${today}.json`;
    const todayWarnFile = `warn-${today}.json`;
    
    if (files.includes(todayErrorFile)) {
      const content = await fs.readFile(path.join(logDir, todayErrorFile), 'utf8');
      errorCount = content.split('\n').filter(line => line.trim()).length;
    }
    
    if (files.includes(todayWarnFile)) {
      const content = await fs.readFile(path.join(logDir, todayWarnFile), 'utf8');
      warnCount = content.split('\n').filter(line => line.trim()).length;
    }
    
    return {
      errorsToday: errorCount,
      warningsToday: warnCount,
      totalErrorFiles: errorFiles.length,
      totalWarnFiles: warnFiles.length,
    };
  } catch (error) {
    console.error('Failed to get error stats:', error);
    return {
      errorsToday: -1,
      warningsToday: -1,
      error: 'Failed to read error logs',
    };
  }
};

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  timeoutHandler,
  rateLimitHandler,
  errorLogger,
  getErrorStats,
};
