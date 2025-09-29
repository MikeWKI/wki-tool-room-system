import React, { useState, useEffect } from 'react';
import { Filter, X, Search, ChevronDown, MapPin, Package, AlertCircle } from 'lucide-react';

const AdvancedFilters = ({ 
  inventory, 
  shelves, 
  onFilterChange, 
  isOpen, 
  onToggle 
}) => {
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    location: '',
    status: '',
    quantityLevel: 'all', // all, low, zero, normal
    minQuantity: '',
    maxQuantity: '',
    partNumberPrefix: '',
    dateModified: '' // today, week, month, all
  });

  const [activeFiltersCount, setActiveFiltersCount] = useState(0);

  // Get unique values for filter dropdowns
  const uniqueCategories = [...new Set(inventory.map(part => part.category).filter(Boolean))];
  const uniqueLocations = [...new Set(inventory.map(part => part.shelf).filter(Boolean))];
  const uniqueStatuses = [...new Set(inventory.map(part => part.status).filter(Boolean))];

  // Count active filters
  useEffect(() => {
    const count = Object.entries(filters).reduce((acc, [key, value]) => {
      if (key === 'quantityLevel' && value === 'all') return acc;
      if (value && value.toString().trim() !== '') return acc + 1;
      return acc;
    }, 0);
    setActiveFiltersCount(count);
  }, [filters]);

  // Apply filters and notify parent
  useEffect(() => {
    const filteredInventory = inventory.filter(part => {
      // Search filter
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        const searchable = [
          part.partNumber,
          part.description,
          part.shelf,
          part.category
        ].join(' ').toLowerCase();
        
        if (!searchable.includes(searchTerm)) return false;
      }

      // Category filter
      if (filters.category && part.category !== filters.category) {
        return false;
      }

      // Location filter
      if (filters.location && part.shelf !== filters.location) {
        return false;
      }

      // Status filter
      if (filters.status && part.status !== filters.status) {
        return false;
      }

      // Part number prefix filter
      if (filters.partNumberPrefix && 
          !part.partNumber.toLowerCase().startsWith(filters.partNumberPrefix.toLowerCase())) {
        return false;
      }

      // Quantity range filters
      if (filters.minQuantity && part.quantity < parseInt(filters.minQuantity)) {
        return false;
      }
      if (filters.maxQuantity && part.quantity > parseInt(filters.maxQuantity)) {
        return false;
      }

      // Quantity level filter
      if (filters.quantityLevel !== 'all') {
        switch (filters.quantityLevel) {
          case 'zero':
            if (part.quantity !== 0) return false;
            break;
          case 'low':
            if (part.quantity > (part.minQuantity || 1)) return false;
            break;
          case 'normal':
            if (part.quantity <= (part.minQuantity || 1)) return false;
            break;
        }
      }

      // Date modified filter
      if (filters.dateModified && filters.dateModified !== 'all' && part.lastModified) {
        const modifiedDate = new Date(part.lastModified);
        const now = new Date();
        const daysDiff = (now - modifiedDate) / (1000 * 60 * 60 * 24);

        switch (filters.dateModified) {
          case 'today':
            if (daysDiff > 1) return false;
            break;
          case 'week':
            if (daysDiff > 7) return false;
            break;
          case 'month':
            if (daysDiff > 30) return false;
            break;
        }
      }

      return true;
    });

    onFilterChange(filteredInventory, filters);
  }, [filters, inventory, onFilterChange]);

  const updateFilter = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      search: '',
      category: '',
      location: '',
      status: '',
      quantityLevel: 'all',
      minQuantity: '',
      maxQuantity: '',
      partNumberPrefix: '',
      dateModified: ''
    });
  };

  const getQuantityLevelStats = () => {
    const stats = {
      zero: inventory.filter(p => p.quantity === 0).length,
      low: inventory.filter(p => p.quantity > 0 && p.quantity <= (p.minQuantity || 1)).length,
      normal: inventory.filter(p => p.quantity > (p.minQuantity || 1)).length
    };
    return stats;
  };

  const quantityStats = getQuantityLevelStats();

  return (
    <div className="bg-white rounded-lg shadow-md mb-6">
      {/* Filter Toggle Header */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-500" />
          <span className="font-medium text-gray-900">Advanced Filters</span>
          {activeFiltersCount > 0 && (
            <span className="bg-red-600 text-white text-xs px-2 py-1 rounded-full">
              {activeFiltersCount}
            </span>
          )}
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {/* Filter Content */}
      {isOpen && (
        <div className="border-t border-gray-200 p-4 space-y-4">
          {/* Search Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search parts, descriptions..."
                  value={filters.search}
                  onChange={(e) => updateFilter('search', e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Part Number Prefix
              </label>
              <input
                type="text"
                placeholder="e.g., CAM, T800, W900"
                value={filters.partNumberPrefix}
                onChange={(e) => updateFilter('partNumberPrefix', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Modified
              </label>
              <select
                value={filters.dateModified}
                onChange={(e) => updateFilter('dateModified', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
              >
                <option value="">All time</option>
                <option value="today">Today</option>
                <option value="week">This week</option>
                <option value="month">This month</option>
              </select>
            </div>
          </div>

          {/* Category and Location Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                value={filters.category}
                onChange={(e) => updateFilter('category', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
              >
                <option value="">All categories</option>
                {uniqueCategories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location
              </label>
              <select
                value={filters.location}
                onChange={(e) => updateFilter('location', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
              >
                <option value="">All locations</option>
                {uniqueLocations.map(location => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => updateFilter('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
              >
                <option value="">All statuses</option>
                {uniqueStatuses.map(status => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quantity Filters Row */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stock Level
              </label>
              <select
                value={filters.quantityLevel}
                onChange={(e) => updateFilter('quantityLevel', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
              >
                <option value="all">All levels</option>
                <option value="zero">Out of stock ({quantityStats.zero})</option>
                <option value="low">Low stock ({quantityStats.low})</option>
                <option value="normal">Normal stock ({quantityStats.normal})</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min Quantity
              </label>
              <input
                type="number"
                placeholder="0"
                value={filters.minQuantity}
                onChange={(e) => updateFilter('minQuantity', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Quantity
              </label>
              <input
                type="number"
                placeholder="999"
                value={filters.maxQuantity}
                onChange={(e) => updateFilter('maxQuantity', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={clearAllFilters}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                Clear All
              </button>
            </div>
          </div>

          {/* Quick Filter Buttons */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
            <span className="text-sm font-medium text-gray-700">Quick filters:</span>
            <button
              onClick={() => updateFilter('quantityLevel', 'zero')}
              className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded-full hover:bg-red-200"
            >
              <AlertCircle className="w-3 h-3 inline mr-1" />
              Out of Stock ({quantityStats.zero})
            </button>
            <button
              onClick={() => updateFilter('quantityLevel', 'low')}
              className="px-3 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full hover:bg-yellow-200"
            >
              Low Stock ({quantityStats.low})
            </button>
            <button
              onClick={() => updateFilter('status', 'checked_out')}
              className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200"
            >
              Checked Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedFilters;