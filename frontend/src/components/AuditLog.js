import React, { useMemo, useState } from 'react';
import { History, RefreshCw, Minus, Plus } from 'lucide-react';

const PAGE = 40;

function minutesBetween(start, end) {
  if (!start || !end) return null;
  const minutes = Math.round((new Date(end) - new Date(start)) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  return minutes;
}

function formatDuration(minutes) {
  if (minutes == null) return '';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

const AuditLog = ({ transactions, onRefresh, loading }) => {
  const [tech, setTech] = useState('all');
  const [action, setAction] = useState('all');
  const [partQuery, setPartQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE);

  const source = transactions || [];

  const openCheckoutIds = useMemo(() => {
    const returned = new Set(
      source
        .filter((row) => row.action === 'checkin' && row.checkoutId != null)
        .map((row) => row.checkoutId)
    );
    return new Set(
      source
        .filter((row) => row.action === 'checkout' && !returned.has(row.id))
        .map((row) => row.id)
    );
  }, [source]);

  const checkoutById = useMemo(() => {
    const map = new Map();
    for (const row of source) {
      if (row.action === 'checkout') map.set(row.id, row);
    }
    return map;
  }, [source]);

  const techs = useMemo(() => {
    const names = new Set(source.map((row) => row.user).filter(Boolean));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [source]);

  const rows = useMemo(() => {
    const query = partQuery.trim().toLowerCase();
    return source
      .filter((row) => {
        if (tech !== 'all' && row.user !== tech) return false;
        if (action === 'still_out') {
          const checkoutId = row.action === 'checkout' ? row.id : row.checkoutId;
          if (!openCheckoutIds.has(checkoutId)) return false;
        } else if (action !== 'all' && row.action !== action) {
          return false;
        }
        if (query) {
          const blob = `${row.partNumber || ''} ${row.notes || ''} ${row.roNumber || ''} ${row.unitNumber || ''} ${row.user || ''}`.toLowerCase();
          if (!blob.includes(query)) return false;
        }
        const when = row.timestamp ? new Date(row.timestamp) : null;
        if (fromDate && when && when < new Date(`${fromDate}T00:00:00`)) return false;
        if (toDate && when && when > new Date(`${toDate}T23:59:59`)) return false;
        return true;
      })
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [source, tech, action, partQuery, fromDate, toDate, openCheckoutIds]);

  const shown = rows.slice(0, visibleCount);
  const filtersOn = tech !== 'all' || action !== 'all' || partQuery || fromDate || toDate;

  const clearFilters = () => {
    setTech('all');
    setAction('all');
    setPartQuery('');
    setFromDate('');
    setToDate('');
    setVisibleCount(PAGE);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <History className="w-7 h-7 text-red-700" />
            Audit Log
          </h2>
          <p className="text-base text-gray-800 dark:text-gray-100">
            {rows.length} events
            {source.length ? ` of ${source.length}` : ''}
            {openCheckoutIds.size ? ` · ${openCheckoutIds.size} still out` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="min-h-[56px] min-w-[56px] px-4 rounded-lg bg-gray-900 text-white font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 inline ${loading ? 'animate-spin' : ''}`} />
          <span className="ml-2">Refresh</span>
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-3 sticky top-0 z-10 bg-white dark:bg-gray-800 py-2">
        <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Tech
          <select
            value={tech}
            onChange={(event) => { setTech(event.target.value); setVisibleCount(PAGE); }}
            className="mt-1 w-full min-h-[56px] rounded-lg border-2 border-gray-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-3 text-base"
          >
            <option value="all">All techs</option>
            {techs.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Action
          <select
            value={action}
            onChange={(event) => { setAction(event.target.value); setVisibleCount(PAGE); }}
            className="mt-1 w-full min-h-[56px] rounded-lg border-2 border-gray-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-3 text-base"
          >
            <option value="all">All actions</option>
            <option value="checkout">Check out</option>
            <option value="checkin">Check in</option>
            <option value="still_out">Still out</option>
            <option value="location_change">Location</option>
            <option value="import">Import</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Part, RO, unit, or tech
          <input
            value={partQuery}
            onChange={(event) => { setPartQuery(event.target.value); setVisibleCount(PAGE); }}
            className="mt-1 w-full min-h-[56px] rounded-lg border-2 border-gray-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-3 text-base"
            placeholder="P# or RO"
          />
        </label>
        <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          From
          <input
            type="date"
            value={fromDate}
            onChange={(event) => { setFromDate(event.target.value); setVisibleCount(PAGE); }}
            className="mt-1 w-full min-h-[56px] rounded-lg border-2 border-gray-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-3 text-base"
          />
        </label>
        <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          To
          <input
            type="date"
            value={toDate}
            onChange={(event) => { setToDate(event.target.value); setVisibleCount(PAGE); }}
            className="mt-1 w-full min-h-[56px] rounded-lg border-2 border-gray-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-3 text-base"
          />
        </label>
      </div>

      {filtersOn && (
        <button
          type="button"
          onClick={clearFilters}
          className="mb-4 min-h-[56px] px-4 rounded-lg border-2 border-gray-500 text-gray-900 dark:text-white font-semibold"
        >
          Clear filters
        </button>
      )}

      <div className="space-y-3">
        {source.length === 0 ? (
          <p className="text-center text-lg text-gray-800 dark:text-gray-100 py-10">
            No check-out history yet. From Manage, preview and load shop activity.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-center text-lg text-gray-800 dark:text-gray-100 py-10">No events match these filters.</p>
        ) : (
          shown.map((row) => {
            const checkout = row.action === 'checkin' ? checkoutById.get(row.checkoutId) : null;
            const duration = checkout ? formatDuration(minutesBetween(checkout.timestamp, row.timestamp)) : '';
            const stillOut = row.action === 'checkout' && openCheckoutIds.has(row.id);
            return (
              <article key={row.id} className="border-2 border-gray-400 dark:border-gray-500 rounded-lg p-4">
                <div className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
                  {row.action === 'checkout' ? (
                    <Minus className="w-6 h-6 text-red-700" />
                  ) : (
                    <Plus className="w-6 h-6 text-green-700" />
                  )}
                  {row.partNumber}
                  <span className={`text-sm px-2 py-1 rounded ${
                    stillOut
                      ? 'bg-orange-200 text-orange-950'
                      : row.action === 'checkout'
                        ? 'bg-red-100 text-red-950'
                        : 'bg-green-100 text-green-950'
                  }`}>
                    {stillOut ? 'Still out' : row.action === 'checkout' ? 'Out' : row.action === 'checkin' ? 'In' : row.action}
                  </span>
                </div>
                <p className="text-lg text-gray-900 dark:text-white mt-1">{row.user}</p>
                <p className="text-base text-gray-800 dark:text-gray-100">
                  {row.timestamp ? new Date(row.timestamp).toLocaleString() : ''}
                  {duration ? ` · out ${duration}` : ''}
                </p>
                {(row.roNumber || row.unitNumber) && (
                  <p className="text-base font-semibold text-gray-900 dark:text-white mt-1">
                    {row.roNumber ? `RO ${row.roNumber}` : ''}
                    {row.roNumber && row.unitNumber ? ' · ' : ''}
                    {row.unitNumber ? `Unit ${row.unitNumber}` : ''}
                  </p>
                )}
                {row.notes && (
                  <p className="text-base text-gray-800 dark:text-gray-100 mt-1">{row.notes}</p>
                )}
              </article>
            );
          })
        )}
      </div>

      {rows.length > shown.length && (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + PAGE)}
          className="mt-4 w-full min-h-[56px] rounded-lg bg-gray-900 text-white text-lg font-bold"
        >
          Show more ({rows.length - shown.length} left)
        </button>
      )}
    </div>
  );
};

export default AuditLog;
