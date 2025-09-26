import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Package, MapPin, Clock, CheckCircle, AlertCircle, History, Plus, Minus, RefreshCw, Wifi, WifiOff, Edit, Trash2, X, Settings, Upload } from 'lucide-react';
import { ThemeProvider } from './contexts/ThemeContext';
import MobileNavigation from './components/MobileNavigation';
import ThemeToggle from './components/ThemeToggle';
import ExcelUpload from './components/ExcelUpload';

const InventorySystem = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPart, setSelectedPart] = useState(null);
  const [currentUser, setCurrentUser] = useState('');
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [activeView, setActiveView] = useState('inventory');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(true);

  // Inventory Management State
  const [showAddPartModal, setShowAddPartModal] = useState(false);
  const [showEditPartModal, setShowEditPartModal] = useState(false);
  const [editingPart, setEditingPart] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [partToDelete, setPartToDelete] = useState(null);

  // Shelf Management State
  const [shelves, setShelves] = useState([]);
  const [showAddShelfModal, setShowAddShelfModal] = useState(false);
  const [showEditShelfModal, setShowEditShelfModal] = useState(false);
  const [editingShelf, setEditingShelf] = useState(null);
  const [showDeleteShelfConfirm, setShowDeleteShelfConfirm] = useState(false);
  const [shelfToDelete, setShelfToDelete] = useState(null);

  // PIN Protection State
  const [isManageUnlocked, setIsManageUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Image Modal State
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  // State for data from API
  const [inventory, setInventory] = useState([]);
  const [transactionHistory, setTransactionHistory] = useState([]);
  const [dashboardStats, setDashboardStats] = useState({});

  // Easter Egg State
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [firstClickTime, setFirstClickTime] = useState(null);
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  // Excel Upload State
  const [showExcelUpload, setShowExcelUpload] = useState(false);

  const API_BASE_URL = process.env.REACT_APP_API_URL || 
    (process.env.NODE_ENV === 'production' 
      ? 'https://wki-tool-room-system-1.onrender.com/api'
      : 'http://localhost:3001/api');

  // API helper function
  const apiCall = useCallback(async (endpoint, options = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API call failed for ${endpoint}:`, error);
      setError(`Failed to ${endpoint.includes('checkout') ? 'check out' : endpoint.includes('checkin') ? 'check in' : 'load'} data: ${error.message}`);
      throw error;
    }
  }, [API_BASE_URL]);

  // Fetch all parts
  const fetchParts = useCallback(async () => {
    try {
      setLoading(true);
      const parts = await apiCall('/parts');
      console.log('Fetched parts from API:', parts.length, 'items');
      setInventory(parts);
      setError('');
    } catch (error) {
      console.error('Failed to fetch parts:', error);
      // Keep existing data if fetch fails
      if (inventory.length === 0) {
        setError('Unable to connect to server. Please check if the backend is running.');
      }
    } finally {
      setLoading(false);
    }
  }, [apiCall, inventory.length]);

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    try {
      const transactions = await apiCall('/transactions');
      setTransactionHistory(transactions);
    } catch (error) {
      console.error('Failed to fetch transactions');
    }
  }, [apiCall]);

  // Fetch dashboard stats
  const fetchDashboardStats = useCallback(async () => {
    try {
      const stats = await apiCall('/dashboard/stats');
      setDashboardStats(stats);
    } catch (error) {
      console.error('Failed to fetch dashboard stats');
    }
  }, [apiCall]);

  // Add new part
  const addPart = useCallback(async (partData) => {
    try {
      setLoading(true);
      const newPart = await apiCall('/parts', {
        method: 'POST',
        body: JSON.stringify(partData)
      });
      setInventory(prev => [...prev, newPart]);
      setShowAddPartModal(false);
      setError('');
      fetchDashboardStats();
      return true;
    } catch (error) {
      return false;
    } finally {
      setLoading(false);
    }
  }, [apiCall, fetchDashboardStats]);

  // Update part
  const updatePart = useCallback(async (partId, partData) => {
    try {
      setLoading(true);
      const updatedPart = await apiCall(`/parts/${partId}`, {
        method: 'PUT',
        body: JSON.stringify(partData)
      });
      setInventory(prev => prev.map(part => part.id === partId ? updatedPart : part));
      setShowEditPartModal(false);
      setEditingPart(null);
      setError('');
      fetchDashboardStats();
      return true;
    } catch (error) {
      return false;
    } finally {
      setLoading(false);
    }
  }, [apiCall, fetchDashboardStats]);

  // Delete part
  const deletePart = useCallback(async (partId) => {
    try {
      setLoading(true);
      await apiCall(`/parts/${partId}`, {
        method: 'DELETE'
      });
      setInventory(prev => prev.filter(part => part.id !== partId));
      setShowDeleteConfirm(false);
      setPartToDelete(null);
      setError('');
      fetchDashboardStats();
      return true;
    } catch (error) {
      return false;
    } finally {
      setLoading(false);
    }
  }, [apiCall, fetchDashboardStats]);

  // Shelf Management Functions
  const fetchShelves = useCallback(async () => {
    try {
      const data = await apiCall('/shelves');
      setShelves(data || []);
    } catch (error) {
      console.error('Failed to fetch shelves:', error);
      setShelves([]);
    }
  }, [apiCall]);

  const addShelf = useCallback(async (shelfData) => {
    try {
      setLoading(true);
      const newShelf = await apiCall('/shelves', {
        method: 'POST',
        body: JSON.stringify(shelfData)
      });
      setShelves(prev => [...prev, newShelf]);
      setShowAddShelfModal(false);
      setError('');
      return true;
    } catch (error) {
      return false;
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  const updateShelf = useCallback(async (shelfId, shelfData) => {
    try {
      setLoading(true);
      const updatedShelf = await apiCall(`/shelves/${shelfId}`, {
        method: 'PUT',
        body: JSON.stringify(shelfData)
      });
      setShelves(prev => prev.map(shelf => 
        shelf.id === shelfId ? updatedShelf : shelf
      ));
      setShowEditShelfModal(false);
      setEditingShelf(null);
      setError('');
      return true;
    } catch (error) {
      return false;
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  const deleteShelf = useCallback(async (shelfId) => {
    try {
      setLoading(true);
      await apiCall(`/shelves/${shelfId}`, {
        method: 'DELETE'
      });
      setShelves(prev => prev.filter(shelf => shelf.id !== shelfId));
      setShowDeleteShelfConfirm(false);
      setShelfToDelete(null);
      setError('');
      return true;
    } catch (error) {
      return false;
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  // PIN Protection Functions
  const handlePinSubmit = (e) => {
    e.preventDefault();
    const correctPin = '1971';
    
    if (pinInput === correctPin) {
      setIsManageUnlocked(true);
      setShowPinModal(false);
      setPinInput('');
      setPinError('');
      setActiveView('manage');
    } else {
      setPinError('Incorrect PIN. Please try again.');
      setPinInput('');
    }
  };

  const handleManageClick = () => {
    if (isManageUnlocked) {
      setActiveView('manage');
    } else {
      setShowPinModal(true);
    }
  };

  // Excel Import Function
  const handleExcelImport = useCallback(async (partsData) => {
    try {
      setLoading(true);
      setError('');
      
      console.log('Starting Excel import with', partsData.length, 'parts');
      
      const formData = new FormData();
      // Create a dummy file for the backend (actual parsing is done on frontend)
      const blob = new Blob([''], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      formData.append('excelFile', blob, 'import.xlsx');
      formData.append('partsData', JSON.stringify(partsData));

      const response = await fetch(`${API_BASE_URL}/import/excel`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Import failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Import result:', result);
      
      if (result.success) {
        // Refresh the inventory to show imported parts
        console.log('Refreshing inventory after import...');
        await fetchParts();
        await fetchTransactions();
        await fetchDashboardStats();
        
        setShowExcelUpload(false);
        setError('');
        
        // Show success message
        console.log(`Successfully imported ${result.importedCount} parts`);
        
        return result;
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (error) {
      console.error('Excel import failed:', error);
      setError(`Import failed: ${error.message}`);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL, fetchParts, fetchTransactions, fetchDashboardStats]);

  // Initial data load
  useEffect(() => {
    fetchParts();
    fetchTransactions();
    fetchDashboardStats();
    fetchShelves();

    // Check online status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchParts, fetchTransactions, fetchDashboardStats, fetchShelves]);

  // Filter inventory based on search term
  const filteredInventory = useMemo(() => {
    if (!searchTerm) return inventory;
    
    return inventory.filter(item => 
      item.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, inventory]);

  const handlePartSelect = (part) => {
    setSelectedPart(part);
  };

  // Easter Egg Function
  const handleLogoClick = () => {
    const now = Date.now();
    
    if (logoClickCount === 0) {
      setFirstClickTime(now);
      setLogoClickCount(1);
    } else {
      const timeDiff = now - firstClickTime;
      
      if (timeDiff <= 5000) { // 5 seconds
        if (logoClickCount + 1 >= 6) {
          setShowEasterEgg(true);
          setLogoClickCount(0);
          setFirstClickTime(null);
        } else {
          setLogoClickCount(logoClickCount + 1);
        }
      } else {
        // Reset if more than 5 seconds have passed
        setFirstClickTime(now);
        setLogoClickCount(1);
      }
    }
  };

  // Get shelf image filename from shelf location
  const getShelfImageFilename = (shelfLocation) => {
    if (!shelfLocation) return null;
    
    // Handle West Rack
    if (shelfLocation.includes('West Rack')) {
      const shelfNumber = shelfLocation.match(/Shelf (\d+)/);
      if (shelfNumber && shelfNumber[1]) {
        const shelfNum = shelfNumber[1];
        return `shelfs/West_Rack_${shelfNum}.JPG`;
      }
    }
    
    // Handle North Rack (if images exist in future)
    if (shelfLocation.includes('North Rack')) {
      const shelfNumber = shelfLocation.match(/Shelf (\d+)/);
      if (shelfNumber && shelfNumber[1]) {
        return `shelfs/North_Rack_${shelfNumber[1]}.JPG`;
      }
    }
    
    // Handle South Rack (if images exist in future)  
    if (shelfLocation.includes('South Rack')) {
      const shelfNumber = shelfLocation.match(/Shelf (\d+)/);
      if (shelfNumber && shelfNumber[1]) {
        return `shelfs/South_Rack_${shelfNumber[1]}.JPG`;
      }
    }
    
    return null;
  };

  const handleCheckout = async (notes = '') => {
    if (!selectedPart || !currentUser) return;

    try {
      setLoading(true);
      const response = await apiCall(`/parts/${selectedPart.id}/checkout`, {
        method: 'POST',
        body: JSON.stringify({
          user: currentUser,
          notes: notes
        })
      });

      // Update local state
      setInventory(prev => prev.map(item => 
        item.id === selectedPart.id ? response.part : item
      ));
      
      setTransactionHistory(prev => [response.transaction, ...prev]);
      setSelectedPart(response.part);
      setShowCheckoutModal(false);
      setError('');
      
      // Refresh dashboard stats
      fetchDashboardStats();
      
    } catch (error) {
      // Error already handled in apiCall
    } finally {
      setLoading(false);
    }
  };

  const handleCheckin = async (notes = '') => {
    if (!selectedPart || !currentUser) return;

    try {
      setLoading(true);
      const response = await apiCall(`/parts/${selectedPart.id}/checkin`, {
        method: 'POST',
        body: JSON.stringify({
          user: currentUser,
          notes: notes
        })
      });

      // Update local state
      setInventory(prev => prev.map(item => 
        item.id === selectedPart.id ? response.part : item
      ));
      
      setTransactionHistory(prev => [response.transaction, ...prev]);
      setSelectedPart(response.part);
      setShowCheckinModal(false);
      setError('');
      
      // Refresh dashboard stats
      fetchDashboardStats();
      
    } catch (error) {
      // Error already handled in apiCall
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    await Promise.all([
      fetchParts(),
      fetchTransactions(),
      fetchDashboardStats(),
      fetchShelves()
    ]);
  };

  const CheckoutModal = () => {
    const [notes, setNotes] = useState('');
    const [userName, setUserName] = useState(currentUser || '');
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Check Out Part</h3>
          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Part: {selectedPart?.partNumber}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Available Quantity: {selectedPart?.quantity}</p>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Your Name *
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-red-500"
              placeholder="Enter your name"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-red-500"
              rows="3"
              placeholder="Reason for checkout, truck number, etc."
            />
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => {
                if (userName.trim()) {
                  setCurrentUser(userName.trim());
                  handleCheckout(notes);
                }
              }}
              disabled={loading || !userName.trim()}
              className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Confirm Checkout'}
            </button>
            <button
              onClick={() => setShowCheckoutModal(false)}
              disabled={loading}
              className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  const CheckinModal = () => {
    const [notes, setNotes] = useState('');
    const [userName, setUserName] = useState(currentUser || '');
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Check In Part</h3>
          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Part: {selectedPart?.partNumber}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Checked out by: {selectedPart?.checkedOutBy}</p>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Your Name *
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-red-500"
              placeholder="Enter your name"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-red-500"
              rows="3"
              placeholder="Job completed, condition notes, etc."
            />
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => {
                if (userName.trim()) {
                  setCurrentUser(userName.trim());
                  handleCheckin(notes);
                }
              }}
              disabled={loading || !userName.trim()}
              className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Confirm Check In'}
            </button>
            <button
              onClick={() => setShowCheckinModal(false)}
              disabled={loading}
              className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Easter Egg Modal
  const EasterEggModal = () => {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 w-full max-w-md mx-4 text-center">
          <div className="mb-6">
            <div className="text-6xl mb-4">🚛</div>
            <h3 className="text-2xl font-bold mb-2 text-gray-900 dark:text-gray-100">
              ADAMS 2025
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              You found the easter egg!
            </p>
          </div>
          <button
            onClick={() => setShowEasterEgg(false)}
            className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  // Add Part Modal
  const AddPartModal = () => {
    const [formData, setFormData] = useState({
      partNumber: '',
      description: '',
      shelf: '',
      category: '',
      quantity: 1,
      minQuantity: 1
    });

    const handleSubmit = async (e) => {
      e.preventDefault();
      const success = await addPart(formData);
      if (success) {
        setFormData({
          partNumber: '',
          description: '',
          shelf: '',
          category: '',
          quantity: 1,
          minQuantity: 1
        });
      }
    };

    const categories = ['Engine Parts', 'Brake System', 'Transmission', 'Electrical', 'Fuel System', 'Cooling System', 'Steering', 'Body Parts'];

    const shelfLocations = [
      // West Rack (all shelves 1-12)
      'West Rack - Shelf 1', 'West Rack - Shelf 2', 'West Rack - Shelf 3', 'West Rack - Shelf 4', 
      'West Rack - Shelf 5', 'West Rack - Shelf 6', 'West Rack - Shelf 7', 'West Rack - Shelf 8', 
      'West Rack - Shelf 9', 'West Rack - Shelf 10', 'West Rack - Shelf 11', 'West Rack - Shelf 12',
      // North Rack  
      'North Rack - Shelf 1', 'North Rack - Shelf 2', 'North Rack - Shelf 3', 'North Rack - Shelf 4',
      'North Rack - Shelf 5', 'North Rack - Shelf 6', 'North Rack - Shelf 8', 'North Rack - Shelf 9',
      // South Rack
      'South Rack - Shelf 1', 'South Rack - Shelf 2', 'South Rack - Shelf 3', 'South Rack - Shelf 4',
      'South Rack - Shelf 5', 'South Rack - Shelf 6', 'South Rack - Shelf 8', 'South Rack - Shelf 9',
      'South Rack - Shelf 10', 'South Rack - Shelf 11', 'South Rack - Shelf 12', 'South Rack - Shelf 13',
      'South Rack - Shelf 14', 'South Rack - Shelf 15'
    ];

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 max-h-screen overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Add New Part</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Part Number*</label>
              <input
                type="text"
                required
                value={formData.partNumber}
                onChange={(e) => setFormData({...formData, partNumber: e.target.value})}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="e.g., T800-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description*</label>
              <input
                type="text"
                required
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="e.g., Engine Oil Filter"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shelf Location*</label>
              <select
                required
                value={formData.shelf}
                onChange={(e) => setFormData({...formData, shelf: e.target.value})}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                <option value="">Select Shelf Location</option>
                {shelfLocations.map(location => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category*</label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                <option value="">Select Category</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input
                  type="number"
                  min="0"
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 0})}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={formData.minQuantity}
                  onChange={(e) => setFormData({...formData, minQuantity: parseInt(e.target.value) || 1})}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
            </div>
            <div className="flex space-x-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Add Part'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddPartModal(false)}
                disabled={loading}
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Edit Part Modal
  const EditPartModal = () => {
    const [formData, setFormData] = useState({
      partNumber: editingPart?.partNumber || '',
      description: editingPart?.description || '',
      shelf: editingPart?.shelf || '',
      category: editingPart?.category || '',
      quantity: editingPart?.quantity || 1,
      minQuantity: editingPart?.minQuantity || 1
    });

    useEffect(() => {
      if (editingPart) {
        setFormData({
          partNumber: editingPart.partNumber,
          description: editingPart.description,
          shelf: editingPart.shelf,
          category: editingPart.category,
          quantity: editingPart.quantity,
          minQuantity: editingPart.minQuantity
        });
      }
    }, [editingPart]);

    const handleSubmit = async (e) => {
      e.preventDefault();
      const success = await updatePart(editingPart.id, formData);
      if (success) {
        setEditingPart(null);
      }
    };

    const categories = ['Engine Parts', 'Brake System', 'Transmission', 'Electrical', 'Fuel System', 'Cooling System', 'Steering', 'Body Parts'];

    const shelfLocations = [
      // West Rack (all shelves 1-12)
      'West Rack - Shelf 1', 'West Rack - Shelf 2', 'West Rack - Shelf 3', 'West Rack - Shelf 4', 
      'West Rack - Shelf 5', 'West Rack - Shelf 6', 'West Rack - Shelf 7', 'West Rack - Shelf 8', 
      'West Rack - Shelf 9', 'West Rack - Shelf 10', 'West Rack - Shelf 11', 'West Rack - Shelf 12',
      // North Rack  
      'North Rack - Shelf 1', 'North Rack - Shelf 2', 'North Rack - Shelf 3', 'North Rack - Shelf 4',
      'North Rack - Shelf 5', 'North Rack - Shelf 6', 'North Rack - Shelf 8', 'North Rack - Shelf 9',
      // South Rack
      'South Rack - Shelf 1', 'South Rack - Shelf 2', 'South Rack - Shelf 3', 'South Rack - Shelf 4',
      'South Rack - Shelf 5', 'South Rack - Shelf 6', 'South Rack - Shelf 8', 'South Rack - Shelf 9',
      'South Rack - Shelf 10', 'South Rack - Shelf 11', 'South Rack - Shelf 12', 'South Rack - Shelf 13',
      'South Rack - Shelf 14', 'South Rack - Shelf 15'
    ];

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 max-h-screen overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Edit Part</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Part Number*</label>
              <input
                type="text"
                required
                value={formData.partNumber}
                onChange={(e) => setFormData({...formData, partNumber: e.target.value})}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description*</label>
              <input
                type="text"
                required
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shelf Location*</label>
              <select
                required
                value={formData.shelf}
                onChange={(e) => setFormData({...formData, shelf: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                <option value="">Select Shelf Location</option>
                {shelfLocations.map(location => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category*</label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                <option value="">Select Category</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input
                  type="number"
                  min="0"
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 0})}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={formData.minQuantity}
                  onChange={(e) => setFormData({...formData, minQuantity: parseInt(e.target.value) || 1})}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
            </div>
            <div className="flex space-x-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Update Part'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEditPartModal(false);
                  setEditingPart(null);
                }}
                disabled={loading}
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Delete Confirmation Modal
  const DeleteConfirmModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4 text-red-600">Delete Part</h3>
        <p className="text-gray-700 mb-6">
          Are you sure you want to delete <strong>{partToDelete?.partNumber}</strong>?
          <br />
          <span className="text-sm text-gray-500">This action cannot be undone.</span>
        </p>
        <div className="flex space-x-3">
          <button
            onClick={() => deletePart(partToDelete.id)}
            disabled={loading}
            className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Delete'}
          </button>
          <button
            onClick={() => {
              setShowDeleteConfirm(false);
              setPartToDelete(null);
            }}
            disabled={loading}
            className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  // Add Shelf Modal
  const AddShelfModal = () => {
    const [formData, setFormData] = useState({
      name: '',
      location: '',
      description: '',
      image: null
    });

    const handleImageChange = (e) => {
      const file = e.target.files[0];
      if (file) {
        setFormData({...formData, image: file});
      }
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      
      const shelfData = new FormData();
      shelfData.append('name', formData.name);
      shelfData.append('location', formData.location);
      shelfData.append('description', formData.description);
      if (formData.image) {
        shelfData.append('image', formData.image);
      }

      const success = await addShelf(shelfData);
      if (success) {
        setFormData({ name: '', location: '', description: '', image: null });
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-screen overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4">Add New Shelf</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shelf Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="e.g., A-1, B-2, etc."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
              <input
                type="text"
                required
                value={formData.location}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="e.g., Tool Room North Wall"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                rows="3"
                placeholder="Optional description of shelf contents or location details"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shelf Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
              {formData.image && (
                <p className="text-sm text-gray-500 mt-1">Selected: {formData.image.name}</p>
              )}
            </div>
            <div className="flex space-x-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Add Shelf'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddShelfModal(false)}
                disabled={loading}
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Edit Shelf Modal
  const EditShelfModal = () => {
    const [formData, setFormData] = useState({
      name: editingShelf?.name || '',
      location: editingShelf?.location || '',
      description: editingShelf?.description || '',
      image: null,
      currentImage: editingShelf?.imagePath || ''
    });

    const handleImageChange = (e) => {
      const file = e.target.files[0];
      if (file) {
        setFormData({...formData, image: file});
      }
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      
      const shelfData = new FormData();
      shelfData.append('name', formData.name);
      shelfData.append('location', formData.location);
      shelfData.append('description', formData.description);
      if (formData.image) {
        shelfData.append('image', formData.image);
      }

      const success = await updateShelf(editingShelf.id, shelfData);
      if (success) {
        setFormData({ name: '', location: '', description: '', image: null, currentImage: '' });
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-screen overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4">Edit Shelf</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shelf Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="e.g., A-1, B-2, etc."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
              <input
                type="text"
                required
                value={formData.location}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="e.g., Tool Room North Wall"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                rows="3"
                placeholder="Optional description of shelf contents or location details"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shelf Image</label>
              {formData.currentImage && (
                <div className="mb-2">
                  <img 
                    src={formData.currentImage} 
                    alt="Current shelf" 
                    className="w-20 h-20 object-cover rounded border"
                  />
                  <p className="text-sm text-gray-500">Current image</p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
              {formData.image && (
                <p className="text-sm text-gray-500 mt-1">New image: {formData.image.name}</p>
              )}
            </div>
            <div className="flex space-x-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEditShelfModal(false);
                  setEditingShelf(null);
                }}
                disabled={loading}
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Delete Shelf Confirmation Modal
  const DeleteShelfConfirmModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4 text-red-600">Delete Shelf</h3>
        <p className="text-gray-700 mb-6">
          Are you sure you want to delete shelf <strong>{shelfToDelete?.name}</strong>?
          <br />
          <span className="text-sm text-gray-500">This action cannot be undone.</span>
        </p>
        <div className="flex space-x-3">
          <button
            onClick={() => deleteShelf(shelfToDelete.id)}
            disabled={loading}
            className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Delete'}
          </button>
          <button
            onClick={() => {
              setShowDeleteShelfConfirm(false);
              setShelfToDelete(null);
            }}
            disabled={loading}
            className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  // PIN Entry Modal
  const PinModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4 text-red-600">Management Access Required</h3>
        <p className="text-gray-700 mb-4">
          Please enter the management PIN to access the manage page.
        </p>
        <form onSubmit={handlePinSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-center text-lg tracking-widest"
              placeholder="••••"
              maxLength="4"
              autoFocus
            />
            {pinError && (
              <p className="text-sm text-red-600 mt-1">{pinError}</p>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={pinInput.length !== 4}
              className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Submit
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPinModal(false);
                setPinInput('');
                setPinError('');
              }}
              className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const TransactionList = () => (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Recent Transactions</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchTransactions}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-gray-600"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <History className="w-6 h-6 text-gray-400" />
        </div>
      </div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {transactionHistory.map((transaction) => (
          <div key={transaction.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  {transaction.action === 'checkout' ? (
                    <Minus className="w-4 h-4 text-red-500" />
                  ) : (
                    <Plus className="w-4 h-4 text-green-500" />
                  )}
                  <span className="font-medium">{transaction.partNumber}</span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    transaction.action === 'checkout' 
                      ? 'bg-red-100 text-red-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {transaction.action}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-1">User: {transaction.user}</p>
                <p className="text-xs text-gray-500">
                  {new Date(transaction.timestamp).toLocaleString()}
                </p>
                {transaction.quantityBefore !== undefined && (
                  <p className="text-xs text-gray-500">
                    Quantity: {transaction.quantityBefore} → {transaction.quantityAfter}
                  </p>
                )}
                {transaction.notes && (
                  <p className="text-sm text-gray-700 mt-2 italic">"{transaction.notes}"</p>
                )}
              </div>
            </div>
          </div>
        ))}
        {transactionHistory.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No transactions recorded yet.</p>
          </div>
        )}
      </div>
    </div>
  );

  // Manage Inventory View
  const ManageInventoryView = () => (
    <div className="space-y-6">
      {/* Add Part Button */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Inventory Management</h2>
            <p className="text-gray-600">Add, edit, or remove parts from the inventory</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowExcelUpload(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2 transition-colors"
            >
              <Upload className="w-5 h-5" />
              <span>Import Excel</span>
            </button>
            <button
              onClick={() => setShowAddPartModal(true)}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex items-center space-x-2 transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>Add New Part</span>
            </button>
          </div>
        </div>
      </div>

      {/* Parts Management Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">All Parts</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Part Info</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {inventory.map((part) => (
                <tr key={part.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{part.partNumber}</div>
                      <div className="text-sm text-gray-500">{part.description}</div>
                      <div className="text-xs text-gray-400">{part.category}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 text-gray-400 mr-1" />
                      <span className="text-sm text-gray-900">{part.shelf}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {part.quantity}
                      {part.quantity <= part.minQuantity && (
                        <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Low Stock
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">Min: {part.minQuantity}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      part.status === 'available' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {part.status === 'available' ? (
                        <>
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Available
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3 mr-1" />
                          Checked Out
                        </>
                      )}
                    </span>
                    {part.status === 'checked_out' && (
                      <div className="text-xs text-gray-500 mt-1">
                        by {part.checkedOutBy}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          setEditingPart(part);
                          setShowEditPartModal(true);
                        }}
                        className="text-red-600 hover:text-red-900 p-1 rounded"
                        title="Edit Part"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setPartToDelete(part);
                          setShowDeleteConfirm(true);
                        }}
                        className="text-red-600 hover:text-red-900 p-1 rounded"
                        title="Delete Part"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {inventory.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No parts in inventory yet.</p>
              <button
                onClick={() => setShowAddPartModal(true)}
                className="mt-2 text-red-600 hover:text-red-800"
              >
                Add your first part
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Shelf Management Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Shelf Management</h2>
            <p className="text-gray-600">Manage shelf locations and images</p>
          </div>
          <button
            onClick={() => setShowAddShelfModal(true)}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Add New Shelf</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.isArray(shelves) && shelves.map((shelf) => (
            <div key={shelf.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              {shelf.imagePath && (
                <img 
                  src={shelf.imagePath} 
                  alt={shelf.name}
                  className="w-full h-32 object-cover rounded-lg mb-3"
                />
              )}
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900">{shelf.name}</h3>
                <p className="text-sm text-gray-600">{shelf.location}</p>
                {shelf.description && (
                  <p className="text-xs text-gray-500">{shelf.description}</p>
                )}
                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs text-gray-400">
                    {inventory.filter(part => part.shelf === shelf.name).length} parts
                  </span>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => {
                        setEditingShelf(shelf);
                        setShowEditShelfModal(true);
                      }}
                      className="p-1 text-gray-400 hover:text-red-600 rounded"
                      title="Edit Shelf"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setShelfToDelete(shelf);
                        setShowDeleteShelfConfirm(true);
                      }}
                      className="p-1 text-gray-400 hover:text-red-600 rounded"
                      title="Delete Shelf"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {(!Array.isArray(shelves) || shelves.length === 0) && (
            <div className="col-span-full text-center py-8 text-gray-500">
              <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No shelves configured yet.</p>
              <button
                onClick={() => setShowAddShelfModal(true)}
                className="mt-2 text-red-600 hover:text-red-800"
              >
                Add your first shelf
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Layout Reference View
  const LayoutReferenceView = () => {
    const layoutImages = [
      {
        id: 1,
        title: "West Rack - Section 1",
        filename: "West_Rack.png",
        section: "Section 1",
        description: "Storage rack system on the west side"
      },
      {
        id: 2,
        title: "South Rack - Section 2",
        filename: "South_Rack.png",
        section: "Section 2",
        description: "Storage rack system on the south side"
      },
      {
        id: 3,
        title: "North Rack - Section 4",
        filename: "North_Rack.png",
        section: "Section 4",
        description: "Main storage rack on the north side of the tool room"
      },
      {
        id: 4,
        title: "West Facing Hanging Wall - Section 5",
        filename: "W_Facing_Hanging_Wall.png",
        section: "Section 5",
        description: "Wall-mounted storage system on the west side"
      },
      {
        id: 5,
        title: "East Facing Hanging Wall - Section 6",
        filename: "E_Facing_Hanging_Wall.png",
        section: "Section 6",
        description: "Wall-mounted storage for frequently used tools and parts"
      },
      {
        id: 6,
        title: "Snap-On East - Section 3",
        filename: "SnapOn_East.png",
        section: "Section 3",
        description: "Snap-On branded storage unit on the east side"
      },
      {
        id: 7,
        title: "East Tool Room",
        filename: "E_ToolRM.png",
        section: "Overview",
        description: "Overview of the east side tool room area"
      },
      {
        id: 8,
        title: "West Tool Room",
        filename: "W_ToolRM.png",
        section: "Overview",
        description: "Overview of the west side tool room area"
      },
      {
        id: 9,
        title: "AC Machines Area",
        filename: "AC_Machines.png",
        section: "Equipment",
        description: "Air conditioning and HVAC equipment storage area"
      },
      {
        id: 10,
        title: "East Literature Wall",
        filename: "E_Literature_Wall.png",
        section: "Reference",
        description: "Technical manuals and documentation storage"
      },
      {
        id: 11,
        title: "Welder & Plasma Cutter",
        filename: "Welder_Plasma.png",
        section: "Equipment",
        description: "Welding and plasma cutting equipment station"
      },
      {
        id: 12,
        title: "Module Cabinet East - Section 3",
        filename: "Module_Cabinet_East.png",
        section: "Section 3",
        description: "Modular cabinet system for organized storage"
      },
      {
        id: 13,
        title: "Airgas Cabinet",
        filename: "Airgas_Cab.png",
        section: "Equipment",
        description: "Airgas welding supplies and gas cylinder storage"
      },
      {
        id: 14,
        title: "CAT Detroit Parts Box",
        filename: "CAT_Detroit_Box.png",
        section: "Equipment",
        description: "Caterpillar and Detroit diesel parts storage container"
      },
      {
        id: 15,
        title: "MX Fuel Kit Storage",
        filename: "MX_Fuel_Kit.png",
        section: "Equipment",
        description: "Milwaukee MX Fuel battery tools and equipment"
      }
    ];

    const handleImageClick = (layout) => {
      setSelectedImage(layout);
      setShowImageModal(true);
    };

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-3">
            <MapPin className="w-8 h-8 text-red-600" />
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">Tool Room Layout Reference</h2>
              <p className="text-gray-600">Visual guide to all storage locations and rack systems</p>
            </div>
          </div>
        </div>

        {/* Layout Images Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {layoutImages
            .sort((a, b) => {
              // Extract section number from "Section X" string
              const sectionA = parseInt(a.section.split(' ')[1]);
              const sectionB = parseInt(b.section.split(' ')[1]);
              return sectionA - sectionB;
            })
            .map((layout) => (
            <div key={layout.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
              <div 
                className="aspect-video bg-gray-100 flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors"
                onClick={() => handleImageClick(layout)}
              >
                <img 
                  src={`/${layout.filename}`}
                  alt={layout.title}
                  className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 bg-gray-100" style={{display: 'none'}}>
                  <Package className="w-12 h-12 mb-2 opacity-50" />
                  <p className="text-sm">Image not available</p>
                  <p className="text-xs text-gray-400">{layout.filename}</p>
                </div>
              </div>
              <div className="p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{layout.title}</h3>
                <p className="text-sm text-gray-600 mb-3">{layout.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Layout Guide</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Wall-Mounted Storage:</h4>
              <ul className="space-y-1 text-gray-600">
                <li>• East & West Hanging Walls - Quick access tools</li>
                <li>• Organized by frequency of use</li>
                <li>• Clear labeling for easy identification</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Rack Systems:</h4>
              <ul className="space-y-1 text-gray-600">
                <li>• North, West, South Racks - Bulk storage</li>
                <li>• Snap-On East - Premium tool storage</li>
                <li>• Module Cabinet - Organized small parts</li>
              </ul>
            </div>
          </div>
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>Tip:</strong> Use this reference when locating parts or assigning new storage locations. 
              Each rack system is designed for specific types of tools and parts based on size, weight, and usage frequency.
            </p>
          </div>
        </div>

        {/* Shelfs-Drawers Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-3 mb-6">
            <Package className="w-8 h-8 text-blue-600" />
            <div>
              <h3 className="text-xl font-semibold text-gray-900">Shelfs & Drawers Detail</h3>
              <p className="text-gray-600">Detailed shelf and drawer images organized by rack and storage area</p>
            </div>
          </div>

          <div className="space-y-8">
            {/* West Rack Shelfs */}
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                West Rack Shelfs
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({length: 12}, (_, i) => i + 1).map(shelfNum => (
                  <div key={`west-${shelfNum}`} className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-4 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors">
                    <div className="aspect-square bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                    <h5 className="font-medium text-gray-900">West Rack {shelfNum}</h5>
                    <p className="text-xs text-gray-500 mt-1">Image placeholder</p>
                    <div className="mt-2 px-2 py-1 bg-gray-200 rounded text-xs text-gray-600">
                      {`/shelfs/West/West_Rack_${shelfNum}.JPG`}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* North Rack Shelfs */}
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                North Rack Shelfs
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({length: 10}, (_, i) => i + 1).map(shelfNum => (
                  <div key={`north-${shelfNum}`} className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-4 text-center hover:border-green-400 hover:bg-green-50 transition-colors">
                    <div className="aspect-square bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                    <h5 className="font-medium text-gray-900">North Rack {shelfNum}</h5>
                    <p className="text-xs text-gray-500 mt-1">Image placeholder</p>
                    <div className="mt-2 px-2 py-1 bg-gray-200 rounded text-xs text-gray-600">
                      {`/shelfs/North/North_Rack_${shelfNum}.JPG`}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* South Rack Shelfs */}
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <div className="w-3 h-3 bg-orange-500 rounded-full mr-3"></div>
                South Rack Shelfs
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({length: 8}, (_, i) => i + 1).map(shelfNum => (
                  <div key={`south-${shelfNum}`} className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-4 text-center hover:border-orange-400 hover:bg-orange-50 transition-colors">
                    <div className="aspect-square bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                    <h5 className="font-medium text-gray-900">South Rack {shelfNum}</h5>
                    <p className="text-xs text-gray-500 mt-1">Image placeholder</p>
                    <div className="mt-2 px-2 py-1 bg-gray-200 rounded text-xs text-gray-600">
                      {`/shelfs/South/South_Rack_${shelfNum}.JPG`}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Module Cabinet Drawers */}
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <div className="w-3 h-3 bg-purple-500 rounded-full mr-3"></div>
                Module Cabinet Drawers
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({length: 20}, (_, i) => i + 1).map(drawerNum => (
                  <div key={`module-${drawerNum}`} className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-4 text-center hover:border-purple-400 hover:bg-purple-50 transition-colors">
                    <div className="aspect-square bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                    <h5 className="font-medium text-gray-900">Module Drawer {drawerNum}</h5>
                    <p className="text-xs text-gray-500 mt-1">Image placeholder</p>
                    <div className="mt-2 px-2 py-1 bg-gray-200 rounded text-xs text-gray-600">
                      {`/shelfs/Module/Module_Drawer_${drawerNum}.JPG`}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CAT Parts Storage */}
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <div className="w-3 h-3 bg-yellow-500 rounded-full mr-3"></div>
                CAT Parts Storage
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({length: 6}, (_, i) => i + 1).map(boxNum => (
                  <div key={`cat-${boxNum}`} className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-4 text-center hover:border-yellow-400 hover:bg-yellow-50 transition-colors">
                    <div className="aspect-square bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                    <h5 className="font-medium text-gray-900">CAT Box {boxNum}</h5>
                    <p className="text-xs text-gray-500 mt-1">Image placeholder</p>
                    <div className="mt-2 px-2 py-1 bg-gray-200 rounded text-xs text-gray-600">
                      {`/shelfs/Cat/CAT_Box_${boxNum}.JPG`}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Detroit Parts Storage */}
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <div className="w-3 h-3 bg-red-500 rounded-full mr-3"></div>
                Detroit Parts Storage
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({length: 6}, (_, i) => i + 1).map(boxNum => (
                  <div key={`detroit-${boxNum}`} className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-4 text-center hover:border-red-400 hover:bg-red-50 transition-colors">
                    <div className="aspect-square bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                    <h5 className="font-medium text-gray-900">Detroit Box {boxNum}</h5>
                    <p className="text-xs text-gray-500 mt-1">Image placeholder</p>
                    <div className="mt-2 px-2 py-1 bg-gray-200 rounded text-xs text-gray-600">
                      {`/shelfs/Detroit/Detroit_Box_${boxNum}.JPG`}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* MX Tools Storage */}
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <div className="w-3 h-3 bg-red-600 rounded-full mr-3"></div>
                MX Tools Storage
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({length: 4}, (_, i) => i + 1).map(slotNum => (
                  <div key={`mx-${slotNum}`} className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-4 text-center hover:border-red-400 hover:bg-red-50 transition-colors">
                    <div className="aspect-square bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                    <h5 className="font-medium text-gray-900">MX Slot {slotNum}</h5>
                    <p className="text-xs text-gray-500 mt-1">Image placeholder</p>
                    <div className="mt-2 px-2 py-1 bg-gray-200 rounded text-xs text-gray-600">
                      {`/shelfs/MX/MX_Slot_${slotNum}.JPG`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Future Enhancement Note */}
          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h5 className="font-medium text-blue-900">Future Enhancement</h5>
                <p className="text-sm text-blue-700 mt-1">
                  When parts are looked up, the corresponding shelf/drawer image will be automatically displayed 
                  based on the rack and shelf location data in your inventory. This will help locate parts quickly 
                  by showing the exact drawer or shelf where each part is stored.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Image Modal Component
  const ImageModal = () => {
    if (!showImageModal || !selectedImage) return null;

    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="relative max-w-5xl max-h-[90vh] w-full">
          <button
            onClick={() => setShowImageModal(false)}
            className="absolute top-4 right-4 z-10 bg-red-600 hover:bg-red-700 text-white rounded-full p-2 transition-colors duration-300 shadow-lg"
          >
            <X className="w-6 h-6" />
          </button>
          
          <div className="bg-white rounded-lg shadow-2xl overflow-hidden">
            <div className="aspect-video bg-gray-100 flex items-center justify-center">
              <img
                src={`/${selectedImage.filename}`}
                alt={selectedImage.title}
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="hidden w-full h-full items-center justify-center">
                <div className="text-center text-gray-500">
                  <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-xl">Image not available</p>
                  <p className="text-sm text-gray-400 mt-2">{selectedImage.filename}</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 bg-white">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{selectedImage.title}</h3>
              <p className="text-gray-700 mb-4">{selectedImage.description}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-300">
      {/* Header */}
      <div className="bg-red-700 dark:bg-red-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img 
                src="/WKI_INV.png" 
                alt="WKI Logo" 
                className="w-16 h-16 sm:w-24 sm:h-24 lg:w-32 lg:h-32 cursor-pointer" 
                onClick={handleLogoClick}
              />
              <div className="hidden sm:block">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">WKI Tool Room</h1>
                <p className="text-red-100 text-sm lg:text-base">Inventory Management System</p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-2 lg:space-x-4">
              {/* Connection Status */}
              <div className="flex items-center space-x-1 text-red-100">
                {isOnline ? (
                  <Wifi className="w-4 h-4 text-green-300" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-300" />
                )}
                <span className="text-xs lg:text-sm">
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>

              {/* Refresh Button */}
              <button
                onClick={refreshData}
                disabled={loading}
                className="p-2 bg-white/10 rounded-lg hover:bg-white/20 disabled:opacity-50 transition-colors"
                title="Refresh Data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <ThemeToggle className="text-white" />
              
              <div className="flex space-x-1 lg:space-x-2">
                <button
                  onClick={() => setActiveView('inventory')}
                  className={`px-3 lg:px-4 py-2 rounded-lg transition-colors ${
                    activeView === 'inventory' 
                      ? 'bg-white text-red-700 font-medium' 
                      : 'text-red-100 hover:bg-red-600 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Package className="w-4 h-4 lg:w-5 lg:h-5" />
                    <span className="hidden lg:inline">Inventory</span>
                  </div>
                </button>
                
                <button
                  onClick={() => setActiveView('history')}
                  className={`px-3 lg:px-4 py-2 rounded-lg transition-colors ${
                    activeView === 'history' 
                      ? 'bg-white text-red-700 font-medium' 
                      : 'text-red-100 hover:bg-red-600 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <History className="w-4 h-4 lg:w-5 lg:h-5" />
                    <span className="hidden lg:inline">History</span>
                  </div>
                </button>
                
                <button
                  onClick={() => setActiveView('layout')}
                  className={`px-3 lg:px-4 py-2 rounded-lg transition-colors ${
                    activeView === 'layout' 
                      ? 'bg-white text-red-700 font-medium' 
                      : 'text-red-100 hover:bg-red-600 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <MapPin className="w-4 h-4 lg:w-5 lg:h-5" />
                    <span className="hidden lg:inline">Layout</span>
                  </div>
                </button>
                
                <button
                  onClick={handleManageClick}
                  className={`px-3 lg:px-4 py-2 rounded-lg transition-colors ${
                    activeView === 'manage' 
                      ? 'bg-white text-red-700 font-medium' 
                      : 'text-red-100 hover:bg-red-600 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Settings className="w-4 h-4 lg:w-5 lg:h-5" />
                    <span className="hidden lg:inline">Manage</span>
                    {!isManageUnlocked && (
                      <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* Mobile Navigation */}
            <div className="flex items-center space-x-3 md:hidden">
              {/* Connection Status */}
              <div className="flex items-center space-x-1">
                {isOnline ? (
                  <Wifi className="w-4 h-4 text-green-300" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-300" />
                )}
              </div>

              {/* Refresh Button */}
              <button
                onClick={refreshData}
                disabled={loading}
                className="p-1 bg-white/10 rounded-lg hover:bg-white/20 disabled:opacity-50 transition-colors"
                title="Refresh Data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <ThemeToggle size="sm" />
              <MobileNavigation 
                activeView={activeView}
                setActiveView={setActiveView}
                isManageUnlocked={isManageUnlocked}
                onManageClick={handleManageClick}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Search and Controls */}
        {(activeView === 'inventory' || activeView === 'manage') && (
          <div className="mb-6 space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              </div>
              <input
                type="text"
                placeholder="Search parts by number, description, or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <X className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                </button>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0 sm:space-x-4">
              {/* Search controls can go here if needed */}
            </div>
          </div>
        )}

        {/* Error Message */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 py-2">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              <span>{error}</span>
              <button
                onClick={() => setError('')}
                className="ml-auto text-red-700 hover:text-red-900"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        {activeView === 'inventory' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Parts List Panel */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Parts Inventory</h2>
              
              {/* Loading indicator */}
              {loading && (
                <div className="text-center py-4">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-red-500" />
                  <p className="text-gray-500 dark:text-gray-400 mt-2">Loading parts...</p>
                </div>
              )}

              {/* Parts List */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredInventory.length === 0 && !loading ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No parts found matching your search.</p>
                  </div>
                ) : (
                  filteredInventory.map((part) => (
                    <div
                      key={part.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                        selectedPart?.id === part.id
                          ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-red-300 dark:hover:border-red-500'
                      }`}
                      onClick={() => handlePartSelect(part)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{part.partNumber}</h3>
                          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{part.description}</p>
                          <div className="flex items-center mt-2 text-sm text-gray-500 dark:text-gray-400">
                            <MapPin className="w-4 h-4 mr-1" />
                            <span>Shelf: {part.shelf}</span>
                            <span className="ml-4">Qty: {part.quantity}</span>
                            {part.quantity <= part.minQuantity && (
                              <span className="ml-2 text-orange-600 font-medium">Low Stock!</span>
                            )}
                          </div>
                          {part.status === 'checked_out' && (
                            <div className="flex items-center mt-1 text-sm text-red-600">
                              <AlertCircle className="w-4 h-4 mr-1" />
                              <span>Checked out by {part.checkedOutBy}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end space-y-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            part.status === 'available' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          }`}>
                            {part.status === 'available' ? 'Available' : 'Checked Out'}
                          </span>
                          <span className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs px-2 py-1 rounded">
                            {part.category}
                          </span>
                          <div className="flex space-x-1 mt-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPart(part);
                                setShowEditPartModal(true);
                              }}
                              className="p-1 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 rounded"
                              title="Edit Part"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Part Details and Actions Panel */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              {selectedPart ? (
                <div>
                  <div className="border-b border-gray-200 pb-4 mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                      {selectedPart.partNumber}
                    </h2>
                    <p className="text-gray-600 text-lg">{selectedPart.description}</p>
                    <div className="flex items-center mt-3 text-red-600">
                      <MapPin className="w-5 h-5 mr-2" />
                      <span className="font-semibold">
                        Located on Shelf: {selectedPart.shelf}
                      </span>
                    </div>
                    
                    {/* Shelf Image */}
                    {getShelfImageFilename(selectedPart.shelf) && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Shelf Location Photo:</h4>
                        <div 
                          className="relative cursor-pointer group w-full"
                          onClick={() => {
                            setSelectedImage({
                              filename: getShelfImageFilename(selectedPart.shelf),
                              title: `${selectedPart.shelf} Photo`
                            });
                            setShowImageModal(true);
                          }}
                        >
                          <img
                            src={`/${getShelfImageFilename(selectedPart.shelf)}`}
                            alt={`${selectedPart.shelf} Photo`}
                            className="w-full h-48 object-cover rounded-lg shadow-md transition-transform duration-200 group-hover:scale-105"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded-lg transition-all duration-200 flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <div className="bg-white bg-opacity-90 rounded-full p-2">
                                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Click to enlarge</p>
                      </div>
                    )}
                    
                    <div className="flex items-center mt-2">
                      <Package className="w-5 h-5 mr-2 text-gray-500" />
                      <span>Quantity Available: {selectedPart.quantity}</span>
                      {selectedPart.quantity <= selectedPart.minQuantity && (
                        <span className="ml-2 text-orange-600 font-medium">
                          (Low Stock - Min: {selectedPart.minQuantity})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status and Actions */}
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Current Status
                    </h3>
                    <div className={`p-4 rounded-lg ${
                      selectedPart.status === 'available' ? 'bg-green-50' : 'bg-red-50'
                    }`}>
                      <div className="flex items-center mb-2">
                        {selectedPart.status === 'available' ? (
                          <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                        )}
                        <span className={`font-medium ${
                          selectedPart.status === 'available' ? 'text-green-800' : 'text-red-800'
                        }`}>
                          {selectedPart.status === 'available' ? 'Available for Checkout' : 'Currently Checked Out'}
                        </span>
                      </div>
                      {selectedPart.status === 'checked_out' && (
                        <div className="text-sm text-gray-600">
                          <p>Checked out by: {selectedPart.checkedOutBy}</p>
                          <p>Date: {new Date(selectedPart.checkedOutDate).toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="mt-4 space-y-2">
                      {selectedPart.status === 'available' ? (
                        <button
                          onClick={() => setShowCheckoutModal(true)}
                          disabled={selectedPart.quantity <= 0 || loading}
                          className="w-full bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          {selectedPart.quantity <= 0 ? 'Out of stock' : 'Check Out Part'}
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowCheckinModal(true)}
                          disabled={loading}
                          className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          Check In Part
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Shelf Location Reference */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      Shelf Location
                    </h3>
                    <div className="border rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 aspect-video flex items-center justify-center">
                      {getShelfImageFilename(selectedPart.shelf) ? (
                        <div 
                          className="relative cursor-pointer group w-full h-full"
                          onClick={() => {
                            setSelectedImage({
                              filename: getShelfImageFilename(selectedPart.shelf),
                              title: `${selectedPart.shelf} Photo`
                            });
                            setShowImageModal(true);
                          }}
                        >
                          <img
                            src={`/${getShelfImageFilename(selectedPart.shelf)}`}
                            alt={`${selectedPart.shelf} Photo`}
                            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <div className="bg-white bg-opacity-90 rounded-full p-2">
                                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                </svg>
                              </div>
                            </div>
                          </div>
                          <div className="hidden w-full h-full items-center justify-center">
                            <div className="text-center">
                              <Package className="w-16 h-16 mx-auto mb-3 text-gray-400" />
                              <p className="text-gray-500 dark:text-gray-400 font-medium">Shelf {selectedPart.shelf}</p>
                              <p className="text-sm text-gray-400 dark:text-gray-500">Photo Not Available</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center">
                          <Package className="w-16 h-16 mx-auto mb-3 text-gray-400" />
                          <p className="text-gray-500 dark:text-gray-400 font-medium">Shelf {selectedPart.shelf}</p>
                          <p className="text-sm text-gray-400 dark:text-gray-500">Photo Not Available</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16">
                  <Package className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Select a Part
                  </h3>
                  <p className="text-gray-500">
                    Search and click on a part to view its details and manage checkout status.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : activeView === 'history' ? (
          <TransactionList />
        ) : activeView === 'layout' ? (
          <LayoutReferenceView />
        ) : activeView === 'manage' && isManageUnlocked ? (
          <ManageInventoryView />
        ) : activeView === 'manage' && !isManageUnlocked ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <Settings className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Management Access Required</h3>
            <p className="text-gray-600 mb-4">You need to enter the correct PIN to access the management features.</p>
            <button
              onClick={() => setShowPinModal(true)}
              className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700"
            >
              Enter PIN
            </button>
          </div>
        ) : (
          <ManageInventoryView />
        )}
      </div>

      {/* Dashboard Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <div className="text-3xl font-bold text-red-600 mb-2">
              {dashboardStats.totalParts || inventory.length}
            </div>
            <div className="text-gray-600">Total Parts</div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <div className="text-3xl font-bold text-green-600 mb-2">
              {dashboardStats.availableParts || inventory.filter(part => part.status === 'available').length}
            </div>
            <div className="text-gray-600">Available</div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <div className="text-3xl font-bold text-orange-600 mb-2">
              {dashboardStats.checkedOutParts || inventory.filter(part => part.status === 'checked_out').length}
            </div>
            <div className="text-gray-600">Checked Out</div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">
              {dashboardStats.totalTransactions || transactionHistory.length}
            </div>
            <div className="text-gray-600">Total Transactions</div>
          </div>
        </div>
      </div>
    </div>

      {/* Modals */}
      {showCheckoutModal && <CheckoutModal />}
      {showCheckinModal && <CheckinModal />}
      {showAddPartModal && <AddPartModal />}
      {showEditPartModal && <EditPartModal />}
      {showDeleteConfirm && <DeleteConfirmModal />}
      {showAddShelfModal && <AddShelfModal />}
      {showEditShelfModal && <EditShelfModal />}
      {showDeleteShelfConfirm && <DeleteShelfConfirmModal />}
      {showPinModal && <PinModal />}
      {showEasterEgg && <EasterEggModal />}
      <ExcelUpload 
        isVisible={showExcelUpload}
        onClose={() => setShowExcelUpload(false)}
        onDataImport={handleExcelImport}
      />
      <ImageModal />
    </div>
  );
};

const App = () => {
  return (
    <ThemeProvider>
      <InventorySystem />
    </ThemeProvider>
  );
};

export default App;