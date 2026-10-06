/**
 * Inbound-parse fallback. IT can forward a door notification email when a
 * webhook is not available yet. DOOR_EMAIL_PATTERN may replace the default.
 * Named groups: name, when, and optional action (entry|exit|entered|exited).
 */

const crypto = require('crypto');
const { parseChicagoTimestamp } = require('./chicagoTime');

const EMAIL_TEXT_LIMIT = 16 * 1024;
const DEFAULT_DOOR_EMAIL_PATTERN = "(?<name>[A-Z][A-Za-z.'-]{1,40}(?:\\s+[A-Z][A-Za-z.'-]{1,40}){0,3})\\s+(?<action>[Ee]ntered|[Ee]xited|[Ee]ntry|[Ee]xit)\\b[\\s\\S]{0,80}?\\bat\\s+(?<when>\\d{4}-\\d{2}-\\d{2}[ T]\\d{1,2}:\\d{2}(?::\\d{2})?|\\d{1,2}:\\d{2}\\s{0,2}(?:[AaPp][Mm])?)";

function cappedEmailBlob({ subject = '', text = '', html = '' } = {}) {
  return `${String(subject)}\n${String(text)}\n${String(html)}`.slice(0, EMAIL_TEXT_LIMIT);
}

function compilePattern(raw) {
  const source = raw == null || String(raw).trim() === '' ? DEFAULT_DOOR_EMAIL_PATTERN : String(raw);
  try {
    return { ok: true, pattern: new RegExp(source), source };
  } catch (error) {
    return { ok: false, error: 'invalid_email_pattern' };
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
  const blob = cappedEmailBlob({ subject, text, html });
  if (!blob.trim()) return { ok: false, error: 'email_required' };
  const match = compiled.pattern.exec(blob);
  if (!match || !match.groups || !match.groups.name || !match.groups.when) {
    return { ok: false, error: 'email_not_matched' };
  }
  const occurredAt = parseChicagoTimestamp(match.groups.when, now);
  if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
    return { ok: false, error: 'email_time_invalid' };
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
  EMAIL_TEXT_LIMIT,
  DEFAULT_DOOR_EMAIL_PATTERN,
  cappedEmailBlob,
  compilePattern,
  parseDoorEmail,
};
