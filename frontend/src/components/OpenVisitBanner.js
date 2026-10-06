import React, { useEffect, useState } from 'react';

/**
 * Kiosk prompt for a door visit that is still inside its window.
 * "No tool taken / returning only" is logged. It does not stop the supervisor
 * email unless the API was configured to allow that.
 */
const OpenVisitBanner = ({ apiCall, techName }) => {
  const [visit, setVisit] = useState(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!techName) {
      setVisit(null);
      return undefined;
    }
    apiCall(`/door/open-visit?name=${encodeURIComponent(techName)}`)
      .then((data) => {
        if (!cancelled) setVisit(data.visit || null);
      })
      .catch(() => {
        if (!cancelled) setVisit(null);
      });
    return () => {
      cancelled = true;
    };
  }, [apiCall, techName]);

  const submit = async () => {
    if (!reason.trim()) {
      setError('Add a short reason.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await apiCall(`/door/visits/${visit.id}/ack`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setMessage(result.suppressesAlert
        ? 'Note saved. The supervisor email is turned off for notes on this server.'
        : 'Note saved. Jon still gets the entry email unless a tool is checked out or in.');
      setVisit(null);
    } catch (err) {
      setError(err.message || 'Could not save the note');
    } finally {
      setBusy(false);
    }
  };

  if (!visit && !message) return null;

  return (
    <section className="bg-amber-50 dark:bg-amber-950 border-2 border-amber-500 rounded-lg p-4">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white">Tool room door</h2>
      {visit && (
        <>
          <p className="text-gray-900 dark:text-gray-100 mt-1">
            {visit.displayName} is inside an open door visit. If you are not taking a tool, say so.
          </p>
          <label className="block mt-3 text-sm font-semibold text-gray-900 dark:text-white">
            No tool taken / returning only
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full min-h-[56px] rounded-lg border-2 border-gray-400 px-3 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              placeholder="Returning a tool, or no tool taken"
            />
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="mt-3 min-h-[56px] px-4 rounded-lg bg-red-700 text-white font-semibold disabled:opacity-50"
          >
            Save note
          </button>
        </>
      )}
      {error && <p className="mt-2 text-red-700">{error}</p>}
      {message && <p className="mt-2 text-gray-900 dark:text-gray-100">{message}</p>}
    </section>
  );
};

export default OpenVisitBanner;
