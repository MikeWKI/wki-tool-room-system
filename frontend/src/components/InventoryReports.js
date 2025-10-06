import React, { useState, useEffect } from 'react';
import { BarChart3, Download, MapPin, Package, AlertCircle, TrendingUp, TrendingDown, Calendar, Users } from 'lucide-react';

const InventoryReports = ({ 
  isOpen, 
  onClose, 
  inventory, 
  shelves, 
  transactionHistory,
  apiCall 
}) => {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (isOpen) {
      generateReports();
    }
  }, [isOpen, inventory]);

  const generateReports = async () => {
    setLoading(true);
    try {
      // Get detailed report from backend
      const backendReport = await apiCall('/reports/inventory');
      
      // Generate additional frontend calculations
      const frontendReport = generateFrontendReport();
      
      setReportData({
        ...backendReport,
        ...frontendReport
      });
    } catch (error) {
      console.error('Failed to generate reports:', error);
      // Fallback to frontend-only report
      setReportData(generateFrontendReport());
    } finally {
      setLoading(false);
    }
  };

  const generateFrontendReport = () => {
    // Location utilization
    const locationUtilization = {};
    inventory.forEach(part => {
      const location = part.shelf || 'Unassigned';
      if (!locationUtilization[location]) {
        locationUtilization[location] = {
          totalParts: 0,
          totalQuantity: 0,
          categories: new Set(),
          totalValue: 0
        };
      }
      locationUtilization[location].totalParts++;
      locationUtilization[location].totalQuantity += part.quantity || 0;
      locationUtilization[location].categories.add(part.category);
    });

    // Convert Sets to Arrays
    Object.values(locationUtilization).forEach(location => {
      location.categories = Array.from(location.categories);
    });

    // Movement analysis from transaction history
    const movementAnalysis = analyzeMovements();
    
    // Aging analysis
    const agingAnalysis = analyzeAging();

    return {
      locationUtilization,
      movementAnalysis,
      agingAnalysis,
      reportGenerated: new Date().toISOString()
    };
  };

  const analyzeMovements = () => {
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);
    
    const recentTransactions = transactionHistory.filter(t => 
      new Date(t.timestamp) >= last30Days
    );

    const movements = {
      totalTransactions: recentTransactions.length,
      checkouts: recentTransactions.filter(t => t.action === 'checkout').length,
      checkins: recentTransactions.filter(t => t.action === 'checkin').length,
      locationChanges: recentTransactions.filter(t => t.action === 'location_change').length,
      mostActiveUsers: {},
      mostMovedParts: {},
      dailyActivity: {}
    };

    // Analyze user activity
    recentTransactions.forEach(transaction => {
      const user = transaction.user || 'Unknown';
      movements.mostActiveUsers[user] = (movements.mostActiveUsers[user] || 0) + 1;
      
      const partNumber = transaction.partNumber;
      movements.mostMovedParts[partNumber] = (movements.mostMovedParts[partNumber] || 0) + 1;
      
      const date = new Date(transaction.timestamp).toDateString();
      movements.dailyActivity[date] = (movements.dailyActivity[date] || 0) + 1;
    });

    return movements;
  };

  const analyzeAging = () => {
    const now = new Date();
    const aging = {
      neverModified: 0,
      oldParts: 0, // > 90 days
      recentParts: 0, // < 30 days
      averageAge: 0
    };

    let totalAge = 0;
    let partsWithDates = 0;

    inventory.forEach(part => {
      if (!part.lastModified) {
        aging.neverModified++;
      } else {
        const modifiedDate = new Date(part.lastModified);
        const ageInDays = (now - modifiedDate) / (1000 * 60 * 60 * 24);
        
        totalAge += ageInDays;
        partsWithDates++;
        
        if (ageInDays > 90) {
          aging.oldParts++;
        } else if (ageInDays < 30) {
          aging.recentParts++;
        }
      }
    });

    aging.averageAge = partsWithDates > 0 ? Math.round(totalAge / partsWithDates) : 0;
    
    return aging;
  };

  const exportToCSV = (data, filename) => {
    const csvContent = convertToCSV(data);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const convertToCSV = (data) => {
    if (Array.isArray(data)) {
      if (data.length === 0) return '';
      
      const headers = Object.keys(data[0]);
      const csvRows = [headers.join(',')];
      
      data.forEach(row => {
        const values = headers.map(header => {
          const value = row[header];
          return typeof value === 'string' ? `"${value}"` : value;
        });
        csvRows.push(values.join(','));
      });
      
      return csvRows.join('\n');
    }
    return '';
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'locations', label: 'Locations', icon: MapPin },
    { id: 'movement', label: 'Movement', icon: TrendingUp },
    { id: 'aging', label: 'Aging', icon: Calendar }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-red-600 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            <h2 className="text-xl font-bold">Inventory Reports</h2>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="p-1 hover:bg-red-700 rounded"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-4">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-red-500 text-red-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="overflow-auto max-h-[60vh] p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
            </div>
          ) : reportData ? (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-blue-600 font-medium">Total Parts</p>
                          <p className="text-2xl font-bold text-blue-900">{reportData.totalParts || inventory.length}</p>
                        </div>
                        <Package className="w-8 h-8 text-blue-600" />
                      </div>
                    </div>
                    
                    <div className="bg-green-50 p-4 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-green-600 font-medium">Total Quantity</p>
                          <p className="text-2xl font-bold text-green-900">{reportData.totalQuantity || inventory.reduce((sum, p) => sum + (p.quantity || 0), 0)}</p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-green-600" />
                      </div>
                    </div>
                    
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-yellow-600 font-medium">Low Stock</p>
                          <p className="text-2xl font-bold text-yellow-900">{reportData.lowStockParts?.length || inventory.filter(p => p.quantity <= (p.minQuantity || 1)).length}</p>
                        </div>
                        <AlertCircle className="w-8 h-8 text-yellow-600" />
                      </div>
                    </div>
                    
                    <div className="bg-red-50 p-4 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-red-600 font-medium">Out of Stock</p>
                          <p className="text-2xl font-bold text-red-900">{inventory.filter(p => p.quantity === 0).length}</p>
                        </div>
                        <TrendingDown className="w-8 h-8 text-red-600" />
                      </div>
                    </div>
                  </div>

                  {/* Category Breakdown */}
                  {reportData.categoryStats && (
                    <div className="bg-white border rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-4">Category Breakdown</h3>
                      <div className="space-y-2">
                        {Object.entries(reportData.categoryStats).map(([category, stats]) => (
                          <div key={category} className="flex justify-between items-center py-2 border-b">
                            <span className="font-medium text-gray-900">{category}</span>
                            <div className="text-right">
                              <span className="text-sm text-gray-600">{stats.count} parts</span>
                              <br />
                              <span className="text-sm text-gray-500">{stats.totalQuantity} total qty</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Locations Tab */}
              {activeTab === 'locations' && reportData.locationReport && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Location Utilization</h3>
                    <button
                      onClick={() => exportToCSV(Object.entries(reportData.locationReport).map(([location, data]) => ({
                        location,
                        totalParts: data.totalParts,
                        totalQuantity: data.totalQuantity,
                        categories: data.categories.join(', ')
                      })), 'location-report.csv')}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Export CSV
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(reportData.locationReport).map(([location, data]) => (
                      <div key={location} className="border rounded-lg p-4">
                        <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          {location}
                        </h4>
                        <div className="space-y-1 text-sm">
                          <p><span className="text-gray-600">Parts:</span> {data.parts.length}</p>
                          <p><span className="text-gray-600">Total Qty:</span> {data.totalQuantity}</p>
                          <p><span className="text-gray-600">Categories:</span> {data.categories.length}</p>
                          <div className="mt-2">
                            <p className="text-xs text-gray-500">Categories: {data.categories.join(', ')}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Movement Tab */}
              {activeTab === 'movement' && reportData.movementAnalysis && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Movement Analysis (Last 30 Days)</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-sm text-blue-600 font-medium">Total Transactions</p>
                      <p className="text-2xl font-bold text-blue-900">{reportData.movementAnalysis.totalTransactions}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm text-green-600 font-medium">Check-outs</p>
                      <p className="text-2xl font-bold text-green-900">{reportData.movementAnalysis.checkouts}</p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <p className="text-sm text-purple-600 font-medium">Location Changes</p>
                      <p className="text-2xl font-bold text-purple-900">{reportData.movementAnalysis.locationChanges}</p>
                    </div>
                  </div>

                  {/* Most Active Users */}
                  <div className="bg-white border rounded-lg p-4">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Most Active Users
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(reportData.movementAnalysis.mostActiveUsers)
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 5)
                        .map(([user, count]) => (
                          <div key={user} className="flex justify-between">
                            <span className="text-gray-900">{user}</span>
                            <span className="font-medium text-gray-900">{count} transactions</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Aging Tab */}
              {activeTab === 'aging' && reportData.agingAnalysis && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Inventory Aging Analysis</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600 font-medium">Never Modified</p>
                      <p className="text-2xl font-bold text-gray-900">{reportData.agingAnalysis.neverModified}</p>
                    </div>
                    <div className="bg-red-50 p-4 rounded-lg">
                      <p className="text-sm text-red-600 font-medium">Old Parts (&gt;90 days)</p>
                      <p className="text-2xl font-bold text-red-900">{reportData.agingAnalysis.oldParts}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm text-green-600 font-medium">Recent Parts (&lt;30 days)</p>
                      <p className="text-2xl font-bold text-green-900">{reportData.agingAnalysis.recentParts}</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-sm text-blue-600 font-medium">Average Age</p>
                      <p className="text-2xl font-bold text-blue-900">{reportData.agingAnalysis.averageAge} days</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">No report data available</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {reportData && `Report generated: ${new Date(reportData.reportGenerated).toLocaleString()}`}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default InventoryReports;