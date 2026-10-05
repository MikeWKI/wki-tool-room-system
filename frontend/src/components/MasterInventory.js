import React, { useMemo, useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, MapPin, Package, Search } from 'lucide-react';
import {
  resolvePartLocationId,
  ENGINE_FAMILY_CHIPS,
  matchesEngineFamilyChip,
  resolveEngineFamily,
} from '../utils/masterInventoryLocation';
import { partMatchesQuery } from '../utils/partSearch';
import PartEnrichmentDetails from './PartEnrichmentDetails';

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
  const [activePart, setActivePart] = useState(null);

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
        (data.sections || []).forEach((section) => {
          init[section.section] = section.section <= 2;
        });
        setExpandedSections(init);
      })
      .catch((error) => setLayoutError(error.message));
  }, []);

  const partsByLocation = useMemo(() => {
    const map = {};
    const unassigned = [];
    for (const loc of layout.locations) map[loc.id] = [];
    for (const part of inventory) {
      const locId = resolvePartLocationId(part.shelf, part.category, layout.locations);
      if (locId && map[locId]) map[locId].push(part);
      else unassigned.push(part);
    }
    return { map, unassigned };
  }, [inventory, layout.locations]);

  const filteredParts = useMemo(() => {
    let list = selectedLocationId ? partsByLocation.map[selectedLocationId] || [] : inventory;
    if (selectedLocationId === '__unassigned__') list = partsByLocation.unassigned;
    return list.filter((part) => matchesEngineFamilyChip(part, engineFamily) && partMatchesQuery(part, searchTerm));
  }, [inventory, partsByLocation, selectedLocationId, searchTerm, engineFamily]);

  const selectedLoc = layout.locations.find((loc) => loc.id === selectedLocationId);
  const photo = activePart && getShelfImagePath ? getShelfImagePath(activePart.shelf, activePart.rack) : null;

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="lg:w-80 bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 max-h-[80vh] overflow-y-auto border-2 border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white px-1">Section → Shelf</h2>
        <p className="text-sm text-gray-700 dark:text-gray-300 px-1 mb-2">
          Section 1 is the West Rack. Cummins shelves 1–7, MX shelves 8–12.
        </p>
        {layoutError && <p className="text-sm text-red-700 mb-2">{layoutError}</p>}
        <button
          type="button"
          onClick={() => setSelectedLocationId(null)}
          className={`w-full text-left min-h-[56px] px-3 rounded-lg mb-2 text-base font-semibold ${
            !selectedLocationId ? 'bg-red-700 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
          }`}
        >
          All parts ({inventory.length})
        </button>
        <button
          type="button"
          onClick={() => setSelectedLocationId('__unassigned__')}
          className={`w-full text-left min-h-[56px] px-3 rounded-lg mb-3 text-base font-semibold ${
            selectedLocationId === '__unassigned__' ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-950 dark:bg-orange-950 dark:text-orange-100'
          }`}
        >
          Unassigned / TBD ({partsByLocation.unassigned.length})
        </button>
        {layout.sections.map((section) => (
          <div key={section.section} className="mb-2">
            <button
              type="button"
              onClick={() => setExpandedSections((prev) => ({ ...prev, [section.section]: !prev[section.section] }))}
              className="w-full min-h-[56px] flex items-center justify-between px-3 rounded-lg bg-gray-900 text-white"
            >
              <span className="text-left">
                <span className="block font-bold">{section.title}</span>
                <span className="block text-xs font-normal text-gray-200">{section.subtitle}</span>
              </span>
              {expandedSections[section.section] ? <ChevronDown /> : <ChevronRight />}
            </button>
            {expandedSections[section.section] && section.areas.map((area) => (
              <div key={area.id || area.name} className="mt-1">
                <p className="px-3 pt-2 text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                  {area.name}
                </p>
                {area.locations.map((loc) => {
                  const count = partsByLocation.map[loc.id]?.length || 0;
                  const label = loc.westRackLabel ? `${loc.label}` : loc.label;
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => setSelectedLocationId(loc.id)}
                      className={`w-full text-left min-h-[56px] px-3 rounded-lg text-base ${
                        selectedLocationId === loc.id
                          ? 'bg-red-100 text-red-950 dark:bg-red-900 dark:text-white'
                          : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className="font-semibold">{loc.shelfNumber ? `Shelf ${loc.shelfNumber}` : loc.area}</span>
                      <span className="block text-xs text-gray-600 dark:text-gray-300">{label} · {count}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 border-2 border-gray-200 dark:border-gray-700 sticky top-0 z-10">
          <div className="relative mb-3">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="P#, alias, or description"
              className="w-full min-h-[56px] pl-11 pr-3 text-lg border-2 border-gray-400 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {ENGINE_FAMILY_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setEngineFamily(chip)}
                className={`min-h-[56px] px-4 rounded-full text-base font-semibold border-2 ${
                  engineFamily === chip
                    ? 'bg-red-700 text-white border-red-800'
                    : 'bg-white text-gray-900 border-gray-400 dark:bg-gray-900 dark:text-white'
                }`}
              >
                {chip}
              </button>
            ))}
          </div>
          {selectedLoc && (
            <p className="mt-3 text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-red-700" />
              {selectedLoc.label}
              {selectedLoc.westRackLabel ? ` · ${selectedLoc.westRackLabel}` : ''}
            </p>
          )}
        </div>

        <div className="grid lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 border-2 border-gray-200 dark:border-gray-700">
            {loading ? (
              <p className="text-center text-gray-700 py-8">Loading inventory…</p>
            ) : filteredParts.length === 0 ? (
              <div className="text-center py-12 text-gray-700">
                <Package className="w-10 h-10 mx-auto mb-2" />
                No parts in this view.
              </div>
            ) : (
              <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                {filteredParts.map((part) => (
                  <button
                    key={part.id}
                    type="button"
                    onClick={() => setActivePart(part)}
                    className={`w-full text-left min-h-[72px] p-3 rounded-lg border-2 ${
                      activePart?.id === part.id ? 'border-red-700 bg-red-50 dark:bg-red-950' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{part.partNumber}</p>
                    <p className="text-base text-gray-800 dark:text-gray-100">{part.polishedDescription || part.description}</p>
                    <p className="text-base text-gray-800 dark:text-gray-100 mt-1">
                      {part.shelf || 'TBD'} · Qty {part.quantity} · {resolveEngineFamily(part) || 'General'} · {part.status === 'available' ? 'Available' : 'Out'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border-2 border-gray-200 dark:border-gray-700">
            {activePart ? (
              <>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{activePart.partNumber}</p>
                <p className="text-lg text-gray-800 dark:text-gray-100">{activePart.description}</p>
                <p className="mt-2 font-semibold text-gray-900 dark:text-white">{activePart.shelf || 'TBD'} · Qty {activePart.quantity}</p>
                {photo && (
                  <img src={`/${photo}`} alt="" className="mt-3 w-full h-40 object-cover rounded-lg border" />
                )}
                <PartEnrichmentDetails part={activePart} />
                <button
                  type="button"
                  onClick={() => onOpenPart(activePart)}
                  className="mt-4 w-full min-h-[56px] rounded-lg bg-red-700 text-white text-lg font-bold"
                >
                  Open check out
                </button>
              </>
            ) : (
              <p className="text-gray-800 dark:text-gray-100 py-8 text-center text-lg">Tap a part to see details.</p>
            )}
          </div>
        </div>
      </div>
      {activePart && (
        <div className="lg:hidden fixed bottom-16 inset-x-0 z-30 px-3 pb-2">
          <button
            type="button"
            onClick={() => onOpenPart(activePart)}
            className="w-full min-h-[56px] rounded-lg bg-red-700 text-white text-lg font-bold shadow-lg"
          >
            Open {activePart.partNumber}
          </button>
        </div>
      )}
    </div>
  );
};

export default MasterInventory;
