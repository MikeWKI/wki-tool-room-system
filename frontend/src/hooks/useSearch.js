import { useState, useEffect, useMemo, useCallback } from 'react';

export const useSearch = (items, searchFields, initialSearchTerm = '', debounceMs = 300) => {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(initialSearchTerm);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [searchTerm, debounceMs]);

  // Advanced search with scoring
  const filteredItems = useMemo(() => {
    if (!debouncedSearchTerm.trim()) {
      return items;
    }

    const searchWords = debouncedSearchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    
    const scoredItems = items.map(item => {
      let score = 0;
      let matchedFields = [];

      searchFields.forEach(field => {
        const fieldValue = getNestedValue(item, field)?.toString().toLowerCase() || '';
        
        searchWords.forEach(word => {
          if (fieldValue.includes(word)) {
            // Exact match bonus
            if (fieldValue === word) {
              score += 100;
            }
            // Starts with bonus
            else if (fieldValue.startsWith(word)) {
              score += 50;
            }
            // Contains bonus
            else {
              score += 10;
            }
            
            if (!matchedFields.includes(field)) {
              matchedFields.push(field);
            }
          }
        });
      });

      return { item, score, matchedFields };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);

    return scoredItems;
  }, [items, debouncedSearchTerm, searchFields]);

  // Highlight matches
  const highlightMatches = useCallback((text, className = 'bg-yellow-200 text-gray-900 px-1 rounded') => {
    if (!debouncedSearchTerm.trim() || !text) return text;

    const searchWords = debouncedSearchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    let highlightedText = text;

    searchWords.forEach(word => {
      const regex = new RegExp(`(${word})`, 'gi');
      highlightedText = highlightedText.replace(regex, `<span class="${className}">$1</span>`);
    });

    return highlightedText;
  }, [debouncedSearchTerm]);

  // Search suggestions
  const searchSuggestions = useMemo(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) return [];

    const suggestions = new Set();
    const searchLower = searchTerm.toLowerCase();

    items.forEach(item => {
      searchFields.forEach(field => {
        const value = getNestedValue(item, field)?.toString();
        if (value && value.toLowerCase().includes(searchLower)) {
          // Add word that contains the search term
          const words = value.split(/\s+/);
          words.forEach(word => {
            if (word.toLowerCase().includes(searchLower) && word.length > searchTerm.length) {
              suggestions.add(word);
            }
          });
        }
      });
    });

    return Array.from(suggestions).slice(0, 5);
  }, [items, searchTerm, searchFields]);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
  }, []);

  return {
    searchTerm,
    setSearchTerm,
    debouncedSearchTerm,
    filteredItems,
    highlightMatches,
    searchSuggestions,
    clearSearch,
    hasResults: filteredItems.length > 0,
    isSearching: searchTerm !== debouncedSearchTerm,
  };
};

// Utility function to get nested object values
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Enhanced search hook with filters
export const useAdvancedSearch = (items, config = {}) => {
  const {
    searchFields = [],
    filterFields = {},
    sortOptions = {},
    debounceMs = 300
  } = config;

  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({});
  const [sortBy, setSortBy] = useState(sortOptions.default || '');
  const [sortDirection, setSortDirection] = useState('asc');

  const { filteredItems: searchResults, ...searchProps } = useSearch(
    items, 
    searchFields, 
    searchTerm, 
    debounceMs
  );

  // Apply filters
  const filteredResults = useMemo(() => {
    let results = searchResults;

    Object.entries(filters).forEach(([field, value]) => {
      if (value && value !== 'all') {
        results = results.filter(item => {
          const itemValue = getNestedValue(item, field);
          if (Array.isArray(value)) {
            return value.includes(itemValue);
          }
          return itemValue === value;
        });
      }
    });

    return results;
  }, [searchResults, filters]);

  // Apply sorting
  const sortedResults = useMemo(() => {
    if (!sortBy) return filteredResults;

    return [...filteredResults].sort((a, b) => {
      const aValue = getNestedValue(a, sortBy);
      const bValue = getNestedValue(b, sortBy);

      let comparison = 0;
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else if (aValue instanceof Date && bValue instanceof Date) {
        comparison = aValue.getTime() - bValue.getTime();
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sortDirection === 'desc' ? -comparison : comparison;
    });
  }, [filteredResults, sortBy, sortDirection]);

  const updateFilter = useCallback((field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  }, []);

  const clearFilter = useCallback((field) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[field];
      return newFilters;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({});
  }, []);

  const toggleSort = useCallback((field) => {
    if (sortBy === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  }, [sortBy]);

  // Get unique values for filter options
  const getFilterOptions = useCallback((field) => {
    const values = new Set();
    items.forEach(item => {
      const value = getNestedValue(item, field);
      if (value !== null && value !== undefined) {
        values.add(value);
      }
    });
    return Array.from(values).sort();
  }, [items]);

  return {
    ...searchProps,
    searchTerm,
    setSearchTerm,
    results: sortedResults,
    filters,
    updateFilter,
    clearFilter,
    clearAllFilters,
    sortBy,
    sortDirection,
    toggleSort,
    getFilterOptions,
    resultCount: sortedResults.length,
    totalCount: items.length,
  };
};
