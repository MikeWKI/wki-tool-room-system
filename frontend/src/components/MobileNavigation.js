import React, { useState } from 'react';
import { Menu, X, Sun, Moon, Package, History, Settings, MapPin, BarChart3 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const MobileNavigation = ({ activeView, setActiveView, isManageUnlocked, onManageClick }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { isDark, toggleTheme } = useTheme();

  const navigationItems = [
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'history', label: 'History', icon: History },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'layout', label: 'Layout', icon: MapPin },
  ];

  const handleNavClick = (viewId) => {
    if (viewId === 'manage') {
      onManageClick();
    } else {
      setActiveView(viewId);
    }
    setIsOpen(false);
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="md:hidden">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 rounded-lg bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu Panel */}
          <div className="fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-white dark:bg-gray-800 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-600">
              <div className="flex items-center space-x-3">
                <img src="/WKI_INV.png" alt="WKI Logo" className="w-12 h-12" />
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">WKI Tool Room</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Inventory System</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Navigation Items */}
            <div className="p-4 space-y-2">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`
                      w-full flex items-center space-x-3 p-3 rounded-lg text-left transition-colors
                      ${isActive 
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' 
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }
                    `}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}

              {/* Manage Section */}
              <div className="border-t border-gray-200 dark:border-gray-600 pt-4 mt-4">
                <button
                  onClick={() => handleNavClick('manage')}
                  className={`
                    w-full flex items-center space-x-3 p-3 rounded-lg text-left transition-colors
                    ${activeView === 'manage' 
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' 
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  <Settings className="w-5 h-5" />
                  <span className="font-medium">Manage</span>
                  {!isManageUnlocked && (
                    <span className="ml-auto text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2 py-1 rounded">
                      PIN Required
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Theme Toggle */}
            <div className="absolute bottom-4 left-4 right-4 border-t border-gray-200 dark:border-gray-600 pt-4">
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-between p-3 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="font-medium">Theme</span>
                <div className="flex items-center space-x-2">
                  {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                  <span className="text-sm">{isDark ? 'Dark' : 'Light'}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileNavigation;
