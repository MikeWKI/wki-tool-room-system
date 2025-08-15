import React, { memo, useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Clock, TrendingUp, Activity } from 'lucide-react';

const PerformanceMonitor = memo(() => {
  const [metrics, setMetrics] = useState({
    apiResponseTime: 0,
    renderTime: 0,
    memoryUsage: 0,
    cacheHitRate: 0,
    errorRate: 0,
  });
  
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Only show in development
    if (process.env.NODE_ENV === 'development') {
      setIsVisible(true);
      startMonitoring();
    }
  }, []);

  const startMonitoring = () => {
    // Monitor API response times
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const start = performance.now();
      try {
        const response = await originalFetch(...args);
        const end = performance.now();
        updateApiResponseTime(end - start);
        return response;
      } catch (error) {
        updateErrorRate();
        throw error;
      }
    };

    // Monitor render performance
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'measure') {
          updateRenderTime(entry.duration);
        }
      }
    });
    observer.observe({ entryTypes: ['measure'] });

    // Monitor memory usage
    const memoryInterval = setInterval(() => {
      if ('memory' in performance) {
        const memory = performance.memory;
        const usage = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
        updateMemoryUsage(usage);
      }
    }, 5000);

    return () => {
      clearInterval(memoryInterval);
      observer.disconnect();
    };
  };

  const updateApiResponseTime = (time) => {
    setMetrics(prev => ({
      ...prev,
      apiResponseTime: Math.round((prev.apiResponseTime + time) / 2),
    }));
  };

  const updateRenderTime = (time) => {
    setMetrics(prev => ({
      ...prev,
      renderTime: Math.round((prev.renderTime + time) / 2),
    }));
  };

  const updateMemoryUsage = (usage) => {
    setMetrics(prev => ({
      ...prev,
      memoryUsage: Math.round(usage),
    }));
  };

  const updateErrorRate = () => {
    setMetrics(prev => ({
      ...prev,
      errorRate: prev.errorRate + 1,
    }));
  };

  const getStatusColor = (metric, value) => {
    const thresholds = {
      apiResponseTime: { good: 200, warning: 500 },
      renderTime: { good: 16, warning: 33 },
      memoryUsage: { good: 50, warning: 80 },
      errorRate: { good: 0, warning: 5 },
    };

    const threshold = thresholds[metric];
    if (!threshold) return 'text-gray-500';

    if (value <= threshold.good) return 'text-green-500';
    if (value <= threshold.warning) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getStatusIcon = (metric, value) => {
    const color = getStatusColor(metric, value);
    
    if (color === 'text-green-500') return <CheckCircle className="w-4 h-4" />;
    if (color === 'text-yellow-500') return <AlertTriangle className="w-4 h-4" />;
    return <AlertTriangle className="w-4 h-4" />;
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-4 rounded-lg text-xs font-mono z-50 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4" />
        <span className="font-semibold">Performance Monitor</span>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {getStatusIcon('apiResponseTime', metrics.apiResponseTime)}
            <span>API Response:</span>
          </div>
          <span className={getStatusColor('apiResponseTime', metrics.apiResponseTime)}>
            {metrics.apiResponseTime}ms
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {getStatusIcon('renderTime', metrics.renderTime)}
            <span>Render Time:</span>
          </div>
          <span className={getStatusColor('renderTime', metrics.renderTime)}>
            {metrics.renderTime}ms
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {getStatusIcon('memoryUsage', metrics.memoryUsage)}
            <span>Memory:</span>
          </div>
          <span className={getStatusColor('memoryUsage', metrics.memoryUsage)}>
            {metrics.memoryUsage}%
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {getStatusIcon('errorRate', metrics.errorRate)}
            <span>Errors:</span>
          </div>
          <span className={getStatusColor('errorRate', metrics.errorRate)}>
            {metrics.errorRate}
          </span>
        </div>
      </div>

      <button
        onClick={() => setIsVisible(false)}
        className="mt-3 text-gray-400 hover:text-white text-xs"
      >
        Hide Monitor
      </button>
    </div>
  );
});

PerformanceMonitor.displayName = 'PerformanceMonitor';

// Performance utilities
export const measurePerformance = (name, fn) => {
  return async (...args) => {
    const start = performance.now();
    performance.mark(`${name}-start`);
    
    try {
      const result = await fn(...args);
      const end = performance.now();
      performance.mark(`${name}-end`);
      performance.measure(name, `${name}-start`, `${name}-end`);
      
      console.log(`${name} took ${end - start} milliseconds`);
      return result;
    } catch (error) {
      console.error(`${name} failed:`, error);
      throw error;
    }
  };
};

export const debounce = (func, wait, immediate = false) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func(...args);
  };
};

export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

export const memoize = (fn) => {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
};

export default PerformanceMonitor;
