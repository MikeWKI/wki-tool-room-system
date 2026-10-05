import React from 'react';
import { resolveEngineFamily } from '../utils/masterInventoryLocation';

function Row({ label, value }) {
  const filled = value != null && String(value).trim() !== '';
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1 text-base">
      <div className="font-semibold text-gray-800 dark:text-gray-100">{label}</div>
      <div className={filled ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}>
        {filled ? value : 'Not on file'}
      </div>
    </div>
  );
}

const PartEnrichmentDetails = ({ part }) => {
  if (!part) return null;
  const family = part.engineFamily || resolveEngineFamily(part);
  const kits = Array.isArray(part.kitComponents) ? part.kitComponents : [];
  return (
    <section className="mt-4 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-4 bg-gray-50 dark:bg-gray-900">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Part details</h3>
      <Row label="On the shelf" value={part.description} />
      <Row label="Polished" value={part.polishedDescription} />
      <Row label="Manufacturer" value={part.manufacturer} />
      <Row label="Vendor" value={part.vendor} />
      <Row label="Engine family" value={family} />
      <Row label="Notes" value={part.notes} />
      <Row label="Specs" value={part.specs} />
      <div className="grid grid-cols-[9rem_1fr] gap-2 py-1 text-base">
        <div className="font-semibold text-gray-800 dark:text-gray-100">Source</div>
        {part.sourceUrl ? (
          <a className="text-red-700 dark:text-red-300 underline break-all" href={part.sourceUrl} target="_blank" rel="noreferrer">
            {part.sourceUrl}
          </a>
        ) : (
          <div className="text-gray-500 dark:text-gray-400">Not on file</div>
        )}
      </div>
      {Array.isArray(part.aliases) && part.aliases.length > 0 && (
        <p className="text-sm text-gray-700 dark:text-gray-200 mt-2">
          Also called: {part.aliases.join(', ')}
        </p>
      )}
      {kits.length > 0 && (
        <div className="mt-3">
          <p className="font-semibold text-gray-900 dark:text-white">Kit components</p>
          <ul className="mt-1 space-y-1 text-sm text-gray-800 dark:text-gray-100">
            {kits.map((kit, index) => (
              <li key={`${kit.partNumber}-${index}`}>
                {kit.qty || 1} × {kit.partNumber || 'P# not on file'}
                {kit.description ? ` — ${kit.description}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {part.lastEnrichedAt && (
        <p className="text-xs text-gray-500 mt-2">
          Details updated {new Date(part.lastEnrichedAt).toLocaleString()}
        </p>
      )}
    </section>
  );
};

export default PartEnrichmentDetails;
