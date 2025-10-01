import React, { useState } from 'react';
import { Download, Upload, Shield, AlertTriangle, CheckCircle, Database, RefreshCw } from 'lucide-react';

const DataManagement = ({ 
  isOpen, 
  onClose, 
  apiCall 
}) => {
  const [loading, setLoading] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [backupData, setBackupData] = useState(null);
  const [restoreData, setRestoreData] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [activeTab, setActiveTab] = useState('backup');

  const createBackup = async () => {
    setLoading(true);
    try {
      const backup = await apiCall('/backup/create');
      setBackupData(backup);
      
      // Download backup file
      const dataStr = JSON.stringify(backup, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wki-inventory-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to create backup:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateData = async () => {
    setLoading(true);
    try {
      const result = await apiCall('/backup/validate');
      setValidationResult(result);
    } catch (error) {
      console.error('Failed to validate data:', error);
    } finally {
      setLoading(false);
    }
  };

  const restoreFromBackup = async () => {
    if (!restoreData || !confirmRestore) {
      return;
    }

    setLoading(true);
    try {
      const parsedData = JSON.parse(restoreData);
      const result = await apiCall('/backup/restore', {
        method: 'POST',
        body: JSON.stringify({
          data: parsedData.data,
          confirm: true
        })
      });
      
      alert('Backup restored successfully! The page will reload to reflect changes.');
      window.location.reload();
    } catch (error) {
      console.error('Failed to restore backup:', error);
      alert('Failed to restore backup. Please check the data format.');
    } finally {
      setLoading(false);
    }
  };

  const createAutoBackup = async () => {
    setLoading(true);
    try {
      const result = await apiCall('/backup/auto-create', {
        method: 'POST'
      });
      alert(`Auto-backup created successfully: ${result.backupFile}`);
    } catch (error) {
      console.error('Failed to create auto-backup:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'backup', label: 'Backup & Restore', icon: Database },
    { id: 'validate', label: 'Data Validation', icon: Shield }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-red-600 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-6 h-6" />
            <h2 className="text-xl font-bold">Data Management</h2>
          </div>
          <button
            onClick={onClose}
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
        <div className="p-6 overflow-auto max-h-[60vh]">
          {/* Backup & Restore Tab */}
          {activeTab === 'backup' && (
            <div className="space-y-6">
              {/* Create Backup Section */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  Create Backup
                </h3>
                <p className="text-gray-600 mb-4">
                  Download a complete backup of your inventory data including parts, shelves, and transaction history.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={createBackup}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Create & Download Backup
                  </button>
                  <button
                    onClick={createAutoBackup}
                    disabled={loading}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                    Create Server Backup
                  </button>
                </div>
              </div>

              {/* Restore Backup Section */}
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Restore from Backup
                </h3>
                <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-medium">Warning:</span>
                  </div>
                  <p className="mt-1">This will replace ALL current data. Make sure to create a backup first!</p>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Paste backup JSON data:
                    </label>
                    <textarea
                      value={restoreData}
                      onChange={(e) => setRestoreData(e.target.value)}
                      placeholder="Paste the complete backup JSON here..."
                      className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="confirmRestore"
                      checked={confirmRestore}
                      onChange={(e) => setConfirmRestore(e.target.checked)}
                      className="rounded text-red-600 focus:ring-red-500"
                    />
                    <label htmlFor="confirmRestore" className="text-sm text-gray-700">
                      I understand this will replace all current data
                    </label>
                  </div>
                  
                  <button
                    onClick={restoreFromBackup}
                    disabled={loading || !restoreData || !confirmRestore}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Restore Backup
                  </button>
                </div>
              </div>

              {/* Backup Info */}
              {backupData && (
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    Last Backup Created
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Timestamp:</span>
                      <br />
                      <span className="font-medium text-gray-900">{new Date(backupData.timestamp).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Parts:</span>
                      <br />
                      <span className="font-medium text-gray-900">{backupData.metadata.totalParts}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Shelves:</span>
                      <br />
                      <span className="font-medium text-gray-900">{backupData.metadata.totalShelves}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Transactions:</span>
                      <br />
                      <span className="font-medium text-gray-900">{backupData.metadata.totalTransactions}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Data Validation Tab */}
          {activeTab === 'validate' && (
            <div className="space-y-6">
              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Data Integrity Check
                </h3>
                <p className="text-gray-600 mb-4">
                  Validate your inventory data for consistency and integrity issues.
                </p>
                <button
                  onClick={validateData}
                  disabled={loading}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  Run Validation
                </button>
              </div>

              {/* Validation Results */}
              {validationResult && (
                <div className={`p-4 rounded-lg ${
                  validationResult.isValid ? 'bg-green-50' : 'bg-red-50'
                }`}>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    {validationResult.isValid ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    )}
                    Validation Results
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-white p-3 rounded">
                      <span className="text-gray-600">Parts:</span>
                      <br />
                      <span className="font-medium text-lg text-gray-900">{validationResult.summary.totalParts}</span>
                    </div>
                    <div className="bg-white p-3 rounded">
                      <span className="text-gray-600">Shelves:</span>
                      <br />
                      <span className="font-medium text-lg text-gray-900">{validationResult.summary.totalShelves}</span>
                    </div>
                    <div className="bg-white p-3 rounded">
                      <span className="text-gray-600">Transactions:</span>
                      <br />
                      <span className="font-medium text-lg text-gray-900">{validationResult.summary.totalTransactions}</span>
                    </div>
                  </div>

                  {/* Errors */}
                  {validationResult.errors.length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-medium text-red-700 mb-2">Errors Found:</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {validationResult.errors.map((error, index) => (
                          <li key={index} className="text-red-600 text-sm">{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Warnings */}
                  {validationResult.warnings.length > 0 && (
                    <div>
                      <h4 className="font-medium text-yellow-700 mb-2">Warnings:</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {validationResult.warnings.map((warning, index) => (
                          <li key={index} className="text-yellow-600 text-sm">{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {validationResult.isValid && validationResult.errors.length === 0 && validationResult.warnings.length === 0 && (
                    <p className="text-green-700">All data validation checks passed! Your inventory data is consistent.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Always create backups before making major changes to your inventory.
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

export default DataManagement;