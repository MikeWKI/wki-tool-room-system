import React, { useCallback, useEffect, useState } from 'react';
import { manageAuthHeader } from '../utils/manageSession';

const inputClass = 'mt-1 w-full min-h-[56px] rounded-lg border-2 border-gray-400 px-3 bg-white dark:bg-gray-900 text-gray-900 dark:text-white';

const DoorAccountability = ({ apiCall }) => {
  const [status, setStatus] = useState(null);
  const [days, setDays] = useState(30);
  const [includeSeed, setIncludeSeed] = useState(false);
  const [includeSimulated, setIncludeSimulated] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [badges, setBadges] = useState([]);
  const [outbox, setOutbox] = useState([]);
  const [techName, setTechName] = useState('Noah R.');
  const [windowMinutes, setWindowMinutes] = useState('1');
  const [badgeForm, setBadgeForm] = useState({
    actorName: '',
    actorId: '',
    credential: '',
    techName: 'Noah R.',
    techEmail: '',
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // apiCall always attaches X-Platform-Token. It attaches the manage bearer on
  // writes only, so these manage GETs pass that bearer in the same helper.
  const manageGet = useCallback((path) => apiCall(path, { headers: manageAuthHeader() }), [apiCall]);

  const load = useCallback(async () => {
    setError('');
    try {
      const [nextStatus, nextMetrics, nextBadges, nextOutbox] = await Promise.all([
        manageGet('/door/status'),
        manageGet(`/door/metrics?days=${days}&includeSeed=${includeSeed ? '1' : '0'}&includeSimulated=${includeSimulated ? '1' : '0'}`),
        manageGet('/door/badges'),
        manageGet('/door/outbox'),
      ]);
      setStatus(nextStatus);
      setMetrics(nextMetrics);
      setBadges(nextBadges);
      setOutbox(nextOutbox);
      if (nextStatus?.roster?.length && !nextStatus.roster.includes(techName)) {
        setTechName(nextStatus.roster[0]);
      }
    } catch (err) {
      setError(err.message || 'Door accountability failed to load');
    }
  }, [days, includeSeed, includeSimulated, manageGet, techName]);

  useEffect(() => {
    load();
  }, [load]);

  const simulate = async (type) => {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const result = await apiCall('/door/simulate', {
        method: 'POST',
        body: JSON.stringify({
          techName,
          type,
          windowMinutes: Number(windowMinutes) || undefined,
        }),
      });
      setNotice(type === 'entry'
        ? `Simulated entry for ${result.visit?.displayName}. Window ${result.visit?.windowMinutes} min.`
        : 'Simulated exit.');
      await load();
    } catch (err) {
      setError(err.message || 'Simulation failed');
    } finally {
      setBusy(false);
    }
  };

  const saveBadge = async () => {
    setBusy(true);
    setError('');
    try {
      await apiCall('/door/badges', {
        method: 'POST',
        body: JSON.stringify(badgeForm),
      });
      setBadgeForm({ ...badgeForm, actorName: '', actorId: '', credential: '', techEmail: '' });
      await load();
    } catch (err) {
      setError(err.message || 'Could not save badge');
    } finally {
      setBusy(false);
    }
  };

  const removeBadge = async (id) => {
    setBusy(true);
    try {
      await apiCall(`/door/badges/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message || 'Could not remove badge');
    } finally {
      setBusy(false);
    }
  };

  const roster = status?.roster || [];
  const maxTrend = Math.max(1, ...(metrics?.trend || []).map((point) => point.entriesWithoutCheckout));

  return (
    <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Door accountability</h2>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 max-w-3xl">
          Badge entries open a visit window. No checkout or check-in in that window emails the supervisor.
          A 5 PM America/Chicago sweep emails techs who still have tools out. Seeded history and simulations stay out of the counts unless you turn them on.
        </p>
        {status?.alertsWarning && (
          <p className="mt-3 rounded-lg border-2 border-amber-500 bg-amber-50 text-gray-900 px-3 py-2 text-sm">{status.alertsWarning}</p>
        )}
        {status && (
          <p className="mt-2 text-sm text-gray-800 dark:text-gray-200">
            Email mode {status.alertsMode}. Window {status.windowMinutes} min. Sweep {status.sweepTime} CT {status.sweepDays.join(', ')}.
            {status.supervisorConfigured ? ' Supervisor address is set.' : ' Supervisor address is not set.'}
          </p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-4">
          <h3 className="font-bold text-gray-900 dark:text-white">Simulate door entry / exit</h3>
          <label className="block mt-3 text-sm font-semibold text-gray-900 dark:text-white">
            Tech
            <select value={techName} onChange={(event) => setTechName(event.target.value)} className={inputClass}>
              {(roster.length ? roster : [techName]).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="block mt-3 text-sm font-semibold text-gray-900 dark:text-white">
            Window minutes (1 for a short demo)
            <input
              inputMode="numeric"
              value={windowMinutes}
              onChange={(event) => setWindowMinutes(event.target.value)}
              className={inputClass}
            />
          </label>
          <div className="flex flex-wrap gap-3 mt-4">
            <button type="button" disabled={busy} onClick={() => simulate('entry')} className="min-h-[56px] px-4 rounded-lg bg-red-700 text-white font-semibold disabled:opacity-50">
              Simulate entry
            </button>
            <button type="button" disabled={busy} onClick={() => simulate('exit')} className="min-h-[56px] px-4 rounded-lg bg-gray-800 text-white font-semibold disabled:opacity-50">
              Simulate exit
            </button>
          </div>
        </div>

        <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-4">
          <h3 className="font-bold text-gray-900 dark:text-white">Map a badge</h3>
          <label className="block mt-3 text-sm font-semibold text-gray-900 dark:text-white">
            Badge name
            <input value={badgeForm.actorName} onChange={(event) => setBadgeForm({ ...badgeForm, actorName: event.target.value })} className={inputClass} />
          </label>
          <label className="block mt-3 text-sm font-semibold text-gray-900 dark:text-white">
            Badge id
            <input value={badgeForm.actorId} onChange={(event) => setBadgeForm({ ...badgeForm, actorId: event.target.value })} className={inputClass} />
          </label>
          <label className="block mt-3 text-sm font-semibold text-gray-900 dark:text-white">
            Roster tech
            <select value={badgeForm.techName} onChange={(event) => setBadgeForm({ ...badgeForm, techName: event.target.value })} className={inputClass}>
              {(roster.length ? roster : [badgeForm.techName]).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="block mt-3 text-sm font-semibold text-gray-900 dark:text-white">
            Tech email
            <input value={badgeForm.techEmail} onChange={(event) => setBadgeForm({ ...badgeForm, techEmail: event.target.value })} className={inputClass} placeholder="name@wki.example" />
          </label>
          <button type="button" disabled={busy} onClick={saveBadge} className="mt-4 min-h-[56px] px-4 rounded-lg bg-red-700 text-white font-semibold disabled:opacity-50">
            Save mapping
          </button>
        </div>
      </div>

      {badges.length > 0 && (
        <ul className="space-y-2">
          {badges.map((badge) => (
            <li key={badge.id} className="flex flex-wrap items-center justify-between gap-2 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2">
              <span className="text-gray-900 dark:text-white">
                {badge.actorName || badge.actorId || badge.credential} → {badge.techName} {badge.techEmail ? `(${badge.techEmail})` : ''}
              </span>
              <button type="button" onClick={() => removeBadge(badge.id)} className="min-h-[56px] px-3 rounded-lg bg-gray-200 dark:bg-gray-700 font-semibold">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <div className="flex flex-wrap gap-2">
          {[7, 30, 90].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDays(value)}
              className={`min-h-[56px] px-4 rounded-lg font-semibold ${days === value ? 'bg-red-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'}`}
            >
              {value} days
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 min-h-[56px] text-gray-900 dark:text-white">
          <input type="checkbox" checked={includeSeed} onChange={(event) => setIncludeSeed(event.target.checked)} />
          Include seeded history
        </label>
        <label className="flex items-center gap-2 min-h-[56px] text-gray-900 dark:text-white">
          <input type="checkbox" checked={includeSimulated} onChange={(event) => setIncludeSimulated(event.target.checked)} />
          Include simulated door events
        </label>
      </div>

      <div>
        <h3 className="font-bold text-gray-900 dark:text-white">Top offenders</h3>
        {(metrics?.topOffenders || []).length === 0 ? (
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">No entry-without-checkout or late-return rows in this window.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {metrics.topOffenders.map((row, index) => (
              <li key={row.tech} className="border border-gray-300 dark:border-gray-600 rounded-lg p-3 text-gray-900 dark:text-white">
                {index + 1}. {row.tech} — {row.entriesWithoutCheckout} without checkout, {row.lateReturns} late at 5 PM, {row.overdueItems} overdue
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-900 dark:text-white">
          <thead>
            <tr className="border-b border-gray-300 dark:border-gray-600">
              <th className="py-2 pr-3">Tech</th>
              <th className="py-2 pr-3">Entries</th>
              <th className="py-2 pr-3">No checkout</th>
              <th className="py-2 pr-3">Late</th>
              <th className="py-2 pr-3">Overdue</th>
              <th className="py-2 pr-3">Avg hours out</th>
            </tr>
          </thead>
          <tbody>
            {(metrics?.techs || []).map((row) => (
              <tr key={row.tech} className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-3">{row.tech}</td>
                <td className="py-2 pr-3">{row.doorEntries}</td>
                <td className="py-2 pr-3">{row.entriesWithoutCheckout}</td>
                <td className="py-2 pr-3">{row.lateReturns}</td>
                <td className="py-2 pr-3">{row.overdueItems}</td>
                <td className="py-2 pr-3">{row.averageHoursOut == null ? '—' : row.averageHoursOut}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="font-bold text-gray-900 dark:text-white">Entries without checkout</h3>
        <div className="mt-2 space-y-1">
          {(metrics?.trend || []).filter((point) => point.entriesWithoutCheckout > 0).slice(-14).map((point) => (
            <div key={point.date} className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
              <span className="w-24">{point.date.slice(5)}</span>
              <span className="h-3 bg-red-700 rounded" style={{ width: `${Math.max(8, (point.entriesWithoutCheckout / maxTrend) * 160)}px` }} />
              <span>{point.entriesWithoutCheckout}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-bold text-gray-900 dark:text-white">Email outbox</h3>
        {outbox.length === 0 ? (
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">No emails stored.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {outbox.slice(0, 8).map((row) => (
              <li key={row.id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-3">
                <p className="font-semibold text-gray-900 dark:text-white">{row.subject}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{row.status} · {row.mode} · {row.to || 'no recipient'}</p>
                {row.warning && <p className="text-sm text-amber-800 dark:text-amber-200">{row.warning}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {notice && <p className="text-gray-900 dark:text-white">{notice}</p>}
      {error && <p className="text-red-700">{error}</p>}
    </section>
  );
};

export default DoorAccountability;
