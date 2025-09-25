import { useState, useCallback, useRef } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 
  (process.env.NODE_ENV === 'production' 
    ? 'https://wki-tool-room-system-1.onrender.com/api'
    : 'http://localhost:3001/api');

// Cache implementation
class ApiCache {
  constructor(ttl = 5 * 60 * 1000) { // 5 minutes default TTL
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  clear(pattern) {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  has(key) {
    const item = this.cache.get(key);
    return item && (Date.now() - item.timestamp <= this.ttl);
  }
}

const apiCache = new ApiCache();

export const useApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const apiCall = useCallback(async (endpoint, options = {}) => {
    const { 
      method = 'GET', 
      cache = true, 
      invalidateCache = false,
      ...fetchOptions 
    } = options;

    // Generate cache key
    const cacheKey = `${method}:${endpoint}:${JSON.stringify(fetchOptions.body || {})}`;

    // Check cache for GET requests
    if (method === 'GET' && cache && !invalidateCache) {
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) {
        return cachedData;
      }
    }

    // Cancel previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
        },
        signal: abortControllerRef.current.signal,
        ...fetchOptions,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Cache successful GET requests
      if (method === 'GET' && cache) {
        apiCache.set(cacheKey, data);
      }

      // Invalidate cache for mutations
      if (['POST', 'PUT', 'DELETE'].includes(method)) {
        const cachePattern = endpoint.split('/')[1]; // e.g., 'parts', 'shelves'
        apiCache.clear(cachePattern);
      }

      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Request aborted');
        return null;
      }
      
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, []);

  // Optimized API methods with proper error handling and caching
  const fetchParts = useCallback(async (invalidateCache = false) => {
    return apiCall('/parts', { cache: true, invalidateCache });
  }, [apiCall]);

  const fetchPart = useCallback(async (id) => {
    return apiCall(`/parts/${id}`, { cache: true });
  }, [apiCall]);

  const searchParts = useCallback(async (query) => {
    return apiCall(`/parts/search/${encodeURIComponent(query)}`, { cache: false });
  }, [apiCall]);

  const createPart = useCallback(async (partData) => {
    return apiCall('/parts', {
      method: 'POST',
      body: JSON.stringify(partData),
    });
  }, [apiCall]);

  const updatePart = useCallback(async (id, partData) => {
    return apiCall(`/parts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(partData),
    });
  }, [apiCall]);

  const deletePart = useCallback(async (id) => {
    return apiCall(`/parts/${id}`, {
      method: 'DELETE',
    });
  }, [apiCall]);

  const checkoutPart = useCallback(async (id, userData) => {
    return apiCall(`/parts/${id}/checkout`, {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }, [apiCall]);

  const checkinPart = useCallback(async (id) => {
    return apiCall(`/parts/${id}/checkin`, {
      method: 'POST',
    });
  }, [apiCall]);

  const fetchShelves = useCallback(async (invalidateCache = false) => {
    return apiCall('/shelves', { cache: true, invalidateCache });
  }, [apiCall]);

  const createShelf = useCallback(async (shelfData) => {
    return apiCall('/shelves', {
      method: 'POST',
      body: JSON.stringify(shelfData),
    });
  }, [apiCall]);

  const updateShelf = useCallback(async (id, shelfData) => {
    return apiCall(`/shelves/${id}`, {
      method: 'PUT',
      body: JSON.stringify(shelfData),
    });
  }, [apiCall]);

  const deleteShelf = useCallback(async (id) => {
    return apiCall(`/shelves/${id}`, {
      method: 'DELETE',
    });
  }, [apiCall]);

  const fetchTransactions = useCallback(async (invalidateCache = false) => {
    return apiCall('/transactions', { cache: true, invalidateCache });
  }, [apiCall]);

  const fetchDashboardStats = useCallback(async (invalidateCache = false) => {
    return apiCall('/dashboard/stats', { cache: true, invalidateCache });
  }, [apiCall]);

  // Batch operations for better performance
  const batchCheckout = useCallback(async (operations) => {
    const results = await Promise.allSettled(
      operations.map(({ partId, userData }) => checkoutPart(partId, userData))
    );
    return results;
  }, [checkoutPart]);

  const batchCheckin = useCallback(async (partIds) => {
    const results = await Promise.allSettled(
      partIds.map(id => checkinPart(id))
    );
    return results;
  }, [checkinPart]);

  // Health check
  const healthCheck = useCallback(async () => {
    return apiCall('/health', { cache: false });
  }, [apiCall]);

  // Clear cache manually
  const clearCache = useCallback((pattern) => {
    apiCache.clear(pattern);
  }, []);

  return {
    loading,
    error,
    apiCall,
    fetchParts,
    fetchPart,
    searchParts,
    createPart,
    updatePart,
    deletePart,
    checkoutPart,
    checkinPart,
    fetchShelves,
    createShelf,
    updateShelf,
    deleteShelf,
    fetchTransactions,
    fetchDashboardStats,
    batchCheckout,
    batchCheckin,
    healthCheck,
    clearCache,
  };
};
