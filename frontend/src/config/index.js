// Environment Configuration
const config = {
  development: {
    api: {
      baseUrl: 'http://localhost:3001/api',
      timeout: 10000,
      retries: 3,
    },
    cache: {
      ttl: 5 * 60 * 1000, // 5 minutes
      maxSize: 100,
    },
    features: {
      performanceMonitor: true,
      debugMode: true,
      mockData: false,
    },
    ui: {
      debounceMs: 300,
      pageSize: 20,
      maxUploadSize: 5 * 1024 * 1024, // 5MB
    },
  },
  production: {
    api: {
      baseUrl: process.env.REACT_APP_API_URL || '/api',
      timeout: 30000,
      retries: 3,
    },
    cache: {
      ttl: 15 * 60 * 1000, // 15 minutes
      maxSize: 500,
    },
    features: {
      performanceMonitor: false,
      debugMode: false,
      mockData: false,
    },
    ui: {
      debounceMs: 300,
      pageSize: 50,
      maxUploadSize: 10 * 1024 * 1024, // 10MB
    },
  },
  test: {
    api: {
      baseUrl: 'http://localhost:3001/api',
      timeout: 5000,
      retries: 1,
    },
    cache: {
      ttl: 1000, // 1 second
      maxSize: 10,
    },
    features: {
      performanceMonitor: false,
      debugMode: true,
      mockData: true,
    },
    ui: {
      debounceMs: 100,
      pageSize: 10,
      maxUploadSize: 1024 * 1024, // 1MB
    },
  },
};

const env = process.env.NODE_ENV || 'development';
const currentConfig = config[env];

// Feature flags
export const isFeatureEnabled = (feature) => {
  return currentConfig.features[feature] || false;
};

// Configuration getters
export const getApiConfig = () => currentConfig.api;
export const getCacheConfig = () => currentConfig.cache;
export const getUIConfig = () => currentConfig.ui;

// Application constants
export const APP_CONFIG = {
  name: 'WKI Tool Room Inventory System',
  version: '1.2.0',
  description: 'Professional inventory management for WKI tool room operations',
  
  // Business rules
  business: {
    maxCheckoutDays: 30,
    lowStockThreshold: 2,
    maxPartNameLength: 100,
    maxPartNumberLength: 50,
    maxShelfNameLength: 100,
  },
  
  // UI Configuration
  ui: {
    theme: {
      primary: '#dc2626', // Kenworth Red
      secondary: '#374151',
      success: '#059669',
      warning: '#d97706',
      error: '#dc2626',
    },
    animations: {
      duration: 300,
      easing: 'ease-in-out',
    },
    breakpoints: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },
  },
  
  // Data validation rules
  validation: {
    partNumber: {
      pattern: /^[A-Z0-9-]+$/,
      minLength: 3,
      maxLength: 50,
    },
    shelf: {
      pattern: /^[A-Z0-9-]+$/,
      minLength: 2,
      maxLength: 20,
    },
    quantity: {
      min: 0,
      max: 9999,
    },
    cost: {
      min: 0,
      max: 99999.99,
      precision: 2,
    },
  },
  
  // File handling
  files: {
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxImageSize: currentConfig.ui.maxUploadSize,
    imageDimensions: {
      thumbnail: { width: 150, height: 150 },
      medium: { width: 400, height: 300 },
      large: { width: 800, height: 600 },
    },
  },
  
  // Search configuration
  search: {
    minQueryLength: 1,
    maxResults: 100,
    highlightClass: 'bg-yellow-200 text-gray-900 px-1 rounded',
    debounceMs: currentConfig.ui.debounceMs,
  },
  
  // Cache configuration
  cache: currentConfig.cache,
  
  // API configuration
  api: currentConfig.api,
};

// Runtime environment checks
export const isDevelopment = () => env === 'development';
export const isProduction = () => env === 'production';
export const isTest = () => env === 'test';

// Debug utilities
export const debug = {
  log: (...args) => {
    if (isDevelopment() || isFeatureEnabled('debugMode')) {
      console.log('[DEBUG]', ...args);
    }
  },
  warn: (...args) => {
    if (isDevelopment() || isFeatureEnabled('debugMode')) {
      console.warn('[DEBUG]', ...args);
    }
  },
  error: (...args) => {
    if (isDevelopment() || isFeatureEnabled('debugMode')) {
      console.error('[DEBUG]', ...args);
    }
  },
  time: (label) => {
    if (isDevelopment() || isFeatureEnabled('debugMode')) {
      console.time(`[DEBUG] ${label}`);
    }
  },
  timeEnd: (label) => {
    if (isDevelopment() || isFeatureEnabled('debugMode')) {
      console.timeEnd(`[DEBUG] ${label}`);
    }
  },
};

// Performance monitoring configuration
export const PERFORMANCE_CONFIG = {
  enabled: isFeatureEnabled('performanceMonitor'),
  metrics: {
    apiResponseTime: { good: 200, warning: 500, critical: 1000 },
    renderTime: { good: 16, warning: 33, critical: 100 },
    memoryUsage: { good: 50, warning: 80, critical: 95 },
    cacheHitRate: { good: 80, warning: 60, critical: 40 },
  },
  sampling: {
    apiCalls: 1.0, // Log all API calls
    renders: 0.1, // Log 10% of renders
    errors: 1.0, // Log all errors
  },
};

// Error tracking configuration
export const ERROR_CONFIG = {
  logLevel: isDevelopment() ? 'debug' : 'error',
  enableStackTrace: isDevelopment(),
  enableUserContext: true,
  enablePerformanceContext: isFeatureEnabled('performanceMonitor'),
  enableBreadcrumbs: true,
  maxBreadcrumbs: 50,
};

export default currentConfig;
