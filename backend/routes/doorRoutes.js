const { requireManageSession } = require('../middleware/manageAuth');
const { HEADER, requireDoorWebhook } = require('../middleware/doorWebhookAuth');
const { doorFailedSecretLimiter, doorAcceptedSecretLimiter } = require('../middleware/doorRateLimit');
const { TECHS } = require('../data/techRoster');
const { MemoryDoorRepository, PersistentDoorRepository } = require('../services/door/repository');
const { DoorService, startDoorMaintenance } = require('../services/door/doorService');

function publicError(status, error) {
  if (typeof error === 'string' && /^[a-z0-9_]+$/.test(error)) return error;
  if (status === 404) return 'not_found';
  if (status === 400) return 'invalid_request';
  return 'door_request_failed';
}

function sendResult(res, result, okStatus) {
  if (!result.ok) {
    const status = result.status || 400;
    return res.status(status).json({ error: publicError(status, result.error) });
  }
  return res.status(result.duplicate ? 200 : okStatus).json(result);
}

function createDoorStack({ dbService, readTransactions, readParts, writeTransactions }) {
  const memory = { audits: [], extraTransactions: [], parts: null };
  const repo = process.env.DOOR_STORE === 'memory'
    ? new MemoryDoorRepository()
    : new PersistentDoorRepository(dbService);
  const service = new DoorService({
    repo,
    async readTransactions() {
      if (process.env.DOOR_STORE === 'memory') {
        return memory.extraTransactions.concat(memory.audits);
      }
      return readTransactions();
    },
    async readParts() {
      if (process.env.DOOR_STORE === 'memory' && Array.isArray(memory.parts)) return memory.parts;
      return readParts();
    },
    async writeAudit(entry) {
      if (process.env.DOOR_STORE === 'memory') {
        memory.audits.unshift(entry);
        return entry;
      }
      return dbService.appendTransaction(entry);
    },
  });
  service.memory = memory;
  service.repo = repo;
  return service;
}

function registerDoorRoutes(app, service) {
  const webhookGuards = [doorFailedSecretLimiter, doorAcceptedSecretLimiter, requireDoorWebhook];

  app.post('/api/door/events', ...webhookGuards, async (req, res) => {
    try {
      if (typeof req.body === 'string') return res.status(400).json({ error: 'invalid_body' });
      const result = await service.ingestWebhook(req.body);
      return sendResult(res, result, 201);
    } catch (error) {
      return res.status(500).json({ error: 'door_event_failed' });
    }
  });

  app.post('/api/door/email-inbound', ...webhookGuards, async (req, res) => {
    try {
      const body = typeof req.body === 'string' ? { text: req.body } : (req.body || {});
      const result = await service.ingestEmail(body);
      return sendResult(res, result, 201);
    } catch (error) {
      return res.status(500).json({ error: 'door_email_failed' });
    }
  });

  app.get('/api/door/open-visit', async (req, res) => {
    try {
      const visit = await service.openVisitForName(req.query.name || '');
      res.json({ visit });
    } catch (error) {
      res.status(500).json({ error: 'Open visit lookup failed' });
    }
  });

  app.post('/api/door/visits/:id/ack', async (req, res) => {
    try {
      const result = await service.acknowledge(req.params.id, { reason: req.body?.reason });
      if (!result.ok) return res.status(result.status || 400).json({ error: publicError(result.status || 400, result.error) });
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ error: 'Acknowledgement failed' });
    }
  });

  app.get('/api/door/status', requireManageSession, (req, res) => {
    res.json(service.status());
  });

  app.get('/api/door/roster', requireManageSession, (req, res) => {
    res.json({ techs: TECHS.map((tech) => ({ name: tech.name })) });
  });

  app.get('/api/door/badges', requireManageSession, async (req, res) => {
    res.json(await service.repo.listBadges());
  });

  app.post('/api/door/badges', requireManageSession, async (req, res) => {
    const result = await service.saveBadge(req.body || {});
    if (!result.ok) return res.status(result.status || 400).json({ error: publicError(result.status || 400, result.error) });
    return res.status(201).json(result.badge);
  });

  app.put('/api/door/badges/:id', requireManageSession, async (req, res) => {
    const result = await service.saveBadge({ ...(req.body || {}), id: req.params.id });
    if (!result.ok) return res.status(result.status || 400).json({ error: publicError(result.status || 400, result.error) });
    return res.json(result.badge);
  });

  app.delete('/api/door/badges/:id', requireManageSession, async (req, res) => {
    const result = await service.deleteBadge(req.params.id);
    if (!result.ok) return res.status(result.status || 404).json({ error: publicError(result.status || 404, result.error) });
    return res.json({ ok: true });
  });

  app.get('/api/door/visits', requireManageSession, async (req, res) => {
    const visits = await service.repo.listVisits();
    visits.sort((a, b) => new Date(b.enteredAt) - new Date(a.enteredAt));
    res.json(visits);
  });

  app.get('/api/door/events', requireManageSession, async (req, res) => {
    const events = await service.repo.listEvents();
    events.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
    res.json(events);
  });

  app.get('/api/door/outbox', requireManageSession, async (req, res) => {
    const rows = await service.repo.listOutbox();
    res.json(rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      to: row.to,
      cc: row.cc,
      subject: row.subject,
      text: row.text,
      mode: row.mode,
      requestedMode: row.requestedMode,
      status: row.status,
      warning: row.warning,
      error: row.error,
      dayKey: row.dayKey,
      createdAt: row.createdAt,
      sentAt: row.sentAt,
    })));
  });

  app.get('/api/door/metrics', requireManageSession, async (req, res) => {
    const metrics = await service.metrics({
      days: req.query.days,
      includeSeed: req.query.includeSeed,
      includeSimulated: req.query.includeSimulated,
    });
    res.json(metrics);
  });

  app.post('/api/door/simulate', requireManageSession, async (req, res) => {
    const result = await service.simulate(req.body || {});
    if (!result.ok) return res.status(result.status || 400).json({ error: publicError(result.status || 400, result.error) });
    return res.status(result.duplicate ? 200 : 201).json(result);
  });

  app.post('/api/door/maintenance', requireManageSession, async (req, res) => {
    const now = req.body?.now ? new Date(req.body.now) : new Date();
    if (Number.isNaN(now.getTime())) return res.status(400).json({ error: 'invalid_time' });
    const result = await service.runMaintenance(now);
    return res.json(result);
  });
}

module.exports = {
  HEADER,
  requireDoorWebhook,
  publicError,
  createDoorStack,
  registerDoorRoutes,
  startDoorMaintenance,
};
