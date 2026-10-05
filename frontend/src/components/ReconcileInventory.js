import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  GitCompare,
  RefreshCw,
  X,
  Lock,
} from 'lucide-react';

const TABS = [
  { id: 'matchedWithDiffs', label: 'Matched (diffs)' },
  { id: 'jbOnly', label: 'JB only' },
  { id: 'liveOnly', label: 'Live only' },
  { id: 'matchedClean', label: 'Matched (clean)' },
];

const ReconcileInventory = ({ apiCall, currentUser }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('matchedWithDiffs');
  const [stagingBusy, setStagingBusy] = useState(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiCall('/reconcile/report');
      setReport(data);
    } catch (e) {
      setError(e.message || 'Failed to load reconcile report');
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const saveDecision = async (row, decision) => {
    setStagingBusy(row.partNumber || row.live?.partNumber);
    try {
      await apiCall('/reconcile/staging/accept', {
        method: 'POST',
        body: JSON.stringify({
          partNumber: row.partNumber || row.live?.partNumber || row.jb?.partNumber,
          decision,
          acceptedBy: currentUser || 'Reconcile UI',
          jbSnapshot: row.jb || row,
          liveSnapshot: row.live || null,
          proposedChanges: row.diffs || null,
        }),
      });
      await loadReport();
    } catch (e) {
      setError(e.message);
    } finally {
      setStagingBusy(null);
    }
  };

  const rows = report ? report[activeTab] || [] : [];
  const meta = report?.meta;
  const stagingCount = report?.staging?.count ?? 0;
  const applyDisabled = !report?.applyToLiveEnabled;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <GitCompare className="w-6 h-6 text-red-600" />
            JB Reconcile (draft)
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
            Compare live Mongo inventory to JB JSON (325 rows). Accept saves to{' '}
            <strong>staging only</strong> — nothing is written to live parts until Michael
            chooses an import strategy.
          </p>
        </div>
        <button
          type="button"
          onClick={loadReport}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {applyDisabled && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100 text-sm">
          <Lock className="w-5 h-5 shrink-0 mt-0.5" />
          Apply-to-live is disabled. Per-row Accept records your choice in staging; it does not
          POST/PUT live inventory.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-800 rounded-lg text-sm flex items-center gap-2">
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
            ['Staging decisions', stagingCount],
          ].map(([label, value]) => (
            <div
              key={label}
              className="p-2 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700"
            >
              <div className="text-lg font-bold text-red-600">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-200 dark:border-gray-600 pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              activeTab === tab.id
                ? 'bg-red-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {tab.label}
            {report && (
              <span className="ml-1 opacity-80">
                ({(report[tab.id] || []).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-3 max-h-[55vh] overflow-y-auto">
        {loading && !report ? (
          <p className="text-center text-gray-500 py-8">Loading report…</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No rows in this bucket.</p>
        ) : (
          rows.map((row, idx) => {
            const pn =
              row.partNumber ||
              row.live?.partNumber ||
              row.jb?.partNumber ||
              `row-${idx}`;
            const busy = stagingBusy === pn;
            return (
              <div
                key={`${pn}-${idx}`}
                className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 text-sm"
              >
                <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {pn}
                </div>
                {row.live && (
                  <div className="mb-1 text-gray-600 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Live:</span>{' '}
                    {row.live.description} · {row.live.shelf || 'TBD'} · qty {row.live.quantity}
                  </div>
                )}
                {row.jb && (
                  <div className="mb-1 text-gray-600 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-300">JB:</span>{' '}
                    {row.jb.description} · {row.jb.shelf} · qty {row.jb.quantity}
                  </div>
                )}
                {!row.live && row.description && (
                  <div className="text-gray-600 dark:text-gray-400 mb-1">{row.description}</div>
                )}
                {row.diffs?.length > 0 && (
                  <ul className="text-xs text-orange-700 dark:text-orange-300 mb-2 list-disc pl-4">
                    {row.diffs.map((d) => (
                      <li key={d.field}>
                        {d.field}: live “{d.live}” → JB “{d.jb}”
                      </li>
                    ))}
                  </ul>
                )}
                {activeTab !== 'matchedClean' && activeTab !== 'liveOnly' && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => saveDecision(row, 'accept_jb')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-md text-xs disabled:opacity-50"
                    >
                      <Check className="w-3 h-3" />
                      Accept JB (staging)
                    </button>
                    {row.live && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => saveDecision(row, 'accept_live')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-600 text-white rounded-md text-xs disabled:opacity-50"
                      >
                        Keep live (staging)
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => saveDecision(row, 'skip')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-md text-xs"
                    >
                      <X className="w-3 h-3" />
                      Skip
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
