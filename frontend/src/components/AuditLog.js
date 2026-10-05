import React, { useMemo, useState } from 'react';
import { History, RefreshCw, Minus, Plus } from 'lucide-react';

const AuditLog = ({ transactions, onRefresh, loading }) => {
  const [tech, setTech] = useState('all');
  const [action, setAction] = useState('all');
  const [partQuery, setPartQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const techs = useMemo(() => {
    const names = new Set((transactions || []).map((row) => row.user).filter(Boolean));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [transactions]);

  const rows = useMemo(() => {
    const query = partQuery.trim().toLowerCase();
    return (transactions || []).filter((row) => {
      if (tech !== 'all' && row.user !== tech) return false;
      if (action !== 'all' && row.action !== action) return false;
      if (query) {
        const blob = `${row.partNumber || ''} ${row.notes || ''} ${row.roNumber || ''} ${row.unitNumber || ''}`.toLowerCase();
        if (!blob.includes(query)) return false;
      }
      const when = row.timestamp ? new Date(row.timestamp) : null;
      if (fromDate && when && when < new Date(`${fromDate}T00:00:00`)) return false;
      if (toDate && when && when > new Date(`${toDate}T23:59:59`)) return false;
      return true;
    });
  }, [transactions, tech, action, partQuery, fromDate, toDate]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <History className="w-7 h-7 text-red-700" />
            Audit Log
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {rows.length} events
            {transactions?.length ? ` of ${transactions.length}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="min-h-[56px] min-w-[56px] px-4 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold"
        >
          <RefreshCw className={`w-5 h-5 inline ${loading ? 'animate-spin' : ''}`} />
          <span className="ml-2">Refresh</span>
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4 sticky top-0 z-10 bg-white dark:bg-gray-800 py-2">
        <label className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Tech
          <select
            value={tech}
            onChange={(event) => setTech(event.target.value)}
            className="mt-1 w-full min-h-[56px] rounded-lg border-2 border-gray-400 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-3"
          >
            <option value="all">All techs</option>
            {techs.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Action
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="mt-1 w-full min-h-[56px] rounded-lg border-2 border-gray-400 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-3"
          >
            <option value="all">All actions</option>
            <option value="checkout">Check out</option>
            <option value="checkin">Check in</option>
            <option value="location_change">Location</option>
            <option value="import">Import</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Part, RO, or unit
          <input
            value={partQuery}
            onChange={(event) => setPartQuery(event.target.value)}
            className="mt-1 w-full min-h-[56px] rounded-lg border-2 border-gray-400 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-3"
            placeholder="P# or RO"
          />
        </label>
        <label className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          From
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="mt-1 w-full min-h-[56px] rounded-lg border-2 border-gray-400 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-3"
          />
        </label>
        <label className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          To
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="mt-1 w-full min-h-[56px] rounded-lg border-2 border-gray-400 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-3"
          />
        </label>
      </div>

      <div className="space-y-3 max-h-[70vh] overflow-y-auto">
        {rows.length === 0 ? (
          <p className="text-center text-gray-600 dark:text-gray-300 py-10">No events match these filters.</p>
        ) : (
          rows.map((row) => (
            <article key={row.id} className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
                    {row.action === 'checkout' ? (
                      <Minus className="w-5 h-5 text-red-700" />
                    ) : (
                      <Plus className="w-5 h-5 text-green-700" />
                    )}
                    {row.partNumber}
                    <span className={`text-sm px-2 py-1 rounded ${
                      row.action === 'checkout' ? 'bg-red-100 text-red-900' : 'bg-green-100 text-green-900'
                    }`}>
                      {row.action === 'checkout' ? 'Out' : row.action === 'checkin' ? 'In' : row.action}
                    </span>
                  </div>
                  <p className="text-base text-gray-900 dark:text-gray-100 mt-1">{row.user}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {row.timestamp ? new Date(row.timestamp).toLocaleString() : ''}
                  </p>
                  {(row.roNumber || row.unitNumber) && (
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                      {row.roNumber ? `RO ${row.roNumber}` : ''}
                      {row.roNumber && row.unitNumber ? ' · ' : ''}
                      {row.unitNumber ? `Unit ${row.unitNumber}` : ''}
                    </p>
                  )}
                  {row.notes && (
                    <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">{row.notes}</p>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
};

export default AuditLog;
