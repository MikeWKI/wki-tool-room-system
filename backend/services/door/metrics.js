const { chicagoDayKey } = require('./chicagoTime');
const { transactionOrigin, countsInMetrics } = require('./origins');

function norm(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function inWindow(timestamp, start, end) {
  const time = new Date(timestamp).getTime();
  return time >= start.getTime() && time <= end.getTime();
}

function hoursBetween(start, end) {
  return (new Date(end).getTime() - new Date(start).getTime()) / 36e5;
}

function techKey(visit) {
  return visit.techName || visit.displayName || 'Unknown';
}

function buildMetrics({
  visits,
  transactions,
  sweeps,
  now,
  days,
  includeSeed,
  includeSimulated,
}) {
  const end = now;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const opts = { includeSeed, includeSimulated };
  const byTech = new Map();

  const ensure = (name) => {
    const key = name || 'Unknown';
    if (!byTech.has(key)) {
      byTech.set(key, {
        tech: key,
        doorEntries: 0,
        entriesWithoutCheckout: 0,
        acknowledgements: 0,
        lateReturns: 0,
        overdueItems: 0,
        hoursOutTotal: 0,
        hoursOutCount: 0,
        averageHoursOut: null,
      });
    }
    return byTech.get(key);
  };

  const trendMap = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    trendMap.set(chicagoDayKey(day), { date: chicagoDayKey(day), entriesWithoutCheckout: 0 });
  }

  for (const visit of visits || []) {
    const origin = visit.source === 'simulated' ? 'simulated' : 'live';
    if (!countsInMetrics(origin, opts)) continue;
    const entered = new Date(visit.enteredAt);
    if (Number.isNaN(entered.getTime()) || entered < start || entered > end) continue;
    const row = ensure(techKey(visit));
    row.doorEntries += 1;
    if (visit.status === 'entry_without_checkout') {
      row.entriesWithoutCheckout += 1;
      const bucket = trendMap.get(chicagoDayKey(entered));
      if (bucket) bucket.entriesWithoutCheckout += 1;
    }
    if (visit.ackAt) row.acknowledgements += 1;
  }

  for (const sweep of sweeps || []) {
    const ran = new Date(sweep.ranAt);
    if (Number.isNaN(ran.getTime()) || ran < start || ran > end) continue;
    for (const item of sweep.items || []) {
      const origin = item.seeded ? 'seed' : 'live';
      if (!countsInMetrics(origin, opts)) continue;
      const row = ensure(item.user);
      row.lateReturns += 1;
      if (item.overdue) row.overdueItems += 1;
    }
  }

  const tx = (transactions || []).filter((row) => countsInMetrics(transactionOrigin(row), opts));
  const techs = new Set(Array.from(byTech.keys()));
  for (const row of tx) {
    if (row.user) techs.add(row.user);
  }
  for (const name of techs) {
    const checkouts = tx.filter((row) => (
      row.action === 'checkout'
      && norm(row.user) === norm(name)
      && inWindow(row.timestamp, start, end)
    ));
    if (!checkouts.length) continue;
    const bucket = ensure(name);
    for (const checkout of checkouts) {
      const checkin = tx.find((row) => row.action === 'checkin' && row.checkoutId != null && row.checkoutId === checkout.id)
        || tx.find((row) => (
          row.action === 'checkin'
          && norm(row.user) === norm(name)
          && row.partId != null
          && row.partId === checkout.partId
          && new Date(row.timestamp) > new Date(checkout.timestamp)
        ));
      const stop = checkin ? checkin.timestamp : now;
      bucket.hoursOutTotal += Math.max(0, hoursBetween(checkout.timestamp, stop));
      bucket.hoursOutCount += 1;
    }
  }

  const techsOut = Array.from(byTech.values()).map((row) => ({
    ...row,
    averageHoursOut: row.hoursOutCount ? Math.round((row.hoursOutTotal / row.hoursOutCount) * 10) / 10 : null,
    hoursOutTotal: undefined,
    hoursOutCount: undefined,
  }));
  techsOut.sort((a, b) => a.tech.localeCompare(b.tech));

  const topOffenders = techsOut
    .filter((row) => row.entriesWithoutCheckout || row.lateReturns || row.overdueItems)
    .slice()
    .sort((a, b) => (
      b.entriesWithoutCheckout - a.entriesWithoutCheckout
      || b.lateReturns - a.lateReturns
      || b.overdueItems - a.overdueItems
      || a.tech.localeCompare(b.tech)
    ));

  return {
    days,
    includeSeed: Boolean(includeSeed),
    includeSimulated: Boolean(includeSimulated),
    from: start.toISOString(),
    to: end.toISOString(),
    techs: techsOut,
    topOffenders,
    trend: Array.from(trendMap.values()),
  };
}

module.exports = { buildMetrics };
