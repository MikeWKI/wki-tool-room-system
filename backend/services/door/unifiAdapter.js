/**
 * ASSUMED UniFi Access webhook adapter.
 *
 * Do not treat these field names as Ubiquiti's contract. A real Alarm Manager
 * payload was not available. Fixtures in backend/fixtures/unifi-access-webhook.assumed.json
 * are marked "assumed, verify against a real payload".
 *
 * The raw body is always stored. When IT sends a live payload, map it here.
 *
 * Assumed shapes this adapter will try (any one object: the body, body.data,
 * or body.payload):
 * - event | event_type | type           door action name
 * - event_id | eventId | id             idempotency key
 * - timestamp | time | occurred_at      when it happened
 * - user_name | actor.name | user.name  person
 * - user_id | actor.id | user.id        badge id
 * - credential | actor.credential       card or token
 * - location.name | door.name | device.name | door_name
 *
 * Entry is assumed for names containing unlock, entry, granted, or checkin.
 * Exit is assumed for names containing exit or egress. A lock/secured name
 * is NOT treated as a person leaving.
 */

const crypto = require('crypto');

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function firstString(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text.slice(0, 200);
  }
  return '';
}

function classifyAssumedEventName(name) {
  const text = String(name || '').toLowerCase();
  if (!text) return '';
  if (/(exit|egress)/.test(text)) return 'exit';
  if (/(unlock|entry|granted|check-?in|access\.door\.unlock)/.test(text)) return 'entry';
  return '';
}

function assumedFromCandidate(candidate) {
  const actor = asObject(candidate.actor) || asObject(candidate.user) || {};
  const location = asObject(candidate.location) || asObject(candidate.door) || asObject(candidate.device) || {};
  const eventName = firstString(candidate.event, candidate.event_type, candidate.eventType);
  const typeFromName = classifyAssumedEventName(eventName);
  const explicit = firstString(candidate.type).toLowerCase();
  const type = explicit === 'entry' || explicit === 'exit' ? explicit : typeFromName;
  const occurredRaw = firstString(candidate.occurredAt, candidate.timestamp, candidate.time, candidate.occurred_at);
  const occurredAt = occurredRaw ? new Date(occurredRaw) : null;
  const eventId = firstString(candidate.eventId, candidate.event_id, candidate.id);
  return {
    eventId,
    type: type || '',
    occurredAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null,
    actorId: firstString(candidate.actorId, candidate.user_id, candidate.userId, actor.id),
    actorName: firstString(candidate.actorName, candidate.user_name, candidate.userName, actor.name),
    credential: firstString(candidate.credential, actor.credential, actor.token),
    doorName: firstString(candidate.doorName, candidate.door_name, location.name),
    assumedEventName: eventName,
  };
}

function isNormalized(body) {
  if (!body || typeof body !== 'object') return false;
  const type = String(body.type || '').toLowerCase();
  return Boolean(body.eventId) && (type === 'entry' || type === 'exit');
}

function normalizedFromBody(body) {
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : null;
  return {
    eventId: String(body.eventId).trim().slice(0, 200),
    type: String(body.type).toLowerCase(),
    occurredAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null,
    actorId: firstString(body.actorId),
    actorName: firstString(body.actorName),
    credential: firstString(body.credential),
    doorName: firstString(body.doorName) || 'Tool Room',
    mapped: true,
    adapterNote: '',
  };
}

function adaptDoorPayload(body) {
  if (isNormalized(body)) {
    const normalized = normalizedFromBody(body);
    if (!normalized.occurredAt) {
      return { ok: false, error: 'occurredAt is not a valid time' };
    }
    return { ok: true, event: normalized };
  }

  const candidates = [asObject(body), asObject(body && body.data), asObject(body && body.payload)].filter(Boolean);
  let best = null;
  for (const candidate of candidates) {
    const parsed = assumedFromCandidate(candidate);
    if (!best) best = parsed;
    if (parsed.type && (parsed.actorName || parsed.actorId)) {
      best = parsed;
      break;
    }
  }

  if (!best || !best.type) {
    const fallbackId = crypto.createHash('sha256').update(JSON.stringify(body || null)).digest('hex').slice(0, 32);
    return {
      ok: true,
      event: {
        eventId: (best && best.eventId) || `unmapped-${fallbackId}`,
        type: 'unknown',
        occurredAt: (best && best.occurredAt) || new Date(),
        actorId: (best && best.actorId) || '',
        actorName: (best && best.actorName) || '',
        credential: (best && best.credential) || '',
        doorName: (best && best.doorName) || '',
        mapped: false,
        adapterNote: 'assumed UniFi adapter could not classify this payload; raw body stored',
      },
    };
  }

  const eventId = best.eventId || crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32);
  return {
    ok: true,
    event: {
      eventId,
      type: best.type,
      occurredAt: best.occurredAt || new Date(),
      actorId: best.actorId,
      actorName: best.actorName,
      credential: best.credential,
      doorName: best.doorName || 'Tool Room',
      mapped: true,
      adapterNote: 'assumed UniFi Access shape, verify against a real payload',
    },
  };
}

module.exports = {
  adaptDoorPayload,
  classifyAssumedEventName,
  isNormalized,
};
