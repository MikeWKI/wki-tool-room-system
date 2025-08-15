import React, { memo } from 'react';
import { Package, MapPin, Clock, User, AlertCircle, Smartphone } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const ResponsiveInventoryGrid = memo(({ 
  inventory, 
  searchTerm, 
  onPartSelect, 
  onCheckout, 
  onCheckin 
}) => {
  const { isDark } = useTheme();

  const getStatusColor = (status) => {
    return status === 'available' 
      ? 'text-green-600 dark:text-green-400' 
      : 'text-orange-600 dark:text-orange-400';
  };

  const getStatusIcon = (status) => {
    return status === 'available' ? (
      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
    ) : (
      <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
    );
  };

  const isLowStock = (part) => {
    return part.quantity <= part.minQuantity;
  };

  const highlightSearchTerm = (text, term) => {
    if (!term) return text;
    
    const regex = new RegExp(`(${term})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <span key={index} className="bg-yellow-200 dark:bg-yellow-800 text-gray-900 dark:text-yellow-100 px-1 rounded">
          {part}
        </span>
      ) : part
    );
  };

  return (
    <div className="w-full">
      {/* Desktop Grid View */}
      <div className="hidden lg:grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
        {inventory.map((part) => (
          <DesktopCard 
            key={part.id}
            part={part}
            searchTerm={searchTerm}
            onPartSelect={onPartSelect}
            onCheckout={onCheckout}
            onCheckin={onCheckin}
            getStatusColor={getStatusColor}
            getStatusIcon={getStatusIcon}
            isLowStock={isLowStock}
            highlightSearchTerm={highlightSearchTerm}
          />
        ))}
      </div>

      {/* Tablet Grid View */}
      <div className="hidden md:grid lg:hidden grid-cols-1 sm:grid-cols-2 gap-4">
        {inventory.map((part) => (
          <TabletCard 
            key={part.id}
            part={part}
            searchTerm={searchTerm}
            onPartSelect={onPartSelect}
            onCheckout={onCheckout}
            onCheckin={onCheckin}
            getStatusColor={getStatusColor}
            getStatusIcon={getStatusIcon}
            isLowStock={isLowStock}
            highlightSearchTerm={highlightSearchTerm}
          />
        ))}
      </div>

      {/* Mobile List View */}
      <div className="md:hidden space-y-3">
        {inventory.map((part) => (
          <MobileCard 
            key={part.id}
            part={part}
            searchTerm={searchTerm}
            onPartSelect={onPartSelect}
            onCheckout={onCheckout}
            onCheckin={onCheckin}
            getStatusColor={getStatusColor}
            getStatusIcon={getStatusIcon}
            isLowStock={isLowStock}
            highlightSearchTerm={highlightSearchTerm}
          />
        ))}
      </div>

      {/* Empty State */}
      {inventory.length === 0 && (
        <div className="col-span-full text-center py-12">
          <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No parts found</h3>
          <p className="text-gray-600 dark:text-gray-400">
            {searchTerm ? `No parts match "${searchTerm}"` : 'No parts available'}
          </p>
        </div>
      )}
    </div>
  );
});

// Desktop Card Component
const DesktopCard = memo(({ part, searchTerm, onPartSelect, onCheckout, onCheckin, getStatusColor, getStatusIcon, isLowStock, highlightSearchTerm }) => (
  <div
    className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer border-l-4 border-transparent hover:border-red-500 dark:hover:border-red-400"
    onClick={() => onPartSelect(part)}
  >
    <div className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Package className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {highlightSearchTerm(part.partNumber, searchTerm)}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          {getStatusIcon(part.status)}
          {isLowStock(part) && (
            <AlertCircle className="w-4 h-4 text-orange-500" title="Low stock" />
          )}
        </div>
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 line-clamp-2">
        {highlightSearchTerm(part.description, searchTerm)}
      </h3>
      
      <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
        <div className="flex items-center">
          <MapPin className="w-4 h-4 mr-2" />
          <span>{part.shelf}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-gray-400">Quantity:</span>
          <span className={`font-medium ${isLowStock(part) ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-gray-100'}`}>
            {part.quantity}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-gray-400">Status:</span>
          <span className={`font-medium ${getStatusColor(part.status)}`}>
            {part.status === 'available' ? 'Available' : 'Checked Out'}
          </span>
        </div>
        
        {part.status === 'checked_out' && (
          <CheckedOutInfo part={part} />
        )}
      </div>
      
      <ActionButtons part={part} onCheckout={onCheckout} onCheckin={onCheckin} />
    </div>
  </div>
));

// Tablet Card Component
const TabletCard = memo(({ part, searchTerm, onPartSelect, onCheckout, onCheckin, getStatusColor, getStatusIcon, isLowStock, highlightSearchTerm }) => (
  <div
    className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer border-l-4 border-transparent hover:border-red-500 dark:hover:border-red-400"
    onClick={() => onPartSelect(part)}
  >
    <div className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Package className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {highlightSearchTerm(part.partNumber, searchTerm)}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          {getStatusIcon(part.status)}
          {isLowStock(part) && (
            <AlertCircle className="w-3 h-3 text-orange-500" />
          )}
        </div>
      </div>
      
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 line-clamp-2">
        {highlightSearchTerm(part.description, searchTerm)}
      </h3>
      
      <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300 mb-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center">
            <MapPin className="w-3 h-3 mr-1" />
            {part.shelf}
          </span>
          <span className={`font-medium ${isLowStock(part) ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-gray-100'}`}>
            Qty: {part.quantity}
          </span>
        </div>
      </div>
      
      <ActionButtons part={part} onCheckout={onCheckout} onCheckin={onCheckin} size="sm" />
    </div>
  </div>
));

// Mobile Card Component
const MobileCard = memo(({ part, searchTerm, onPartSelect, onCheckout, onCheckin, getStatusColor, getStatusIcon, isLowStock, highlightSearchTerm }) => (
  <div
    className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700"
    onClick={() => onPartSelect(part)}
  >
    <div className="p-4">
      {/* Header Row */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <Package className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {highlightSearchTerm(part.partNumber, searchTerm)}
            </span>
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
            {highlightSearchTerm(part.description, searchTerm)}
          </h3>
        </div>
        <div className="flex items-center space-x-1 ml-2">
          {getStatusIcon(part.status)}
          {isLowStock(part) && (
            <AlertCircle className="w-4 h-4 text-orange-500" />
          )}
        </div>
      </div>

      {/* Info Row */}
      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300 mb-3">
        <div className="flex items-center">
          <MapPin className="w-3 h-3 mr-1" />
          <span>{part.shelf}</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className={`font-medium ${isLowStock(part) ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-gray-100'}`}>
            Qty: {part.quantity}
          </span>
          <span className={`font-medium ${getStatusColor(part.status)}`}>
            {part.status === 'available' ? 'Available' : 'Checked Out'}
          </span>
        </div>
      </div>

      {/* Checked Out Info */}
      {part.status === 'checked_out' && (
        <div className="mb-3 p-2 bg-orange-50 dark:bg-orange-900/20 rounded border-l-2 border-orange-200 dark:border-orange-700">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center text-orange-800 dark:text-orange-300">
              <User className="w-3 h-3 mr-1" />
              <span className="truncate">{part.checkedOutBy}</span>
            </div>
            <div className="flex items-center text-orange-600 dark:text-orange-400 text-xs">
              <Clock className="w-3 h-3 mr-1" />
              <span>{new Date(part.checkedOutDate).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Action Button */}
      <ActionButtons part={part} onCheckout={onCheckout} onCheckin={onCheckin} size="sm" mobile />
    </div>
  </div>
));

// Shared Components
const CheckedOutInfo = memo(({ part }) => (
  <div className="mt-3 p-2 bg-orange-50 dark:bg-orange-900/20 rounded border-l-2 border-orange-200 dark:border-orange-700">
    <div className="flex items-center text-sm">
      <User className="w-4 h-4 mr-2 text-orange-600 dark:text-orange-400" />
      <span className="text-orange-800 dark:text-orange-300">{part.checkedOutBy}</span>
    </div>
    <div className="flex items-center text-xs text-orange-600 dark:text-orange-400 mt-1">
      <Clock className="w-3 h-3 mr-1" />
      <span>{new Date(part.checkedOutDate).toLocaleDateString()}</span>
    </div>
  </div>
));

const ActionButtons = memo(({ part, onCheckout, onCheckin, size = "base", mobile = false }) => {
  const buttonClasses = size === "sm" 
    ? "px-3 py-1.5 text-sm" 
    : "px-4 py-2 text-sm";
    
  return (
    <div className={`${mobile ? 'flex' : 'mt-4 flex'} ${mobile ? 'space-x-2' : 'space-x-2'}`}>
      {part.status === 'available' ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCheckout(part);
          }}
          className={`flex-1 bg-red-600 hover:bg-red-700 text-white ${buttonClasses} rounded-md font-medium transition-colors`}
        >
          Check Out
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCheckin(part);
          }}
          className={`flex-1 bg-green-600 hover:bg-green-700 text-white ${buttonClasses} rounded-md font-medium transition-colors`}
        >
          Check In
        </button>
      )}
    </div>
  );
});

ResponsiveInventoryGrid.displayName = 'ResponsiveInventoryGrid';
DesktopCard.displayName = 'DesktopCard';
TabletCard.displayName = 'TabletCard';
MobileCard.displayName = 'MobileCard';
CheckedOutInfo.displayName = 'CheckedOutInfo';
ActionButtons.displayName = 'ActionButtons';

export default ResponsiveInventoryGrid;
