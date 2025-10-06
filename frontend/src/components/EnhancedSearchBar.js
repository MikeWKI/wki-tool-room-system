import React, { useState, useRef, useEffect } from 'react';
import { Search, Mic, MicOff, History, Hash, Package, ChevronDown, ChevronRight, X, Clock } from 'lucide-react';

const EnhancedSearchBar = ({ 
  searchTerm, 
  setSearchTerm, 
  suggestions, 
  showSuggestions, 
  setShowSuggestions,
  selectedSuggestionIndex,
  isVoiceSearchActive,
  isVoiceSupported,
  startVoiceSearch,
  stopVoiceSearch,
  selectSuggestion,
  handleKeyDown,
  searchHistory,
  clearSearchHistory,
  categories,
  onCategorySelect,
  className = ""
}) => {
  const [showCategoryBrowser, setShowCategoryBrowser] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const searchRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Handle clicks outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false);
        setShowCategoryBrowser(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setShowSuggestions]);

  const handleInputChange = (e) => {
    setSearchTerm(e.target.value);
    setShowSuggestions(true);
    setShowCategoryBrowser(false);
  };

  const handleInputFocus = () => {
    setShowSuggestions(true);
  };

  const handleVoiceToggle = () => {
    if (isVoiceSearchActive) {
      stopVoiceSearch();
    } else {
      startVoiceSearch();
    }
  };

  const toggleCategoryBrowser = () => {
    setShowCategoryBrowser(!showCategoryBrowser);
    setShowSuggestions(false);
  };

  const toggleCategory = (categoryName) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryName)) {
      newExpanded.delete(categoryName);
    } else {
      newExpanded.add(categoryName);
    }
    setExpandedCategories(newExpanded);
  };

  const getSuggestionIcon = (type) => {
    switch (type) {
      case 'history':
        return <Clock className="w-4 h-4 text-gray-400" />;
      case 'category':
        return <Hash className="w-4 h-4 text-blue-500" />;
      case 'item':
        return <Package className="w-4 h-4 text-green-500" />;
      case 'pattern':
        return <History className="w-4 h-4 text-purple-500" />;
      default:
        return <Search className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div ref={searchRef} className={`relative ${className}`}>
      {/* Main Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400 dark:text-gray-500" />
        </div>
        
        <input
          type="text"
          placeholder="Search parts by number, description, or category... (or use voice search)"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          className="w-full pl-10 pr-20 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors"
        />
        
        <div className="absolute inset-y-0 right-0 flex items-center space-x-1 pr-3">
          {/* Category Browser Toggle */}
          <button
            onClick={toggleCategoryBrowser}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            title="Browse by category"
          >
            <Hash className="w-4 h-4" />
          </button>
          
          {/* Voice Search Button */}
          {isVoiceSupported && (
            <button
              onClick={handleVoiceToggle}
              className={`p-1.5 rounded transition-colors ${
                isVoiceSearchActive
                  ? 'text-red-600 bg-red-100 dark:bg-red-900/20'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
              title={isVoiceSearchActive ? 'Stop voice search' : 'Start voice search'}
            >
              {isVoiceSearchActive ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
          )}
          
          {/* Clear Search */}
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Voice Search Indicator */}
      {isVoiceSearchActive && (
        <div className="absolute top-full left-0 right-0 mt-1 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg z-20">
          <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
            <Mic className="w-4 h-4 animate-pulse" />
            <span className="text-sm">Listening... Say something like "find transmission filters"</span>
          </div>
        </div>
      )}

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div 
          ref={suggestionsRef}
          className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-80 overflow-y-auto"
        >
          <div className="p-2">
            {/* Search History Header */}
            {suggestions.some(s => s.type === 'history') && (
              <div className="flex items-center justify-between px-2 py-1 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 mb-1">
                <span>Recent Searches</span>
                {searchHistory.length > 0 && (
                  <button
                    onClick={clearSearchHistory}
                    className="text-red-500 hover:text-red-600 dark:hover:text-red-400"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
            
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.text}-${index}`}
                onClick={() => selectSuggestion(suggestion)}
                className={`w-full flex items-center space-x-3 px-3 py-2 text-left rounded-lg transition-colors ${
                  index === selectedSuggestionIndex
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {getSuggestionIcon(suggestion.type)}
                <div className="flex-1 min-w-0">
                  <div className="truncate">{suggestion.text}</div>
                  {suggestion.count && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {suggestion.type === 'category' ? `${suggestion.count} items` : 
                       suggestion.type === 'history' ? `used ${suggestion.count} times` :
                       `${suggestion.count} matches`}
                    </div>
                  )}
                </div>
                {suggestion.type === 'history' && (
                  <div className="text-xs text-gray-400">
                    {new Date(Date.now()).toLocaleDateString()}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category Browser */}
      {showCategoryBrowser && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-96 overflow-y-auto">
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-900 dark:text-gray-100">Browse by Category</h4>
              <button
                onClick={() => setShowCategoryBrowser(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-1">
              {categories.map((category) => (
                <div key={category.name}>
                  <button
                    onClick={() => toggleCategory(category.name)}
                    className="w-full flex items-center justify-between px-2 py-2 text-left rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      {expandedCategories.has(category.name) ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="text-gray-900 dark:text-gray-100">{category.name}</span>
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {category.count} items
                    </span>
                  </button>
                  
                  {expandedCategories.has(category.name) && (
                    <div className="ml-6 mt-1 space-y-1">
                      {category.items.slice(0, 5).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            setSearchTerm(item.partNumber);
                            setShowCategoryBrowser(false);
                          }}
                          className="w-full flex items-center space-x-2 px-2 py-1 text-left text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          <Package className="w-3 h-3 text-gray-400" />
                          <span className="text-gray-700 dark:text-gray-300 truncate">
                            {item.partNumber} - {item.description}
                          </span>
                        </button>
                      ))}
                      {category.items.length > 5 && (
                        <button
                          onClick={() => {
                            onCategorySelect(category.name);
                            setShowCategoryBrowser(false);
                          }}
                          className="w-full px-2 py-1 text-left text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                        >
                          View all {category.count} items...
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedSearchBar;