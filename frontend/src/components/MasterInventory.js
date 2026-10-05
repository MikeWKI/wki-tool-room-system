import React, { useMemo, useState, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  MapPin,
  Package,
  Search,
  AlertCircle,
} from 'lucide-react';
import {
  resolvePartLocationId,
  engineFamilyFromCategory,
  ENGINE_FAMILY_CHIPS,
} from '../utils/masterInventoryLocation';

const MasterInventory = ({
  inventory,
  loading,
  searchTerm,
  onSearchChange,
  onOpenPart,
  getShelfImagePath,
}) => {
  const [layout, setLayout] = useState({ sections: [], locations: [] });
  const [layoutError, setLayoutError] = useState('');
  const [expandedSections, setExpandedSections] = useState({});
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [engineFamily, setEngineFamily] = useState('All');

  useEffect(() => {
    const base = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
    fetch(`${base}/inventory/layout`)
      .then((r) => r.json())
      .then((data) => {
        setLayout({
          sections: data.sections || [],
          locations: data.locations || [],
        });
        const init = {};
        (data.sections || []).forEach((s) => {
          init[s.section] = s.section <= 2;
        });
        setExpandedSections(init);
      })
      .catch((e) => setLayoutError(e.message));
  }, []);

  const partsByLocation = useMemo(() => {
    const map = {};
    const unassigned = [];
    for (const loc of layout.locations) {
      map[loc.id] = [];
    }
    for (const part of inventory) {
      const locId = resolvePartLocationId(part.shelf, part.category, layout.locations);
      if (locId && map[locId]) {
        map[locId].push(part);
      } else {
        unassigned.push(part);
      }
    }
    return { map, unassigned };
  }, [inventory, layout.locations]);

  const filteredParts = useMemo(() => {
    let list = selectedLocationId
      ? partsByLocation.map[selectedLocationId] || []
      : inventory;

    if (selectedLocationId === '__unassigned__') {
      list = partsByLocation.unassigned;
    }

    const q = (searchTerm || '').trim().toLowerCase();
    return list.filter((part) => {
      if (engineFamily !== 'All') {
        if (engineFamilyFromCategory(part.category) !== engineFamily) return false;
      }
      if (!q) return true;
      return (
        part.partNumber.toLowerCase().includes(q) ||
        (part.description || '').toLowerCase().includes(q) ||
        (part.category || '').toLowerCase().includes(q)
      );
    });
  }, [
    inventory,
    partsByLocation,
    selectedLocationId,
    searchTerm,
    engineFamily,
  ]);

  const toggleSection = (sectionNum) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionNum]: !prev[sectionNum],
    }));
  };

  const selectedLoc = layout.locations.find((l) => l.id === selectedLocationId);

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="lg:w-1/3 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 max-h-[70vh] overflow-y-auto">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Master Inventory
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Browse by JB section/shelf. Section 1 = West Rack (Cummins 1–7, MX 8–12).
          </p>
        </div>

        {layoutError && (
          <p className="text-sm text-red-600 mb-2">Layout: {layoutError}</p>
        )}

        <button
          type="button"
          onClick={() => setSelectedLocationId(null)}
          className={`w-full text-left px-3 py-2 rounded-lg mb-2 text-sm ${
            !selectedLocationId
              ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          All parts ({inventory.length})
        </button>

        <button
          type="button"
          onClick={() => setSelectedLocationId('__unassigned__')}
          className={`w-full text-left px-3 py-2 rounded-lg mb-3 text-sm flex items-center gap-2 ${
            selectedLocationId === '__unassigned__'
              ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-900'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <AlertCircle className="w-4 h-4" />
          Unassigned / TBD ({partsByLocation.unassigned.length})
        </button>

        {layout.sections.map((sec) => (
          <div key={sec.section} className="mb-2">
            <button
              type="button"
              onClick={() => toggleSection(sec.section)}
              className="w-full flex items-center justify-between px-2 py-2 font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
            >
              <span>
                {sec.title}
                {sec.section === 1 && (
                  <span className="ml-2 text-xs font-normal text-red-600 dark:text-red-400">
                    ≈ West Rack
                  </span>
                )}
              </span>
              {expandedSections[sec.section] ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            {expandedSections[sec.section] &&
              sec.areas.flatMap((area) =>
                area.locations.map((loc) => {
                  const count = partsByLocation.map[loc.id]?.length || 0;
                  const label =
                    loc.westRackLabel
                      ? `${loc.label} (${loc.westRackLabel})`
                      : loc.label;
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => setSelectedLocationId(loc.id)}
                      className={`w-full text-left pl-6 pr-2 py-1.5 text-sm rounded ${
                        selectedLocationId === loc.id
                          ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {label}
                      <span className="text-gray-400 ml-1">({count})</span>
                    </button>
                  );
                })
              )}
          </div>
        ))}
      </div>

      <div className="lg:flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex flex-col min-h-[400px]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="P#, description, engine family…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {ENGINE_FAMILY_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setEngineFamily(chip)}
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                engineFamily === chip
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              {chip}
            </button>
          ))}
        </div>

        {selectedLoc && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            {selectedLoc.westRackLabel
              ? `${selectedLoc.label} — also ${selectedLoc.westRackLabel}`
              : selectedLoc.label}
          </p>
        )}

        {loading ? (
          <p className="text-center text-gray-500 py-8">Loading inventory…</p>
        ) : (
          <div className="space-y-2 overflow-y-auto flex-1">
            {filteredParts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
                No parts in this view.
              </div>
            ) : (
              filteredParts.map((part) => (
                <button
                  key={part.id}
                  type="button"
                  onClick={() => onOpenPart(part)}
                  className="w-full text-left p-3 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-red-400 transition-colors"
                >
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {part.partNumber}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        {part.description}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {part.shelf || 'TBD'} · Qty {part.quantity} ·{' '}
                        <span
                          className={
                            part.status === 'available'
                              ? 'text-green-600'
                              : 'text-orange-600'
                          }
                        >
                          {part.status === 'available' ? 'Available' : 'Checked out'}
                        </span>
                      </p>
                    </div>
                    {getShelfImagePath && getShelfImagePath(part.shelf, part.rack) && (
                      <img
                        src={`/${getShelfImagePath(part.shelf, part.rack)}`}
                        alt=""
                        className="w-14 h-14 object-cover rounded border border-gray-200"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MasterInventory;
