/**
 * Build shop-floor checkout/check-in history from the tech roster.
 * Output is deterministic for a given parts list, asOf, and rng seed.
 * User-visible fields are tech names, part numbers, RO/unit notes — never batch labels.
 */

const { TECHS, checkoutChance } = require('../data/techRoster');

const BATCH_KEY = 'shop-activity-95d';
const DAY_COUNT = 95;
const TIME_ZONE = 'America/Chicago';

const SHIFT_WINDOWS = {
  '1st': [6 * 60 + 8, 13 * 60 + 35],
  training: [7 * 60 + 5, 11 * 60 + 20],
  '2nd': [14 * 60 + 12, 20 * 60 + 50],
  body: [7 * 60 + 2, 14 * 60 + 15],
  service: [6 * 60 + 25, 16 * 60 + 5],
  recon: [8 * 60 + 10, 12 * 60 + 5],
  office: [8 * 60 + 20, 11 * 60 + 40],
  weekend: [8 * 60 + 15, 11 * 60 + 40],
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chicagoParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
  };
}

function zonedTimeToUtc(year, month, day, hour, minute, second) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const part of fmt.formatToParts(new Date(utcGuess))) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return new Date(utcGuess - (asUtc - utcGuess));
}

function addDays(ymd, days) {
  const utc = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

function weekdayOf(ymd) {
  const noon = zonedTimeToUtc(ymd.year, ymd.month, ymd.day, 12, 0, 0);
  return chicagoParts(noon).weekday;
}

function isLaborDay(ymd) {
  if (ymd.month !== 9) return false;
  const first = new Date(Date.UTC(ymd.year, 8, 1));
  const add = (1 - first.getUTCDay() + 7) % 7;
  return ymd.day === 1 + add;
}

function isJulyFourth(ymd) {
  return ymd.month === 7 && ymd.day === 4;
}

function dayBeforeJulyFourth(ymd) {
  return ymd.month === 7 && ymd.day === 3;
}

function resolveFamily(part) {
  const stored = part?.engineFamily;
  if (['MX', 'Cummins', 'CAT', 'Detroit', 'Allison', 'Paccar', 'General'].includes(stored)) {
    return stored;
  }
  const category = String(part?.category || '').toLowerCase();
  const description = String(part?.description || '').toLowerCase();
  const text = `${category} ${description}`;
  if (text.includes('cummins') || /\bisx\b|\bisb\b|\bisl\b|\bisc\b|\bx15\b/.test(text)) return 'Cummins';
  if (text.includes('detroit') || text.includes('dd15') || text.includes('dd13')) return 'Detroit';
  if (text.includes('allison')) return 'Allison';
  if (/\bcat\b|caterpillar|\bc15\b/.test(text)) return 'CAT';
  if (text.includes('paccar') && !text.includes('mx')) return 'Paccar';
  if (text.includes('mx')) return 'MX';
  return 'General';
}

function familyWeight(tech, family) {
  const specs = (tech.specialties || []).map((item) => item.toLowerCase());
  const has = (needle) => specs.some((item) => item.includes(needle));
  let weight = 1;
  if (family === 'Cummins' && (has('cummins') || has('engine'))) weight += 9;
  if (family === 'Allison' && (has('allison') || has('powertrain'))) weight += 9;
  if (family === 'MX' && (has('cummins') || has('engine') || has('alt'))) weight += 4;
  if (family === 'Detroit' && has('engine')) weight += 5;
  if (family === 'CAT' && has('engine')) weight += 4;
  if (family === 'Paccar' && (has('alt') || has('engine'))) weight += 3;
  if (family === 'General' && (has('wb') || has('bendix') || has('elect') || has('chassis') || has('body') || has('hvac'))) {
    weight += 4;
  }
  if (tech.group === 'office' || tech.partsCounter) weight = Math.max(1, Math.round(weight * 0.4));
  return weight;
}

function pickDurationMinutes(rng) {
  const roll = rng();
  if (roll < 0.54) return 35 + Math.floor(rng() * 56);
  if (roll < 0.8) return 148 + Math.floor(rng() * 128);
  if (roll < 0.94) return 355 + Math.floor(rng() * 190);
  return 13 * 60 + Math.floor(rng() * 8 * 60);
}

function makeRo(rng) {
  const digits = rng() < 0.42 ? 5 : 6;
  const min = digits === 5 ? 10234 : 104821;
  const span = digits === 5 ? 86000 : 860000;
  let value = String(min + Math.floor(rng() * span));
  if (/^(\d)\1+$/.test(value)) value = String(Number(value) + 17 + Math.floor(rng() * 40));
  return value;
}

function makeUnit(rng) {
  const roll = rng();
  if (roll < 0.62) return String(120 + Math.floor(rng() * 8700));
  if (roll < 0.84) return String(18 + Math.floor(rng() * 80));
  return `T${180 + Math.floor(rng() * 820)}`;
}

function noteFor(rng, ro, unit, tech) {
  const roll = rng();
  if (roll < 0.16) return '';
  if (tech.group === 'service' && roll < 0.45) return `Road call unit ${unit} RO ${ro}`;
  if (tech.group === 'body' && roll < 0.4) return `Stall work unit ${unit} RO ${ro}`;
  if (roll < 0.55) return `RO ${ro} unit ${unit}`;
  if (roll < 0.78) return `Unit ${unit} RO ${ro}`;
  if (roll < 0.9) return `RO ${ro}`;
  return `Unit ${unit}`;
}

function toolCount(rng, tech) {
  if (tech.group === 'office' || tech.partsCounter) return 1;
  const roll = rng();
  if (roll < 0.48) return 1;
  if (roll < 0.82) return 2;
  return 3;
}

function overlaps(reservations, start, end, quantity) {
  const count = reservations.filter((row) => row.start < end && row.end > start).length;
  return count >= quantity;
}

function pickPart(parts, tech, start, end, reservations, rng) {
  const candidates = [];
  for (const part of parts) {
    if (!part || part.quantity == null || Number(part.quantity) <= 0) continue;
    if (!part.partNumber) continue;
    const rows = reservations.get(part.id) || [];
    if (overlaps(rows, start, end, Number(part.quantity))) continue;
    candidates.push({ part, weight: familyWeight(tech, resolveFamily(part)) });
  }
  if (candidates.length === 0) return null;
  const total = candidates.reduce((sum, row) => sum + row.weight, 0);
  let roll = rng() * total;
  for (const row of candidates) {
    roll -= row.weight;
    if (roll <= 0) return row.part;
  }
  return candidates[candidates.length - 1].part;
}

function nextId(ms, used) {
  let id = ms;
  while (used.has(id)) id += 1;
  used.add(id);
  return id;
}

function buildShopActivity({ parts, asOf = new Date(), seed = 20261005, techs = TECHS } = {}) {
  const rng = mulberry32(seed);
  const endYmd = chicagoParts(asOf);
  const startYmd = addDays(endYmd, -(DAY_COUNT - 1));
  const reservations = new Map();
  const runningQty = new Map(parts.map((part) => [part.id, Number(part.quantity) || 0]));
  const usedIds = new Set();
  const closed = [];
  const openCandidates = [];
  const asOfMs = asOf.getTime();

  for (let offset = 0; offset < DAY_COUNT; offset += 1) {
    const ymd = addDays(startYmd, offset);
    const weekday = weekdayOf(ymd);
    const weekend = weekday === 'Sat' || weekday === 'Sun';
    const holiday = isLaborDay(ymd) || isJulyFourth(ymd);
    let dayTechs = techs.filter((tech) => tech.days.includes(weekday));
    if (weekend) {
      if (rng() > 0.18) continue;
      dayTechs = techs.filter((tech) => tech.weekend);
      if (dayTechs.length === 0) continue;
    }
    if (holiday) {
      dayTechs = dayTechs.filter((tech) => tech.group === 'service' || tech.weekend);
      if (rng() > 0.35) continue;
    }

    const heavy = !weekend && !holiday && rng() < 0.08;
    const light = !weekend && !holiday && !heavy && (rng() < 0.07 || dayBeforeJulyFourth(ymd));
    const order = dayTechs
      .map((tech) => ({ tech, sort: rng() }))
      .sort((a, b) => a.sort - b.sort)
      .map((row) => row.tech);

    for (const tech of order) {
      let chance = weekend ? 0.85 : checkoutChance(tech);
      if (heavy) chance = Math.min(0.95, chance * 1.45);
      if (light) chance *= 0.45;
      if (rng() > chance) continue;

      const tools = weekend ? 1 + (rng() < 0.25 ? 1 : 0) : toolCount(rng, tech);
      const ro = makeRo(rng);
      const unit = makeUnit(rng);
      const [windowStart, windowEnd] = weekend
        ? SHIFT_WINDOWS.weekend
        : SHIFT_WINDOWS[tech.group] || SHIFT_WINDOWS['1st'];
      let minute = windowStart + Math.floor(rng() * Math.max(1, windowEnd - windowStart));

      for (let tool = 0; tool < tools; tool += 1) {
        if (tool > 0) minute += 6 + Math.floor(rng() * 28);
        const hour = Math.floor(minute / 60);
        const min = minute % 60;
        const second = Math.floor(rng() * 60);
        const start = zonedTimeToUtc(ymd.year, ymd.month, ymd.day, hour, min, second);
        let duration = pickDurationMinutes(rng);
        let end = new Date(start.getTime() + duration * 60000);
        let leaveOpen = false;

        if (end.getTime() > asOfMs) {
          const ageMin = (asOfMs - start.getTime()) / 60000;
          if (ageMin >= 35 && ageMin < 36 * 60 && openCandidates.length < 12 && rng() < 0.55) {
            leaveOpen = true;
            end = new Date(asOfMs);
          } else if (ageMin >= 40) {
            const back = 8 + Math.floor(rng() * 25);
            end = new Date(asOfMs - back * 60000);
            if (end.getTime() - start.getTime() < 35 * 60000) continue;
            duration = Math.round((end.getTime() - start.getTime()) / 60000);
          } else {
            continue;
          }
        }

        const part = pickPart(parts, tech, start.getTime(), end.getTime(), reservations, rng);
        if (!part) continue;
        const qty = runningQty.has(part.id) ? runningQty.get(part.id) : Number(part.quantity) || 0;
        if (qty <= 0) continue;

        const rows = reservations.get(part.id) || [];
        rows.push({ start: start.getTime(), end: end.getTime() });
        reservations.set(part.id, rows);
        const checkoutId = nextId(start.getTime(), usedIds);
        const note = noteFor(rng, ro, unit, tech);
        const checkout = {
          id: checkoutId,
          partId: part.id,
          partNumber: part.partNumber,
          action: 'checkout',
          user: tech.name,
          timestamp: start.toISOString(),
          notes: note,
          roNumber: ro,
          unitNumber: unit,
          fromQuantity: qty,
          toQuantity: qty - 1,
          batchKey: BATCH_KEY,
        };
        runningQty.set(part.id, qty - 1);

        if (leaveOpen) {
          openCandidates.push({
            checkout,
            partId: part.id,
            user: tech.name,
            checkedOutDate: start.toISOString(),
          });
          continue;
        }

        const checkinId = nextId(end.getTime(), usedIds);
        const checkin = {
          id: checkinId,
          partId: part.id,
          partNumber: part.partNumber,
          action: 'checkin',
          user: tech.name,
          timestamp: end.toISOString(),
          notes: note,
          roNumber: ro,
          unitNumber: unit,
          checkoutId,
          fromQuantity: qty - 1,
          toQuantity: qty,
          batchKey: BATCH_KEY,
        };
        runningQty.set(part.id, qty);
        closed.push(checkout, checkin);
      }
    }
  }

  openCandidates.sort((a, b) => new Date(b.checkedOutDate) - new Date(a.checkedOutDate));
  const openParts = [];
  const seenParts = new Set();
  for (const candidate of openCandidates) {
    if (seenParts.has(candidate.partId) || openParts.length >= 8) {
      const qty = runningQty.get(candidate.partId) ?? 0;
      const end = new Date(new Date(candidate.checkout.timestamp).getTime() + (42 + Math.floor(rng() * 50)) * 60000);
      const checkinAt = end.getTime() < asOfMs ? end : new Date(asOfMs - 60000);
      if (checkinAt.getTime() - new Date(candidate.checkout.timestamp).getTime() >= 35 * 60000) {
        const checkinId = nextId(checkinAt.getTime(), usedIds);
        closed.push(candidate.checkout, {
          id: checkinId,
          partId: candidate.partId,
          partNumber: candidate.checkout.partNumber,
          action: 'checkin',
          user: candidate.user,
          timestamp: checkinAt.toISOString(),
          notes: candidate.checkout.notes,
          roNumber: candidate.checkout.roNumber,
          unitNumber: candidate.checkout.unitNumber,
          checkoutId: candidate.checkout.id,
          fromQuantity: candidate.checkout.toQuantity,
          toQuantity: (candidate.checkout.toQuantity ?? qty) + 1,
          batchKey: BATCH_KEY,
        });
        runningQty.set(candidate.partId, qty + 1);
      }
      continue;
    }
    seenParts.add(candidate.partId);
    openParts.push(candidate);
    closed.push(candidate.checkout);
  }

  const transactions = closed.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const checkouts = transactions.filter((row) => row.action === 'checkout').length;
  const checkins = transactions.filter((row) => row.action === 'checkin').length;

  return {
    batchKey: BATCH_KEY,
    rangeStart: zonedTimeToUtc(startYmd.year, startYmd.month, startYmd.day, 0, 0, 0).toISOString(),
    rangeEnd: asOf.toISOString(),
    transactions,
    openParts,
    summary: {
      transactions: transactions.length,
      checkouts,
      checkins,
      stillOpen: openParts.length,
      techs: new Set(transactions.map((row) => row.user)).size,
      partsDeleted: 0,
      firstTimestamp: transactions[0]?.timestamp || null,
      lastTimestamp: transactions[transactions.length - 1]?.timestamp || null,
    },
  };
}

module.exports = {
  BATCH_KEY,
  DAY_COUNT,
  buildShopActivity,
  chicagoParts,
  zonedTimeToUtc,
  resolveFamily,
  mulberry32,
};
