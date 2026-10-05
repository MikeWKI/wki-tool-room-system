import React, { useState } from 'react';

const EnrichmentLoader = ({ apiCall, onLoaded }) => {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const data = await apiCall('/parts/enrich-batch', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setResult(data);
      if (onLoaded) onLoaded();
    } catch (err) {
      setError(err.message || 'Could not load enrichment file');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  return (
    <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Load enrichment</h2>
      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 max-w-3xl">
        Upload a JSON file of part details. Matching P#s are updated. Unknown fields stay empty.
        Quantity, shelf, and checkout state are left alone. No parts are deleted.
      </p>
      <label className="mt-4 inline-flex items-center min-h-[56px] px-4 rounded-lg bg-red-700 text-white font-semibold cursor-pointer">
        {busy ? 'Loading…' : 'Choose enrichment JSON'}
        <input type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
      </label>
      {error && <p className="mt-3 text-red-700">{error}</p>}
      {result?.summary && (
        <p className="mt-3 text-gray-900 dark:text-gray-100">
          Updated {result.summary.partsUpdated}. Unmatched {result.summary.unmatched}. Rejected {result.summary.rejected}. Deleted {result.summary.deleted}.
        </p>
      )}
    </section>
  );
};

export default EnrichmentLoader;
