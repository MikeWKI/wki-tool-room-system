const crypto = require('crypto');
const { TECHS } = require('../../data/techRoster');
const { adaptDoorPayload } = require('./unifiAdapter');
const { parseDoorEmail } = require('./emailParse');
const { deliverEmail } = require('./mailer');
const { visitAlertText, techSweepText, summarySweepText } = require('./messages');
const { buildMetrics } = require('./metrics');
const { transactionOrigin } = require('./origins');
const {
  formatChicago,
  latestDueSweep,
  parseSweepClock,
  parseSweepDays,
} = require('./chicagoTime');

function norm(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function defaultWindowMinutes() {
  const value = Number(process.env.DOOR_VISIT_WINDOW_MINUTES);
  if (Number.isFinite(value) && value > 0 && value <= 24 * 60) return value;
  return 10;
}

function ackSuppressesAlert() {
  return String(process.env.DOOR_ACK_SUPPRESSES_ALERT || 'false').toLowerCase() === 'true';
}

function unknownLabel(actorName, actorId) {
  const raw = String(actorName || actorId || 'no name').trim() || 'no name';
  return `Unknown badge (${raw})`;
}

function samePerson(visit, userName) {
  const target = norm(userName);
  if (!target) return false;
  return [visit.techName, visit.displayName, visit.actorName].some((value) => norm(value) === target);
}

function matchBadge(badges, identity) {
  const actorId = norm(identity.actorId);
  const credential = norm(identity.credential);
  const actorName = norm(identity.actorName);
  return badges.find((badge) => actorId && norm(badge.actorId) === actorId)
    || badges.find((badge) => credential && norm(badge.credential) === credential)
    || badges.find((badge) => actorName && norm(badge.actorName) === actorName)
    || null;
}

function validEmail(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return null;
  return text.slice(0, 200);
}

let auditSeq = 0;
function nextAuditId() {
  auditSeq += 1;
  return Date.now() * 1000 + (auditSeq % 1000);
}

class DoorService {
  constructor({ repo, readTransactions, readParts, writeAudit }) {
    this.repo = repo;
    this.readTransactions = readTransactions;
    this.readParts = readParts;
    this.writeAudit = writeAudit;
  }

  async audit(entry) {
    return this.writeAudit({
      id: nextAuditId(),
      partId: null,
      partNumber: entry.partNumber || 'DOOR',
      action: entry.action,
      user: entry.user || 'System',
      timestamp: entry.timestamp || new Date().toISOString(),
      notes: entry.notes || '',
      source: entry.source || undefined,
      visitId: entry.visitId || undefined,
    });
  }

  async identityFor(event) {
    const badges = await this.repo.listBadges();
    const badge = matchBadge(badges, event);
    if (badge) {
      return {
        techName: badge.techName,
        techEmail: badge.techEmail || '',
        displayName: badge.techName,
        mapped: true,
      };
    }
    return {
      techName: '',
      techEmail: '',
      displayName: unknownLabel(event.actorName, event.actorId),
      mapped: false,
    };
  }

  async findToolActivity(visit, end) {
    const transactions = await this.readTransactions();
    const startMs = new Date(visit.enteredAt).getTime();
    const endMs = new Date(end).getTime();
    return (transactions || []).find((row) => {
      if (row.action !== 'checkout' && row.action !== 'checkin') return false;
      if (transactionOrigin(row) === 'seed') return false;
      if (!samePerson(visit, row.user)) return false;
      const at = new Date(row.timestamp).getTime();
      return at >= startMs && at <= endMs;
    }) || null;
  }

  async openVisitsFor(identity) {
    const visits = await this.repo.listVisits();
    return visits.filter((visit) => visit.status === 'open' && (
      (identity.actorId && norm(visit.actorId) === norm(identity.actorId))
      || (identity.credential && norm(visit.credential) === norm(identity.credential))
      || samePerson(visit, identity.actorName)
      || samePerson(visit, identity.displayName)
      || samePerson(visit, identity.techName)
    ));
  }

  async ingestEvent(event, { raw, source }) {
    const incoming = { ...event, source };
    const existing = await this.repo.findEvent(incoming.eventId);
    if (existing) {
      return { ok: true, duplicate: true, event: publicEvent(existing), visit: null };
    }
    const stored = {
      eventId: incoming.eventId,
      type: incoming.type,
      occurredAt: incoming.occurredAt instanceof Date ? incoming.occurredAt.toISOString() : incoming.occurredAt,
      actorId: incoming.actorId || '',
      actorName: incoming.actorName || '',
      credential: incoming.credential || '',
      doorName: incoming.doorName || '',
      raw: capRaw(raw),
      source,
      mapped: Boolean(event.mapped),
      adapterNote: event.adapterNote || '',
    };
    try {
      await this.repo.insertEvent(stored);
    } catch (error) {
      if (error.code === 'DUPLICATE') {
        const again = await this.repo.findEvent(incoming.eventId);
        return { ok: true, duplicate: true, event: publicEvent(again || stored), visit: null };
      }
      throw error;
    }

    if (stored.type === 'unknown') {
      await this.audit({
        action: 'door_entry',
        partNumber: stored.doorName || 'DOOR',
        user: 'System',
        timestamp: stored.occurredAt,
        notes: 'Door webhook stored but not classified. Raw payload kept for mapping.',
        source,
      });
      return { ok: true, duplicate: false, mapped: false, event: publicEvent(stored), visit: null };
    }

    if (stored.type === 'exit') {
      const visit = await this.handleExit({ ...incoming, ...stored, occurredAt: stored.occurredAt });
      return { ok: true, duplicate: false, mapped: true, event: publicEvent(stored), visit: visit ? publicVisit(visit) : null };
    }

    const visit = await this.openVisit({ ...incoming, ...stored, occurredAt: stored.occurredAt });
    return { ok: true, duplicate: false, mapped: true, event: publicEvent(stored), visit: publicVisit(visit) };
  }

  async ingestWebhook(body) {
    const adapted = adaptDoorPayload(body);
    if (!adapted.ok) return { ok: false, status: 400, error: adapted.error };
    const source = adapted.event.adapterNote && adapted.event.adapterNote.startsWith('assumed')
      ? 'webhook'
      : 'webhook';
    return this.ingestEvent(adapted.event, { raw: body, source });
  }

  async ingestEmail(body, now = new Date()) {
    const parsed = parseDoorEmail(body || {}, now, process.env.DOOR_EMAIL_PATTERN);
    if (!parsed.ok) {
      const status = String(parsed.error || '').includes('DOOR_EMAIL_PATTERN') ? 500 : 400;
      return { ok: false, status, error: parsed.error };
    }
    return this.ingestEvent(parsed.event, { raw: { subject: body.subject || '', text: body.text || '' }, source: 'email' });
  }

  async openVisit(event) {
    const identity = await this.identityFor(event);
    const windowMinutes = defaultWindowMinutes();
    const enteredAt = new Date(event.occurredAt);
    const visit = {
      id: crypto.randomUUID(),
      eventId: event.eventId,
      actorId: event.actorId || '',
      actorName: event.actorName || '',
      credential: event.credential || '',
      doorName: event.doorName || 'Tool Room',
      techName: identity.techName,
      techEmail: identity.techEmail,
      displayName: identity.displayName,
      enteredAt: enteredAt.toISOString(),
      deadlineAt: new Date(enteredAt.getTime() + windowMinutes * 60 * 1000).toISOString(),
      windowMinutes,
      status: 'open',
      resolvedAt: null,
      resolvedBy: null,
      exitAt: null,
      exitEventId: '',
      ackReason: '',
      ackAt: null,
      alertedAt: null,
      alertSuppressed: false,
      source: event.source || 'webhook',
    };
    await this.repo.insertVisit(visit);
    await this.audit({
      action: 'door_entry',
      partNumber: visit.doorName || 'DOOR',
      user: visit.displayName,
      timestamp: visit.enteredAt,
      notes: `${visit.displayName} entered ${visit.doorName} at ${formatChicago(visit.enteredAt)}.`,
      source: visit.source,
      visitId: visit.id,
    });
    return visit;
  }

  async handleExit(event) {
    const identity = await this.identityFor(event);
    await this.audit({
      action: 'door_exit',
      partNumber: event.doorName || 'DOOR',
      user: identity.displayName,
      timestamp: event.occurredAt,
      notes: `${identity.displayName} exited ${event.doorName || 'the tool room'} at ${formatChicago(event.occurredAt)}.`,
      source: event.source || 'webhook',
    });
    const open = await this.openVisitsFor({ ...event, ...identity });
    if (!open.length) return null;
    const visit = open.sort((a, b) => new Date(b.enteredAt) - new Date(a.enteredAt))[0];
    const exited = await this.repo.updateVisit(visit.id, {
      exitAt: event.occurredAt,
      exitEventId: event.eventId,
    });
    return this.evaluateVisit(exited || { ...visit, exitAt: event.occurredAt }, {
      at: new Date(event.occurredAt),
      trigger: 'exit',
    });
  }

  async onToolActivity({ user, action, at }) {
    const visits = await this.repo.listVisits();
    const when = at instanceof Date ? at : new Date(at || Date.now());
    const updated = [];
    for (const visit of visits) {
      if (visit.status !== 'open') continue;
      if (!samePerson(visit, user)) continue;
      const entered = new Date(visit.enteredAt).getTime();
      const deadline = new Date(visit.deadlineAt).getTime();
      const end = visit.exitAt ? new Date(visit.exitAt).getTime() : deadline;
      if (when.getTime() < entered || when.getTime() > end) continue;
      const resolved = await this.repo.updateVisit(visit.id, {
        status: 'resolved',
        resolvedAt: when.toISOString(),
        resolvedBy: action,
      }, { ifOpenUnalerted: true });
      if (resolved) updated.push(resolved);
    }
    return updated;
  }

  async evaluateVisit(visit, { at, trigger }) {
    if (!visit || visit.status !== 'open' || visit.alertedAt) return visit;
    const end = trigger === 'exit' ? at : new Date(visit.deadlineAt);
    if (trigger !== 'exit' && at.getTime() < new Date(visit.deadlineAt).getTime()) return visit;
    const activity = await this.findToolActivity(visit, end);
    if (activity) {
      const resolved = await this.repo.updateVisit(visit.id, {
        status: 'resolved',
        resolvedAt: activity.timestamp,
        resolvedBy: activity.action,
      }, { ifOpenUnalerted: true });
      return resolved || visit;
    }
    const suppress = ackSuppressesAlert() && Boolean(visit.ackAt);
    const claimed = await this.repo.updateVisit(visit.id, {
      status: 'entry_without_checkout',
      alertedAt: at.toISOString(),
      alertSuppressed: suppress,
    }, { ifOpenUnalerted: true });
    if (!claimed) return this.repo.findVisit(visit.id);
    const text = visitAlertText(claimed);
    await this.audit({
      action: 'door_alert',
      partNumber: claimed.doorName || 'DOOR',
      user: claimed.displayName,
      timestamp: at.toISOString(),
      notes: suppress ? `${text} Alert email suppressed by DOOR_ACK_SUPPRESSES_ALERT.` : text,
      source: claimed.source,
      visitId: claimed.id,
    });
    if (!suppress) {
      const supervisor = process.env.ALERT_SUPERVISOR_EMAIL || '';
      await deliverEmail({
        id: crypto.randomUUID(),
        kind: 'visit_alert',
        to: supervisor,
        subject: `Tool room: entry without checkout — ${claimed.displayName}`,
        text,
        relatedId: claimed.id,
        warning: supervisor ? '' : 'ALERT_SUPERVISOR_EMAIL is not set.',
      }, { save: (row) => this.repo.insertOutbox(row) });
    }
    return claimed;
  }

  async expireDueVisits(now) {
    const visits = await this.repo.listVisits();
    const results = [];
    for (const visit of visits) {
      if (visit.status !== 'open' || visit.alertedAt) continue;
      if (new Date(visit.deadlineAt).getTime() > now.getTime()) continue;
      results.push(await this.evaluateVisit(visit, { at: now, trigger: 'deadline' }));
    }
    return results;
  }

  async acknowledge(visitId, { reason }) {
    const visit = await this.repo.findVisit(visitId);
    if (!visit) return { ok: false, status: 404, error: 'Visit not found' };
    const text = String(reason || '').trim();
    if (!text) return { ok: false, status: 400, error: 'A reason is required' };
    const updated = await this.repo.updateVisit(visit.id, {
      ackReason: text.slice(0, 300),
      ackAt: new Date().toISOString(),
    });
    await this.audit({
      action: 'door_ack',
      partNumber: updated.doorName || 'DOOR',
      user: updated.displayName,
      timestamp: updated.ackAt,
      notes: `No tool taken / returning only: ${updated.ackReason}`,
      source: updated.source,
      visitId: updated.id,
    });
    return { ok: true, visit: publicVisit(updated), suppressesAlert: ackSuppressesAlert() };
  }

  async simulate({ techName, type, windowMinutes, occurredAt }) {
    const name = String(techName || '').trim();
    if (!name) return { ok: false, status: 400, error: 'techName is required' };
    const kind = String(type || 'entry').toLowerCase();
    if (kind !== 'entry' && kind !== 'exit') return { ok: false, status: 400, error: 'type must be entry or exit' };
    const when = occurredAt ? new Date(occurredAt) : new Date();
    if (Number.isNaN(when.getTime())) return { ok: false, status: 400, error: 'occurredAt is not a valid time' };
    const event = {
      eventId: `sim-${crypto.randomUUID()}`,
      type: kind,
      occurredAt: when,
      actorId: '',
      actorName: name,
      credential: '',
      doorName: 'Tool Room',
      mapped: true,
      adapterNote: 'simulated',
      source: 'simulated',
    };
    if (kind === 'exit') {
      return this.ingestEvent(event, { raw: { simulated: true, techName: name, type: kind }, source: 'simulated' });
    }
    const existing = await this.repo.findEvent(event.eventId);
    if (existing) return { ok: true, duplicate: true, event: publicEvent(existing) };
    const stored = {
      ...event,
      occurredAt: when.toISOString(),
      raw: { simulated: true, techName: name, type: kind },
      source: 'simulated',
    };
    await this.repo.insertEvent(stored);
    const minutes = Number(windowMinutes);
    const window = Number.isFinite(minutes) && minutes > 0 && minutes <= 24 * 60
      ? minutes
      : defaultWindowMinutes();
    const identity = await this.identityFor(stored);
    const displayName = identity.mapped ? identity.displayName : name;
    const visit = {
      id: crypto.randomUUID(),
      eventId: stored.eventId,
      actorId: '',
      actorName: name,
      credential: '',
      doorName: 'Tool Room',
      techName: identity.mapped ? identity.techName : name,
      techEmail: identity.techEmail || '',
      displayName,
      enteredAt: when.toISOString(),
      deadlineAt: new Date(when.getTime() + window * 60 * 1000).toISOString(),
      windowMinutes: window,
      status: 'open',
      resolvedAt: null,
      resolvedBy: null,
      exitAt: null,
      exitEventId: '',
      ackReason: '',
      ackAt: null,
      alertedAt: null,
      alertSuppressed: false,
      source: 'simulated',
    };
    await this.repo.insertVisit(visit);
    await this.audit({
      action: 'door_entry',
      partNumber: 'DOOR',
      user: visit.displayName,
      timestamp: visit.enteredAt,
      notes: `Simulated entry for ${visit.displayName} at ${formatChicago(visit.enteredAt)}. Window ${visit.windowMinutes} minute(s).`,
      source: 'simulated',
      visitId: visit.id,
    });
    return { ok: true, duplicate: false, event: publicEvent(stored), visit: publicVisit(visit) };
  }

  async saveBadge(input) {
    const techName = String(input.techName || '').trim();
    if (!techName) return { ok: false, status: 400, error: 'techName is required' };
    const actorId = String(input.actorId || '').trim();
    const actorName = String(input.actorName || '').trim();
    const credential = String(input.credential || '').trim();
    if (!actorId && !actorName && !credential) {
      return { ok: false, status: 400, error: 'Map at least one of actorId, actorName, or credential' };
    }
    const email = validEmail(input.techEmail);
    if (email === null) return { ok: false, status: 400, error: 'techEmail is not a valid email' };
    const badge = {
      id: input.id || crypto.randomUUID(),
      actorId,
      actorName,
      credential,
      techName,
      techEmail: email,
    };
    await this.repo.upsertBadge(badge);
    return { ok: true, badge };
  }

  async deleteBadge(id) {
    const removed = await this.repo.deleteBadge(id);
    if (!removed) return { ok: false, status: 404, error: 'Badge map not found' };
    return { ok: true };
  }

  async openCheckouts(now) {
    const parts = await this.readParts();
    const transactions = await this.readTransactions();
    const items = [];
    for (const part of parts || []) {
      if (part.status !== 'checked_out' || !part.checkedOutBy) continue;
      const checkedOutDate = part.checkedOutDate || null;
      const latestCheckout = (transactions || [])
        .filter((row) => row.action === 'checkout' && (row.partId === part.id || row.partNumber === part.partNumber))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      const seeded = Boolean(
        latestCheckout
        && transactionOrigin(latestCheckout) === 'seed'
        && norm(latestCheckout.user) === norm(part.checkedOutBy)
      );
      const hours = checkedOutDate ? (now.getTime() - new Date(checkedOutDate).getTime()) / 36e5 : 0;
      items.push({
        user: part.checkedOutBy,
        partId: part.id,
        partNumber: part.partNumber,
        description: part.description || '',
        checkedOutDate,
        overdue: hours > 24,
        seeded,
      });
    }
    return items;
  }

  async emailForTech(name) {
    const badges = await this.repo.listBadges();
    const badge = badges.find((row) => norm(row.techName) === norm(name) && row.techEmail);
    return badge ? badge.techEmail : '';
  }

  async runEndOfDaySweep(now) {
    const due = latestDueSweep(now);
    if (!due) return { ran: false, reason: 'no due sweep' };
    const existing = await this.repo.findSweep(due.dayKey);
    if (existing) return { ran: false, reason: 'already recorded', dayKey: due.dayKey };
    const items = await this.openCheckouts(now);
    try {
      await this.repo.insertSweep({
        dayKey: due.dayKey,
        ranAt: now.toISOString(),
        openCount: items.length,
        items,
      });
    } catch (error) {
      if (error.code === 'DUPLICATE') return { ran: false, reason: 'already recorded', dayKey: due.dayKey };
      throw error;
    }
    const supervisor = process.env.ALERT_SUPERVISOR_EMAIL || '';
    const summary = await deliverEmail({
      id: crypto.randomUUID(),
      kind: 'eod_summary',
      to: supervisor,
      subject: `Tool room still out — ${due.dayKey}`,
      text: summarySweepText(items, due.dayKey),
      dayKey: due.dayKey,
      warning: supervisor ? '' : 'ALERT_SUPERVISOR_EMAIL is not set.',
    }, { save: (row) => this.repo.insertOutbox(row) });
    await this.audit({
      action: 'door_sweep',
      partNumber: 'END OF DAY',
      user: 'System',
      timestamp: now.toISOString(),
      notes: `5 PM sweep ${due.dayKey}: ${items.length} open. Summary email ${summary.status}.`,
      source: 'live',
    });
    const byUser = new Map();
    for (const item of items) {
      if (!byUser.has(item.user)) byUser.set(item.user, []);
      byUser.get(item.user).push(item);
    }
    for (const [user, userItems] of byUser) {
      const email = await this.emailForTech(user);
      if (!email) continue;
      const text = userItems.map((item) => techSweepText(item)).join('\n\n');
      const sent = await deliverEmail({
        id: crypto.randomUUID(),
        kind: 'eod_tech',
        to: email,
        cc: supervisor,
        subject: `Tools still checked out — ${due.dayKey}`,
        text,
        dayKey: due.dayKey,
        warning: supervisor ? '' : 'ALERT_SUPERVISOR_EMAIL is not set, so there is no cc.',
      }, { save: (row) => this.repo.insertOutbox(row) });
      await this.audit({
        action: 'door_sweep',
        partNumber: userItems.map((item) => item.partNumber).join(', '),
        user,
        timestamp: now.toISOString(),
        notes: `5 PM note to ${user} (${sent.status}): ${userItems.map((item) => item.partNumber).join(', ')}. Please check it in ASAP or first thing on return tomorrow.`,
        source: 'live',
      });
    }
    return { ran: true, dayKey: due.dayKey, openCount: items.length };
  }

  async runMaintenance(now = new Date()) {
    const expired = await this.expireDueVisits(now);
    const sweep = await this.runEndOfDaySweep(now);
    return { expired: expired.filter(Boolean).length, sweep };
  }

  async metrics(query) {
    const days = [7, 30, 90].includes(Number(query.days)) ? Number(query.days) : 30;
    const includeSeed = query.includeSeed === true || query.includeSeed === '1' || query.includeSeed === 'true';
    const includeSimulated = query.includeSimulated === true || query.includeSimulated === '1' || query.includeSimulated === 'true';
    return buildMetrics({
      visits: await this.repo.listVisits(),
      transactions: await this.readTransactions(),
      sweeps: await this.repo.listSweeps(),
      now: query.now instanceof Date ? query.now : new Date(),
      days,
      includeSeed,
      includeSimulated,
    });
  }

  async openVisitForName(name) {
    const visits = await this.repo.listVisits();
    const open = visits
      .filter((visit) => visit.status === 'open' && samePerson(visit, name))
      .sort((a, b) => new Date(b.enteredAt) - new Date(a.enteredAt));
    if (!open.length) return null;
    const visit = open[0];
    return {
      id: visit.id,
      displayName: visit.displayName,
      enteredAt: visit.enteredAt,
      deadlineAt: visit.deadlineAt,
      doorName: visit.doorName,
    };
  }

  status() {
    const { resolveAlertsMode, smtpConfigured } = require('./mailer');
    const mode = resolveAlertsMode();
    return {
      alertsMode: mode.effective,
      alertsRequested: mode.requested,
      alertsWarning: mode.warning || '',
      smtpConfigured: smtpConfigured(),
      supervisorConfigured: Boolean(process.env.ALERT_SUPERVISOR_EMAIL),
      windowMinutes: defaultWindowMinutes(),
      sweepTime: `${String(parseSweepClock().hour).padStart(2, '0')}:${String(parseSweepClock().minute).padStart(2, '0')}`,
      sweepDays: parseSweepDays(process.env.EOD_SWEEP_DAYS),
      ackSuppressesAlert: ackSuppressesAlert(),
      webhookConfigured: Boolean(process.env.DOOR_WEBHOOK_SECRET),
      roster: TECHS.map((tech) => tech.name),
    };
  }
}

function capRaw(raw) {
  try {
    const text = JSON.stringify(raw);
    if (text && text.length > 100000) {
      return { truncated: true, bytes: text.length };
    }
  } catch (error) {
    return { unserializable: true };
  }
  return raw;
}

function publicEvent(event) {
  if (!event) return null;
  return {
    eventId: event.eventId,
    type: event.type,
    occurredAt: event.occurredAt,
    actorId: event.actorId,
    actorName: event.actorName,
    doorName: event.doorName,
    source: event.source,
    mapped: event.mapped,
    adapterNote: event.adapterNote || '',
  };
}

function publicVisit(visit) {
  if (!visit) return null;
  return {
    id: visit.id,
    displayName: visit.displayName,
    techName: visit.techName || '',
    status: visit.status,
    enteredAt: visit.enteredAt,
    deadlineAt: visit.deadlineAt,
    windowMinutes: visit.windowMinutes,
    exitAt: visit.exitAt,
    resolvedBy: visit.resolvedBy,
    ackReason: visit.ackReason || '',
    alertedAt: visit.alertedAt,
    alertSuppressed: Boolean(visit.alertSuppressed),
    source: visit.source,
    doorName: visit.doorName,
  };
}

function startDoorMaintenance(service) {
  const tick = () => {
    service.runMaintenance(new Date()).catch((error) => {
      console.error('Door maintenance failed:', error.message);
    });
  };
  tick();
  const timer = setInterval(tick, 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

module.exports = {
  DoorService,
  startDoorMaintenance,
  norm,
  samePerson,
  unknownLabel,
  defaultWindowMinutes,
};
