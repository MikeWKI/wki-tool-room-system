import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, GitCompare, RefreshCw, X, Lock } from 'lucide-react';

const TABS = [
  { id: 'jbStaging', label: 'JB Staging' },
  { id: 'jbOnly', label: 'JB only' },
  { id: 'liveOnly', label: 'Live only' },
  { id: 'matchedClean', label: 'Matched clean' },
];

const ReconcileInventory = ({ apiCall, currentUser }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('jbStaging');
  const [stagingBusy, setStagingBusy] = useState(null);
  const [fillGapsPlan, setFillGapsPlan] = useState(null);
  const [applyBusy, setApplyBusy] = useState(false);

  const loadFillGapsPlan = useCallback(async () => {
    const data = await apiCall('/reconcile/fill-gaps-plan');
    setFillGapsPlan(data);
    return data;
  }, [apiCall]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiCall('/reconcile/report');
      setReport(data);
      await loadFillGapsPlan();
    } catch (err) {
      setError(err.message || 'Failed to load reconcile report');
    } finally {
      setLoading(false);
    }
  }, [apiCall, loadFillGapsPlan]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const saveDecision = async (row, decision) => {
    const partNumber = row.partNumber || row.live?.partNumber || row.jb?.partNumber;
    setStagingBusy(partNumber);
    try {
      await apiCall('/reconcile/staging/accept', {
        method: 'POST',
        body: JSON.stringify({
          partNumber,
          decision,
          acceptedBy: currentUser || 'Reconcile UI',
          jbSnapshot: row.jb || row,
          liveSnapshot: row.live || null,
          proposedChanges: row.diffs || row.fields || null,
        }),
      });
      await loadReport();
    } catch (err) {
      setError(err.message);
    } finally {
      setStagingBusy(null);
    }
  };

  const runApplyFillGaps = async () => {
    if (!window.confirm('Apply fill-gaps to live inventory? This fills TBD shelves and adds missing P#s. JB Staging diffs are not overwritten. No parts are deleted.')) {
      return;
    }
    setApplyBusy(true);
    setError('');
    try {
      const data = await apiCall('/reconcile/apply', {
        method: 'POST',
        body: JSON.stringify({ confirm: true, appliedBy: currentUser || 'Reconcile UI' }),
      });
      setFillGapsPlan(data.plan || data);
      await loadReport();
      window.alert(`Fill-gaps finished. Added ${data.applied?.partsAdded ?? 0}. Shelf updates ${data.applied?.shelvesUpdated ?? 0}. Field updates ${data.applied?.fieldsUpdated ?? 0}.`);
    } catch (err) {
      setError(err.message || 'Apply failed');
    } finally {
      setApplyBusy(false);
    }
  };

  const meta = report?.meta;
  const applyDisabled = report ? !report.applyToLiveEnabled : true;
  const importStrategy = report?.importStrategy || 'fill-gaps';
  const conflicts = fillGapsPlan?.actions?.skippedLocationConflict || [];
  const stagingRows = fillGapsPlan?.actions?.jbStaging || [];
  const reportRows = report ? report[activeTab] || [] : [];
  const rows = activeTab === 'jbStaging' ? (stagingRows.length ? stagingRows : report?.matchedWithDiffs || []) : reportRows;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <GitCompare className="w-7 h-7 text-red-700" />
            JB Staging
          </h2>
          <p className="text-base text-gray-800 dark:text-gray-200 mt-1 max-w-3xl">
            Strategy stays <strong>{importStrategy}</strong>. Matched parts with differences, including the location conflicts, stay here until you choose Accept JB. Fill-gaps apply only fills TBD or missing shelves and adds missing P#s.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={loadReport} disabled={loading || applyBusy} className="min-h-[56px] px-4 rounded-lg bg-gray-900 text-white font-semibold">
            <RefreshCw className={`w-5 h-5 inline mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh dry run
          </button>
        </div>
      </div>

      <div className={`mb-4 p-4 rounded-lg border-2 text-base ${applyDisabled ? 'bg-amber-50 border-amber-400 text-amber-950' : 'bg-red-50 border-red-700 text-red-950'}`}>
        <div className="flex items-start gap-2 font-semibold">
          <Lock className="w-5 h-5 mt-0.5" />
          {applyDisabled ? 'Dry run. Apply-to-live is off (RECONCILE_APPLY_TO_LIVE is not true).' : 'Apply-to-live is ON. Fill-gaps can write TBD shelves and new P#s.'}
        </div>
        <p className="mt-1">
          Will apply when the gate is on: {fillGapsPlan?.counts?.updateShelfFromJb ?? '—'} TBD shelf fills, {fillGapsPlan?.counts?.addFromJb ?? '—'} new P#s.
          Held in JB Staging: {fillGapsPlan?.counts?.jbStaging ?? '—'} ({fillGapsPlan?.counts?.skippedLocationConflict ?? conflicts.length} location conflicts).
        </p>
      </div>

      {!applyDisabled && (
        <button type="button" onClick={runApplyFillGaps} disabled={applyBusy} className="mb-4 min-h-[56px] px-4 rounded-lg bg-red-700 text-white font-bold disabled:opacity-50">
          Apply fill-gaps to live (TBD shelves and new P#s only)
        </button>
      )}

      {conflicts.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-orange-50 border-2 border-orange-400 text-orange-950">
          <p className="font-bold">Location conflicts — not moved until Accept JB</p>
          <ul className="mt-2 space-y-1 text-sm">
            {conflicts.map((row) => (
              <li key={row.partNumber}>
                {row.partNumber}: live {row.liveShelf || '—'} · JB {row.jbShelf || '—'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-900 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {meta && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-center">
          {[
            ['Live parts', meta.liveTotal],
            ['JB rows', meta.jbTotalRows],
            ['Matched P#', meta.matched],
            ['With diffs', meta.matchedWithDiffs],
            ['JB only', meta.jbOnly],
            ['Live only', meta.liveOnly],
            ['TBD/unmapped', meta.tbdOrUnmappedShelf],
            ['JB Staging', fillGapsPlan?.counts?.jbStaging ?? '—'],
          ].map(([label, value]) => (
            <div key={label} className="p-3 rounded-lg border-2 border-gray-200 dark:border-gray-600">
              <div className="text-2xl font-bold text-red-700">{value}</div>
              <div className="text-sm text-gray-700 dark:text-gray-300">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-[56px] px-4 rounded-lg text-base font-semibold ${
              activeTab === tab.id ? 'bg-red-700 text-white' : 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white'
            }`}
          >
            {tab.label}
            {tab.id === 'jbStaging' && fillGapsPlan?.counts ? ` (${fillGapsPlan.counts.jbStaging})` : ''}
            {tab.id !== 'jbStaging' && report ? ` (${(report[tab.id] || []).length})` : ''}
          </button>
        ))}
      </div>

      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {loading && !report ? (
          <p className="text-center py-8 text-gray-700">Loading report…</p>
        ) : rows.length === 0 ? (
          <p className="text-center py-8 text-gray-700">No rows in this bucket.</p>
        ) : (
          rows.map((row, index) => {
            const partNumber = row.partNumber || row.live?.partNumber || row.jb?.partNumber || `row-${index}`;
            const busy = stagingBusy === partNumber;
            const live = row.live;
            const jb = row.jb;
            return (
              <div key={`${partNumber}-${index}`} className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-3">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-lg font-bold text-gray-900 dark:text-white">{partNumber}</span>
                  {row.reason === 'location_conflict' && (
                    <span className="text-xs font-bold uppercase bg-orange-200 text-orange-950 px-2 py-1 rounded">Location conflict</span>
                  )}
                  {row.reason === 'field_diff' && (
                    <span className="text-xs font-bold uppercase bg-amber-200 text-amber-950 px-2 py-1 rounded">Field diff</span>
                  )}
                </div>
                {row.message && <p className="text-sm text-gray-800 dark:text-gray-200 mb-2">{row.message}</p>}
                {live && (
                  <p className="text-sm text-gray-800 dark:text-gray-200">
                    <span className="font-semibold">Live:</span> {live.description} · {live.shelf || 'TBD'} · qty {live.quantity}
                  </p>
                )}
                {jb && (
                  <p className="text-sm text-gray-800 dark:text-gray-200">
                    <span className="font-semibold">JB:</span> {jb.description} · {jb.shelf} · qty {jb.quantity}
                  </p>
                )}
                {!live && row.description && <p className="text-sm text-gray-800">{row.description} · {row.shelf}</p>}
                {row.fields?.length > 0 && (
                  <p className="text-sm text-orange-800 mt-1">Waiting on Accept JB: {row.fields.join(', ')}</p>
                )}
                {row.diffs?.length > 0 && (
                  <ul className="text-sm text-orange-800 mt-1 list-disc pl-4">
                    {row.diffs.map((diff) => (
                      <li key={diff.field}>{diff.field}: live “{diff.live}” → JB “{diff.jb}”</li>
                    ))}
                  </ul>
                )}
                {activeTab !== 'matchedClean' && activeTab !== 'liveOnly' && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button type="button" disabled={busy} onClick={() => saveDecision(row, 'accept_jb')} className="min-h-[56px] px-4 rounded-lg bg-red-700 text-white font-semibold disabled:opacity-50">
                      <Check className="w-4 h-4 inline mr-1" /> Accept JB
                    </button>
                    {live && (
                      <button type="button" disabled={busy} onClick={() => saveDecision(row, 'accept_live')} className="min-h-[56px] px-4 rounded-lg bg-gray-700 text-white font-semibold">
                        Keep live
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => saveDecision(row, 'skip')} className="min-h-[56px] px-4 rounded-lg border-2 border-gray-500 font-semibold">
                      <X className="w-4 h-4 inline mr-1" /> Skip
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ReconcileInventory;
