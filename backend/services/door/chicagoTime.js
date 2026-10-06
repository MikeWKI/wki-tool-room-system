/**
 * America/Chicago clock used by door windows and the 5 PM sweep.
 * The conversion matches the shop-activity helper: guess UTC, then correct
 * by the offset Intl reports for that zone (handles DST).
 */

const TIME_ZONE = 'America/Chicago';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function chicagoParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
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

function dayKeyFromParts(ymd) {
  const month = String(ymd.month).padStart(2, '0');
  const day = String(ymd.day).padStart(2, '0');
  return `${ymd.year}-${month}-${day}`;
}

function chicagoDayKey(date) {
  return dayKeyFromParts(chicagoParts(date));
}

function formatChicago(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown time';
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return `${formatted} CT`;
}

function parseSweepDays(raw) {
  const text = String(raw || 'Mon-Fri').trim();
  if (/^mon-fri$/i.test(text)) return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  if (/^mon-sun$/i.test(text) || /^daily$/i.test(text)) return WEEKDAYS.slice();
  const days = text.split(/[^A-Za-z]+/).map((token) => {
    const short = token.slice(0, 3).toLowerCase();
    const match = WEEKDAYS.find((day) => day.toLowerCase() === short);
    return match || null;
  }).filter(Boolean);
  return days.length ? days : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
}

function parseSweepClock(raw) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(raw || '17:00').trim());
  if (!match) return { hour: 17, minute: 0 };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return { hour: 17, minute: 0 };
  return { hour, minute };
}

function latestDueSweep(now, { days, clock } = {}) {
  const allowed = new Set(days || parseSweepDays(process.env.EOD_SWEEP_DAYS));
  const { hour, minute } = clock || parseSweepClock(process.env.EOD_SWEEP_TIME);
  const today = chicagoParts(now);
  let cursor = { year: today.year, month: today.month, day: today.day };
  for (let i = 0; i < 14; i += 1) {
    const weekday = weekdayOf(cursor);
    const instant = zonedTimeToUtc(cursor.year, cursor.month, cursor.day, hour, minute, 0);
    if (allowed.has(weekday) && instant.getTime() <= now.getTime()) {
      return { dayKey: dayKeyFromParts(cursor), instant, weekday };
    }
    cursor = addDays(cursor, -1);
  }
  return null;
}

/**
 * Parse a door-email timestamp. A full date is read as Chicago local time.
 * A clock-only value uses the Chicago calendar day of `now`.
 */
function parseChicagoTimestamp(text, now) {
  const raw = String(text || '').trim();
  const full = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (full) {
    return zonedTimeToUtc(
      Number(full[1]),
      Number(full[2]),
      Number(full[3]),
      Number(full[4]),
      Number(full[5]),
      Number(full[6] || 0)
    );
  }
  const clock = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/.exec(raw);
  if (!clock) return null;
  let hour = Number(clock[1]);
  const minute = Number(clock[2]);
  const ampm = clock[3] ? clock[3].toLowerCase() : '';
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (!ampm && hour > 23) return null;
  const day = chicagoParts(now);
  return zonedTimeToUtc(day.year, day.month, day.day, hour, minute, 0);
}

module.exports = {
  TIME_ZONE,
  WEEKDAYS,
  chicagoParts,
  zonedTimeToUtc,
  addDays,
  weekdayOf,
  chicagoDayKey,
  formatChicago,
  parseSweepDays,
  parseSweepClock,
  latestDueSweep,
  parseChicagoTimestamp,
};
