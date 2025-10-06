import React, { memo } from 'react';
import { Package, MapPin, Clock, User, AlertCircle } from 'lucide-react';

const InventoryGrid = memo(({ 
  inventory, 
  searchTerm, 
  onPartSelect, 
  onCheckout, 
  onCheckin 
}) => {
  const getStatusColor = (status) => {
    return status === 'available' ? 'text-green-600' : 'text-orange-600';
  };

  const getStatusIcon = (status) => {
    return status === 'available' ? (
      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
    ) : (
      <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
    );
  };

  const isNoStock = (part) => {
    return part.quantity === 0;
  };

  const highlightSearchTerm = (text, term) => {
    if (!term) return text;
    
    const regex = new RegExp(`(${term})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <span key={index} className="bg-yellow-200 text-gray-900 px-1 rounded">
          {part}
        </span>
      ) : part
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {inventory.map((part) => (
        <div
          key={part.id}
          className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-300 border-l-4 border-transparent hover:border-red-500"
        >
          <div 
            className="p-6 cursor-pointer"
            onClick={() => onPartSelect(part)}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Package className="w-5 h-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">
                  {highlightSearchTerm(part.partNumber, searchTerm)}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(part.status)}
                {isNoStock(part) && (
                  <AlertCircle className="w-4 h-4 text-red-500" title="No stock" />
                )}
              </div>
            </div>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
              {highlightSearchTerm(part.description, searchTerm)}
            </h3>
            
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center">
                <MapPin className="w-4 h-4 mr-2" />
                <span>{part.shelf}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Quantity:</span>
                <span className={`font-medium ${isNoStock(part) ? 'text-red-600' : 'text-gray-900'}`}>
                  {part.quantity}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Status:</span>
                <span className={`font-medium ${getStatusColor(part.status)}`}>
                  {part.status === 'available' ? 'Available' : 'Checked Out'}
                </span>
              </div>
              
              {part.status === 'checked_out' && (
                <div className="mt-3 p-2 bg-orange-50 rounded border-l-2 border-orange-200">
                  <div className="flex items-center text-sm">
                    <User className="w-4 h-4 mr-2 text-orange-600" />
                    <span className="text-orange-800">{part.checkedOutBy}</span>
                  </div>
                  <div className="flex items-center text-xs text-orange-600 mt-1">
                    <Clock className="w-3 h-3 mr-1" />
                    <span>{new Date(part.checkedOutDate).toLocaleDateString()}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
            
          <div className="px-6 pb-6">
            <div className="flex space-x-2">
              {part.status === 'available' ? (
                <button
                  onClick={() => onCheckout(part)}
                  className="flex-1 bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Check Out
                </button>
              ) : (
                <button
                  onClick={() => onCheckin(part)}
                  className="flex-1 bg-green-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  Check In
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      
      {inventory.length === 0 && (
        <div className="col-span-full text-center py-12">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No parts found</h3>
          <p className="text-gray-600">
            {searchTerm ? `No parts match "${searchTerm}"` : 'No parts available'}
          </p>
        </div>
      )}
    </div>
  );
});

InventoryGrid.displayName = 'InventoryGrid';

export default InventoryGrid;
