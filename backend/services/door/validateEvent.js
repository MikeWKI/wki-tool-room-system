const EVENT_ID_LIMIT = 200;
const NAME_LIMIT = 120;
const PAST_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_MS = 10 * 60 * 1000;
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function rawField(body, keys) {
  const objects = [body, body && body.data, body && body.payload].filter(
    (value) => value && typeof value === 'object' && !Array.isArray(value)
  );
  for (const obj of objects) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && obj[key] !== '') {
        return obj[key];
      }
    }
  }
  return undefined;
}

function capLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, NAME_LIMIT);
}

function occurredAtInWindow(when, now) {
  const time = when instanceof Date ? when.getTime() : NaN;
  if (!Number.isFinite(time)) return false;
  return time >= now.getTime() - PAST_MS && time <= now.getTime() + FUTURE_MS;
}

/**
 * Client-supplied eventId and occurredAt. Missing fields stay allowed so an
 * unrecognized payload can still be stored as type unknown.
 */
function validateDoorEvent(body, now = new Date()) {
  const eventId = rawField(body, ['eventId', 'event_id', 'id']);
  if (eventId !== undefined) {
    if (typeof eventId !== 'string') return { ok: false, error: 'invalid_event' };
    const trimmed = eventId.trim();
    if (!trimmed || trimmed.length > EVENT_ID_LIMIT) return { ok: false, error: 'invalid_event' };
  }

  const occurred = rawField(body, ['occurredAt', 'timestamp', 'time', 'occurred_at']);
  if (occurred !== undefined) {
    if (typeof occurred !== 'string' || !ISO_8601.test(occurred.trim())) {
      return { ok: false, error: 'invalid_event' };
    }
    if (!occurredAtInWindow(new Date(occurred.trim()), now)) {
      return { ok: false, error: 'invalid_event' };
    }
  }

  const actorName = rawField(body, ['actorName', 'user_name', 'userName']);
  const doorName = rawField(body, ['doorName', 'door_name']);
  if (actorName !== undefined && typeof actorName !== 'string') return { ok: false, error: 'invalid_event' };
  if (doorName !== undefined && typeof doorName !== 'string') return { ok: false, error: 'invalid_event' };
  return { ok: true };
}

module.exports = {
  EVENT_ID_LIMIT,
  NAME_LIMIT,
  PAST_MS,
  FUTURE_MS,
  capLabel,
  occurredAtInWindow,
  validateDoorEvent,
};
