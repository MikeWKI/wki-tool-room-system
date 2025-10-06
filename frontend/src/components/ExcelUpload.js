import React, { useState, useCallback } from 'react';
import { Upload, FileText, Download, AlertCircle, CheckCircle, X, Eye } from 'lucide-react';
import * as XLSX from 'xlsx';

const ExcelUpload = ({ onDataImport, isVisible, onClose }) => {
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [selectedSheets, setSelectedSheets] = useState([]);
  const [previewData, setPreviewData] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});

  // Expected columns for parts data
  const expectedColumns = [
    { key: 'partNumber', label: 'Part Number', required: true, aliases: ['Part #', 'Part Number', 'PartNumber', 'Part_#'] },
    { key: 'description', label: 'Description', required: true, aliases: ['Description', 'Desc', 'Part Description'] },
    { key: 'shelf', label: 'Shelf Location', required: false, aliases: ['Shelf', 'Location', 'Bin', 'Position'] },
    { key: 'rack', label: 'Rack', required: false, aliases: ['Rack', 'Section', 'Area'] },
    { key: 'quantity', label: 'Quantity', required: false, aliases: ['Quantity', 'Qty', 'Stock', 'Count'] },
    { key: 'series', label: 'Series', required: false, aliases: ['Series', 'Model', 'Type', 'Category'] },
    { key: 'minQuantity', label: 'Min Quantity', required: false, aliases: ['Min Quantity', 'Min Qty', 'Minimum', 'Reorder Level'] }
  ];

  const handleFileSelect = useCallback((event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
      setUploadStatus({ type: 'error', message: 'Please select a valid Excel file (.xlsx or .xls)' });
      return;
    }

    setFile(selectedFile);
    setUploadStatus(null);
    processExcelFile(selectedFile);
  }, []);

  const processExcelFile = useCallback((file) => {
    setIsProcessing(true);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const sheetsInfo = workbook.SheetNames.map(name => {
          const worksheet = workbook.Sheets[name];
          // Get all data including empty rows to count properly
          const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
          const totalRows = range.e.r + 1;
          
          // Try to find actual data rows (skip headers and empty rows)
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          const dataRows = jsonData.filter(row => 
            row.some(cell => cell && cell.toString().trim() !== '') && // Has some data
            !row.every(cell => !cell || cell.toString().trim() === '' || cell.toString().includes('Tool Inventory') || cell.toString().includes('Part #')) // Skip headers
          );
          
          return {
            name,
            rowCount: dataRows.length,
            totalRows: totalRows
          };
        }).filter(sheet => sheet.rowCount > 0); // Only show sheets with actual data
        
        setSheets(sheetsInfo);
        
        // Generate preview data for all sheets
        const preview = {};
        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          
          // Find header row (look for "Part #" or similar)
          let headerRowIndex = -1;
          let headers = [];
          
          for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row.some(cell => cell && (
              cell.toString().toLowerCase().includes('part') ||
              cell.toString().toLowerCase().includes('description') ||
              cell.toString().toLowerCase().includes('quantity')
            ))) {
              headerRowIndex = i;
              headers = row.filter(cell => cell && cell.toString().trim() !== '');
              break;
            }
          }
          
          // Get data rows after header
          const dataRows = headerRowIndex >= 0 
            ? jsonData.slice(headerRowIndex + 1)
                .filter(row => row.some(cell => cell && cell.toString().trim() !== ''))
                .slice(0, 5) // First 5 data rows for preview
            : jsonData.slice(0, 5);
          
          preview[sheetName] = {
            headers: headers.length > 0 ? headers : (jsonData[0] || []),
            rows: dataRows,
            headerRowIndex: headerRowIndex
          };
        });
        
        setPreviewData(preview);
        setIsProcessing(false);
        
      } catch (error) {
        console.error('Error processing Excel file:', error);
        setUploadStatus({ type: 'error', message: 'Error reading Excel file. Please check the file format.' });
        setIsProcessing(false);
      }
    };
    
    reader.readAsArrayBuffer(file);
  }, []);

  const handleSheetSelection = (sheetName) => {
    setSelectedSheets(prev => 
      prev.includes(sheetName) 
        ? prev.filter(s => s !== sheetName)
        : [...prev, sheetName]
    );
  };

  const generateColumnMapping = (sheetName) => {
    const headers = previewData[sheetName]?.headers || [];
    const mapping = {};
    
    expectedColumns.forEach(col => {
      // Try to auto-match columns based on exact matches first, then aliases
      let matchingHeader = headers.find(header => {
        const normalizedHeader = header.toString().toLowerCase().trim();
        return col.aliases.some(alias => 
          normalizedHeader === alias.toLowerCase() ||
          normalizedHeader.includes(alias.toLowerCase().replace(/[^a-z0-9]/g, ''))
        );
      });
      
      if (matchingHeader) {
        mapping[col.key] = matchingHeader;
      }
    });
    
    return mapping;
  };

  const handleImport = async () => {
    if (selectedSheets.length === 0) {
      setUploadStatus({ type: 'error', message: 'Please select at least one sheet to import.' });
      return;
    }

    setIsProcessing(true);
    
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const allParts = [];
        let currentId = 1000; // Start IDs from 1000 to avoid conflicts
        
        selectedSheets.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          
          // Find header row
          let headerRowIndex = -1;
          let headers = [];
          
          for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row.some(cell => cell && (
              cell.toString().toLowerCase().includes('part') ||
              cell.toString().toLowerCase().includes('description')
            ))) {
              headerRowIndex = i;
              headers = row;
              break;
            }
          }
          
          if (headerRowIndex === -1) {
            console.warn(`No header row found in sheet: ${sheetName}`);
            return;
          }
          
          // Get data rows after header
          const dataRows = jsonData.slice(headerRowIndex + 1)
            .filter(row => row.some(cell => cell && cell.toString().trim() !== ''));
          
          const sheetMapping = columnMapping[sheetName] || generateColumnMapping(sheetName);
          
          dataRows.forEach(row => {
            // Convert row array to object using headers
            const rowObj = {};
            headers.forEach((header, index) => {
              if (header && row[index] !== undefined) {
                rowObj[header] = row[index];
              }
            });
            
            // Skip empty rows
            if (!Object.values(rowObj).some(value => value && value.toString().trim())) {
              return;
            }
            
            // Create validated part object
            const part = {
              id: currentId++,
              partNumber: (rowObj[sheetMapping.partNumber] || '').toString().trim(),
              description: (rowObj[sheetMapping.description] || '').toString().trim(),
              shelf: (rowObj[sheetMapping.shelf] || 'TBD').toString().trim(),
              rack: (rowObj[sheetMapping.rack] || '').toString().trim(),
              series: (rowObj[sheetMapping.series] || '').toString().trim(),
              category: sheetName, // Use sheet name as category (manufacturer)
              status: 'available',
              checkedOutBy: null,
              checkedOutDate: null,
              quantity: Math.max(parseInt(rowObj[sheetMapping.quantity]) || 1, 1),
              minQuantity: Math.max(parseInt(rowObj[sheetMapping.minQuantity]) || 1, 1)
            };
            
            // Only add parts with at least a part number or description
            if (part.partNumber || part.description) {
              allParts.push(part);
            }
          });
        });
        
        // Send to parent component for processing
        if (onDataImport) {
          await onDataImport(allParts);
        }
        
        setUploadStatus({ 
          type: 'success', 
          message: `Successfully imported ${allParts.length} parts from ${selectedSheets.length} sheet(s).` 
        });
        
        setIsProcessing(false);
      };
      
      reader.readAsArrayBuffer(file);
      
    } catch (error) {
      console.error('Import error:', error);
      setUploadStatus({ type: 'error', message: 'Error importing data. Please try again.' });
      setIsProcessing(false);
    }
  };

  const resetUpload = () => {
    setFile(null);
    setSheets([]);
    setSelectedSheets([]);
    setPreviewData({});
    setColumnMapping({});
    setUploadStatus(null);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <FileText className="w-8 h-8 text-green-600" />
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">Import Parts from Excel</h2>
              <p className="text-gray-600">Upload an Excel workbook with manufacturer sheets</p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* File Upload */}
          {!file && (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-green-400 transition-colors">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Select Excel File</h3>
              <p className="text-gray-600 mb-4">Choose an Excel workbook (.xlsx or .xls) with manufacturer sheets</p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                id="excel-upload"
              />
              <label
                htmlFor="excel-upload"
                className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer transition-colors"
              >
                <Upload className="w-5 h-5 mr-2" />
                Choose Excel File
              </label>
            </div>
          )}

          {/* Processing State */}
          {isProcessing && (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-600">Processing Excel file...</p>
            </div>
          )}

          {/* File Info & Sheet Selection */}
          {file && sheets.length > 0 && !isProcessing && (
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{file.name}</h3>
                    <p className="text-sm text-gray-600">{sheets.length} sheet(s) found</p>
                  </div>
                  <button
                    onClick={resetUpload}
                    className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Choose Different File
                  </button>
                </div>
              </div>

              {/* Sheet Selection */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Select Sheets to Import</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sheets.map(sheet => (
                    <div
                      key={sheet.name}
                      className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                        selectedSheets.includes(sheet.name)
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-green-300'
                      }`}
                      onClick={() => handleSheetSelection(sheet.name)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="font-semibold text-gray-900">{sheet.name}</h5>
                          <p className="text-sm text-gray-600">{sheet.rowCount} rows</p>
                        </div>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          selectedSheets.includes(sheet.name)
                            ? 'border-green-500 bg-green-500'
                            : 'border-gray-300'
                        }`}>
                          {selectedSheets.includes(sheet.name) && (
                            <CheckCircle className="w-3 h-3 text-white" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {selectedSheets.length > 0 && (
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Data Preview</h4>
                  {selectedSheets.map(sheetName => (
                    <div key={sheetName} className="mb-6">
                      <h5 className="font-semibold text-gray-800 mb-2">{sheetName}</h5>
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full bg-white">
                          <thead className="bg-gray-50">
                            <tr>
                              {previewData[sheetName]?.headers.map((header, idx) => (
                                <th key={idx} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {previewData[sheetName]?.rows.slice(0, 3).map((row, idx) => (
                              <tr key={idx}>
                                {row.map((cell, cellIdx) => (
                                  <td key={cellIdx} className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                    {cell || '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Status Messages */}
          {uploadStatus && (
            <div className={`p-4 rounded-lg flex items-center space-x-3 ${
              uploadStatus.type === 'success' 
                ? 'bg-green-50 text-green-800' 
                : 'bg-red-50 text-red-800'
            }`}>
              {uploadStatus.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <span>{uploadStatus.message}</span>
            </div>
          )}

          {/* Action Buttons */}
          {file && sheets.length > 0 && !isProcessing && (
            <div className="flex justify-end space-x-4">
              <button
                onClick={onClose}
                className="px-6 py-3 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={selectedSheets.length === 0}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Import Selected Data
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExcelUpload;