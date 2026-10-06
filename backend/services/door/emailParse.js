/**
 * Inbound-parse fallback. IT can forward a door notification email when a
 * webhook is not available yet. DOOR_EMAIL_PATTERN may replace the default.
 * Named groups: name, when, and optional action (entry|exit|entered|exited).
 */

const crypto = require('crypto');
const { parseChicagoTimestamp } = require('./chicagoTime');

const DEFAULT_DOOR_EMAIL_PATTERN = "(?<name>[A-Z][A-Za-z.'-]+(?:\\s+[A-Z][A-Za-z.'-]+){0,3})\\s+(?<action>[Ee]ntered|[Ee]xited|[Ee]ntry|[Ee]xit)\\b[\\s\\S]{0,120}?\\bat\\s+(?<when>\\d{4}-\\d{2}-\\d{2}[ T]\\d{1,2}:\\d{2}(?::\\d{2})?|\\d{1,2}:\\d{2}\\s*(?:[AaPp][Mm])?)";

function compilePattern(raw) {
  const source = raw == null || String(raw).trim() === '' ? DEFAULT_DOOR_EMAIL_PATTERN : String(raw);
  try {
    return { ok: true, pattern: new RegExp(source), source };
  } catch (error) {
    return { ok: false, error: 'DOOR_EMAIL_PATTERN is not a valid regular expression' };
  }
}

function actionToType(action) {
  const text = String(action || '').toLowerCase();
  if (text.startsWith('exit')) return 'exit';
  return 'entry';
}

function parseDoorEmail({ subject = '', text = '', html = '' } = {}, now = new Date(), patternRaw = process.env.DOOR_EMAIL_PATTERN) {
  const compiled = compilePattern(patternRaw);
  if (!compiled.ok) return compiled;
  const blob = [subject, text, html].filter(Boolean).join('\n');
  if (!blob.trim()) return { ok: false, error: 'Email subject or text is required' };
  const match = compiled.pattern.exec(blob);
  if (!match || !match.groups || !match.groups.name || !match.groups.when) {
    return { ok: false, error: 'Email did not match the door pattern (name and time)' };
  }
  const occurredAt = parseChicagoTimestamp(match.groups.when, now);
  if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
    return { ok: false, error: 'Email time could not be read' };
  }
  const actorName = match.groups.name.trim().replace(/\s+/g, ' ');
  const type = actionToType(match.groups.action);
  const eventId = `email-${crypto.createHash('sha256').update(`${type}|${actorName.toLowerCase()}|${occurredAt.toISOString()}|${subject}`).digest('hex').slice(0, 24)}`;
  return {
    ok: true,
    event: {
      eventId,
      type,
      occurredAt,
      actorId: '',
      actorName,
      credential: '',
      doorName: 'Tool Room',
      mapped: true,
      adapterNote: 'email inbound',
    },
  };
}

module.exports = {
  DEFAULT_DOOR_EMAIL_PATTERN,
  compilePattern,
  parseDoorEmail,
};
