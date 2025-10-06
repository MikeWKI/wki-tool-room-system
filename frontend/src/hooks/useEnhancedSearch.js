import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

export const useEnhancedSearch = (items, searchFields, initialSearchTerm = '', debounceMs = 300) => {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(initialSearchTerm);
  const [searchHistory, setSearchHistory] = useState([]);
  const [isVoiceSearchActive, setIsVoiceSearchActive] = useState(false);
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [usagePatterns, setUsagePatterns] = useState({});
  
  const recognitionRef = useRef(null);
  const searchInputRef = useRef(null);

  // Initialize voice recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      setIsVoiceSupported(true);
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      const recognition = recognitionRef.current;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        setIsVoiceSearchActive(true);
      };
      
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        handleVoiceSearchResult(transcript);
      };
      
      recognition.onerror = (event) => {
        console.error('Voice recognition error:', event.error);
        setIsVoiceSearchActive(false);
      };
      
      recognition.onend = () => {
        setIsVoiceSearchActive(false);
      };
    }
  }, []);

  // Load search history and usage patterns from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('wki-search-history');
    if (savedHistory) {
      try {
        setSearchHistory(JSON.parse(savedHistory));
      } catch (error) {
        console.error('Failed to load search history:', error);
      }
    }

    const savedPatterns = localStorage.getItem('wki-usage-patterns');
    if (savedPatterns) {
      try {
        setUsagePatterns(JSON.parse(savedPatterns));
      } catch (error) {
        console.error('Failed to load usage patterns:', error);
      }
    }
  }, []);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [searchTerm, debounceMs]);

  // Handle voice search result
  const handleVoiceSearchResult = useCallback((transcript) => {
    // Process voice command
    let processedTerm = transcript.toLowerCase();
    
    // Handle voice commands like "Hey inventory, find transmission filters"
    const commandPrefixes = [
      'hey inventory',
      'inventory',
      'find',
      'search for',
      'look for',
      'show me'
    ];
    
    commandPrefixes.forEach(prefix => {
      if (processedTerm.startsWith(prefix)) {
        processedTerm = processedTerm.replace(prefix, '').trim();
      }
    });
    
    setSearchTerm(processedTerm);
    addToSearchHistory(processedTerm);
  }, []);

  // Start voice search
  const startVoiceSearch = useCallback(() => {
    if (recognitionRef.current && isVoiceSupported) {
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error('Failed to start voice recognition:', error);
      }
    }
  }, [isVoiceSupported]);

  // Stop voice search
  const stopVoiceSearch = useCallback(() => {
    if (recognitionRef.current && isVoiceSearchActive) {
      recognitionRef.current.stop();
    }
  }, [isVoiceSearchActive]);

  // Add to search history
  const addToSearchHistory = useCallback((term) => {
    if (!term.trim()) return;
    
    setSearchHistory(prev => {
      const filtered = prev.filter(item => item.term !== term);
      const newHistory = [
        { term, timestamp: Date.now(), count: (prev.find(item => item.term === term)?.count || 0) + 1 },
        ...filtered
      ].slice(0, 10); // Keep only last 10 searches
      
      localStorage.setItem('wki-search-history', JSON.stringify(newHistory));
      return newHistory;
    });
  }, []);

  // Update usage patterns
  const updateUsagePattern = useCallback((searchTerm, selectedItem) => {
    if (!searchTerm.trim() || !selectedItem) return;
    
    setUsagePatterns(prev => {
      const patterns = { ...prev };
      const key = searchTerm.toLowerCase();
      
      if (!patterns[key]) {
        patterns[key] = { items: {}, totalCount: 0 };
      }
      
      const itemKey = selectedItem.partNumber || selectedItem.id;
      patterns[key].items[itemKey] = (patterns[key].items[itemKey] || 0) + 1;
      patterns[key].totalCount += 1;
      
      localStorage.setItem('wki-usage-patterns', JSON.stringify(patterns));
      return patterns;
    });
  }, []);

  // Generate smart suggestions
  const generateSuggestions = useCallback((currentTerm) => {
    if (!currentTerm.trim()) {
      // Show recent searches when no term
      return searchHistory.slice(0, 5).map(item => ({
        type: 'history',
        text: item.term,
        count: item.count
      }));
    }

    const suggestions = [];
    const term = currentTerm.toLowerCase();

    // Add matching items from inventory
    items.forEach(item => {
      searchFields.forEach(field => {
        const fieldValue = getNestedValue(item, field)?.toString().toLowerCase() || '';
        if (fieldValue.includes(term) && !suggestions.find(s => s.text === fieldValue)) {
          suggestions.push({
            type: 'item',
            text: fieldValue,
            item: item,
            field: field
          });
        }
      });
    });

    // Add category suggestions
    const categories = [...new Set(items.map(item => item.category).filter(Boolean))];
    categories.forEach(category => {
      if (category.toLowerCase().includes(term)) {
        suggestions.push({
          type: 'category',
          text: category,
          count: items.filter(item => item.category === category).length
        });
      }
    });

    // Add usage pattern suggestions
    Object.entries(usagePatterns).forEach(([pattern, data]) => {
      if (pattern.includes(term)) {
        suggestions.push({
          type: 'pattern',
          text: pattern,
          count: data.totalCount
        });
      }
    });

    // Sort by relevance and frequency
    return suggestions
      .sort((a, b) => {
        if (a.type === 'history' && b.type !== 'history') return -1;
        if (b.type === 'history' && a.type !== 'history') return 1;
        return (b.count || 0) - (a.count || 0);
      })
      .slice(0, 8);
  }, [items, searchFields, searchHistory, usagePatterns]);

  // Update suggestions when search term changes
  useEffect(() => {
    setSuggestions(generateSuggestions(searchTerm));
  }, [searchTerm, generateSuggestions]);

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

      // Boost score based on usage patterns
      const pattern = usagePatterns[debouncedSearchTerm.toLowerCase()];
      if (pattern && pattern.items[item.partNumber || item.id]) {
        score += pattern.items[item.partNumber || item.id] * 5;
      }

      return { item, score, matchedFields };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);

    return scoredItems;
  }, [items, debouncedSearchTerm, searchFields, usagePatterns]);

  // Get categories with counts
  const categories = useMemo(() => {
    const categoryMap = {};
    items.forEach(item => {
      const category = item.category || 'Uncategorized';
      if (!categoryMap[category]) {
        categoryMap[category] = { count: 0, items: [] };
      }
      categoryMap[category].count++;
      categoryMap[category].items.push(item);
    });
    
    return Object.entries(categoryMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  // Handle suggestion selection
  const selectSuggestion = useCallback((suggestion) => {
    setSearchTerm(suggestion.text);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    addToSearchHistory(suggestion.text);
  }, [addToSearchHistory]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          selectSuggestion(suggestions[selectedSuggestionIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  }, [showSuggestions, suggestions, selectedSuggestionIndex, selectSuggestion]);

  // Clear search history
  const clearSearchHistory = useCallback(() => {
    setSearchHistory([]);
    localStorage.removeItem('wki-search-history');
  }, []);

  // Helper function to get nested values
  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  return {
    searchTerm,
    setSearchTerm,
    debouncedSearchTerm,
    filteredItems,
    searchHistory,
    isVoiceSearchActive,
    isVoiceSupported,
    suggestions,
    showSuggestions,
    setShowSuggestions,
    selectedSuggestionIndex,
    categories,
    startVoiceSearch,
    stopVoiceSearch,
    addToSearchHistory,
    updateUsagePattern,
    selectSuggestion,
    handleKeyDown,
    clearSearchHistory,
    searchInputRef
  };
};