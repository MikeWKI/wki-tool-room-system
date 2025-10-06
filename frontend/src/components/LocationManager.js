import React, { useState, useEffect } from 'react';
import { MapPin, Save, X, Search, Package, AlertCircle, CheckCircle } from 'lucide-react';

const LocationManager = ({ 
  isOpen, 
  onClose, 
  inventory, 
  shelves, 
  onLocationUpdate,
  apiCall 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedParts, setSelectedParts] = useState([]);
  const [newLocation, setNewLocation] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState(null);
  const [filterBy, setFilterBy] = useState('all'); // all, location, category
  const [selectedFilter, setSelectedFilter] = useState('');

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedParts([]);
      setNewLocation('');
      setUpdateResult(null);
      setSearchTerm('');
      setFilterBy('all');
      setSelectedFilter('');
    }
  }, [isOpen]);

  // Filter inventory based on search and filters
  const filteredInventory = inventory.filter(part => {
    const matchesSearch = 
      part.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      part.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (part.shelf && part.shelf.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterBy === 'location' && selectedFilter) {
      return part.shelf && part.shelf.toLowerCase().includes(selectedFilter.toLowerCase());
    }
    
    if (filterBy === 'category' && selectedFilter) {
      return part.category && part.category.toLowerCase() === selectedFilter.toLowerCase();
    }

    return true;
  });

  // Get unique locations and categories for filtering
  const uniqueLocations = [...new Set(inventory.map(part => part.shelf).filter(Boolean))];
  const uniqueCategories = [...new Set(inventory.map(part => part.category).filter(Boolean))];

  const handlePartSelection = (partId) => {
    setSelectedParts(prev => 
      prev.includes(partId) 
        ? prev.filter(id => id !== partId)
        : [...prev, partId]
    );
  };

  const handleSelectAll = () => {
    if (selectedParts.length === filteredInventory.length) {
      setSelectedParts([]);
    } else {
      setSelectedParts(filteredInventory.map(part => part.id));
    }
  };

  const handleBulkLocationUpdate = async () => {
    if (selectedParts.length === 0 || !newLocation.trim()) {
      return;
    }

    setIsUpdating(true);
    setUpdateResult(null);

    try {
      const updates = selectedParts.map(partId => ({
        id: partId,
        shelf: newLocation.trim()
      }));

      const result = await apiCall('/parts/bulk/locations', {
        method: 'PUT',
        body: JSON.stringify({
          updates,
          modifiedBy: 'Location Manager'
        })
      });

      setUpdateResult({
        success: true,
        message: `Successfully updated ${result.updated} parts to location "${newLocation}"`
      });

      // Refresh the inventory data
      if (onLocationUpdate) {
        onLocationUpdate();
      }

      // Reset selections
      setSelectedParts([]);
      setNewLocation('');

    } catch (error) {
      setUpdateResult({
        success: false,
        message: `Failed to update locations: ${error.message}`
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSingleLocationUpdate = async (partId, shelf) => {
    try {
      await apiCall(`/parts/${partId}`, {
        method: 'PUT',
        body: JSON.stringify({
          shelf,
          modifiedBy: 'Location Manager'
        })
      });

      if (onLocationUpdate) {
        onLocationUpdate();
      }
    } catch (error) {
      console.error('Failed to update single part location:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-red-600 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-6 h-6" />
            <h2 className="text-xl font-bold">Location Manager</h2>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="p-1 hover:bg-red-700 rounded"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Search and Filters */}
        <div className="p-4 border-b bg-gray-50">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search parts, descriptions, or locations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Filter Type */}
            <div className="flex gap-2">
              <select
                value={filterBy}
                onChange={(e) => {
                  setFilterBy(e.target.value);
                  setSelectedFilter('');
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
              >
                <option value="all">All Parts</option>
                <option value="location">By Location</option>
                <option value="category">By Category</option>
              </select>

              {/* Filter Value */}
              {filterBy === 'location' && (
                <select
                  value={selectedFilter}
                  onChange={(e) => setSelectedFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Select Location</option>
                  {uniqueLocations.map(location => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                </select>
              )}

              {filterBy === 'category' && (
                <select
                  value={selectedFilter}
                  onChange={(e) => setSelectedFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Select Category</option>
                  {uniqueCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Bulk Operations */}
          <div className="flex flex-col lg:flex-row gap-4 mt-4 p-4 bg-white rounded-lg border">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSelectAll}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                {selectedParts.length === filteredInventory.length ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-sm text-gray-600">
                {selectedParts.length} of {filteredInventory.length} selected
              </span>
            </div>

            {selectedParts.length > 0 && (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  placeholder="New location (e.g., A-01, West Rack - Shelf 2)"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                />
                <button
                  onClick={handleBulkLocationUpdate}
                  disabled={isUpdating || !newLocation.trim()}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isUpdating ? 'Updating...' : 'Update Locations'}
                </button>
              </div>
            )}
          </div>

          {/* Update Result */}
          {updateResult && (
            <div className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
              updateResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {updateResult.success ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <span>{updateResult.message}</span>
            </div>
          )}
        </div>

        {/* Parts List */}
        <div className="overflow-auto max-h-[50vh]">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="p-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedParts.length === filteredInventory.length && filteredInventory.length > 0}
                    onChange={handleSelectAll}
                    className="rounded text-red-600 focus:ring-red-500"
                  />
                </th>
                <th className="p-3 text-left font-medium text-gray-700">Part Number</th>
                <th className="p-3 text-left font-medium text-gray-700">Description</th>
                <th className="p-3 text-left font-medium text-gray-700">Current Location</th>
                <th className="p-3 text-left font-medium text-gray-700">Category</th>
                <th className="p-3 text-left font-medium text-gray-700">Quantity</th>
                <th className="p-3 text-left font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map((part) => (
                <tr 
                  key={part.id} 
                  className={`border-t hover:bg-gray-50 ${
                    selectedParts.includes(part.id) ? 'bg-red-50' : ''
                  }`}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedParts.includes(part.id)}
                      onChange={() => handlePartSelection(part.id)}
                      className="rounded text-red-600 focus:ring-red-500"
                    />
                  </td>
                  <td className="p-3 font-medium text-blue-600">{part.partNumber}</td>
                  <td className="p-3 text-gray-900">{part.description}</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm text-gray-700">
                      <MapPin className="w-3 h-3" />
                      {part.shelf || 'Unassigned'}
                    </span>
                  </td>
                  <td className="p-3 text-gray-900">{part.category}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-sm ${
                      part.quantity <= (part.minQuantity || 1) 
                        ? 'bg-red-100 text-red-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {part.quantity}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-sm ${
                      part.status === 'available' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {part.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredInventory.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No parts found matching your search criteria.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Showing {filteredInventory.length} of {inventory.length} parts
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationManager;