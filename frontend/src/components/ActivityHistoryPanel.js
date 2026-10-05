import React, { useState } from 'react';

const ActivityHistoryPanel = ({ apiCall, onLoaded }) => {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const run = async (confirm) => {
    if (!pin.trim()) {
      setError('Enter the manage PIN. It is checked on the server.');
      return;
    }
    if (confirm && !window.confirm('Load shop activity history? Existing parts stay. This replaces only the previous activity batch.')) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await apiCall('/audit/load-activity', {
        method: 'POST',
        body: JSON.stringify({ pin, confirm }),
      });
      setResult(data);
      if (confirm && onLoaded) onLoaded();
    } catch (err) {
      setError(err.message || 'Activity load failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Load shop activity</h2>
      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 max-w-3xl">
        Replaces the shop activity batch with about 95 days of check-out and check-in history for the current short roster.
        Leftover rows and checked-out parts that still name someone else are reassigned. Live parts are not deleted. Run a preview first. The server checks MANAGE_PIN.
      </p>
      <label className="block mt-4 text-sm font-semibold text-gray-900 dark:text-white">
        Manage PIN
        <input
          type="password"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          className="mt-1 w-full max-w-xs min-h-[56px] rounded-lg border-2 border-gray-400 px-3 bg-white dark:bg-gray-900"
          autoComplete="off"
        />
      </label>
      <div className="flex flex-wrap gap-3 mt-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(false)}
          className="min-h-[56px] px-4 rounded-lg bg-gray-800 text-white font-semibold disabled:opacity-50"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(true)}
          className="min-h-[56px] px-4 rounded-lg bg-red-700 text-white font-semibold disabled:opacity-50"
        >
          Load history
        </button>
      </div>
      {error && <p className="mt-3 text-red-700">{error}</p>}
      {result && (
        <div className="mt-3 text-gray-900 dark:text-gray-100 text-sm">
          <p>{result.dryRun ? 'Preview only. Nothing written.' : 'History written.'}</p>
          <p>
            Events {result.transactions}. Check-outs {result.checkouts}. Check-ins {result.checkins}. Still out {result.stillOpen}. Parts deleted {result.partsDeleted ?? 0}.
          </p>
        </div>
      )}
    </section>
  );
};

export default ActivityHistoryPanel;
