const { timingSafeStringEqual, requireManageSession } = require('../middleware/manageAuth');
const { TECHS } = require('../data/techRoster');
const { MemoryDoorRepository, PersistentDoorRepository } = require('../services/door/repository');
const { DoorService, startDoorMaintenance } = require('../services/door/doorService');

const HEADER = 'x-door-webhook-secret';

function requireDoorWebhook(req, res, next) {
  const secret = process.env.DOOR_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({
      error: 'Door webhook is not configured. Set DOOR_WEBHOOK_SECRET on the API.',
    });
  }
  const provided = req.get(HEADER) || '';
  if (!timingSafeStringEqual(provided, secret)) {
    return res.status(401).json({ error: 'Door webhook secret rejected' });
  }
  return next();
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
      const transactions = await readTransactions();
      transactions.unshift(entry);
      await writeTransactions(transactions);
      return entry;
    },
  });
  service.memory = memory;
  service.repo = repo;
  return service;
}

function registerDoorRoutes(app, service) {
  app.post('/api/door/events', requireDoorWebhook, async (req, res) => {
    try {
      const result = await service.ingestWebhook(req.body);
      if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
      return res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      return res.status(500).json({ error: 'Door event failed', details: error.message });
    }
  });

  app.post('/api/door/email-inbound', requireDoorWebhook, async (req, res) => {
    try {
      const result = await service.ingestEmail(req.body || {});
      if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
      return res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      return res.status(500).json({ error: 'Door email failed', details: error.message });
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
      if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
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
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    return res.status(201).json(result.badge);
  });

  app.put('/api/door/badges/:id', requireManageSession, async (req, res) => {
    const result = await service.saveBadge({ ...(req.body || {}), id: req.params.id });
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    return res.json(result.badge);
  });

  app.delete('/api/door/badges/:id', requireManageSession, async (req, res) => {
    const result = await service.deleteBadge(req.params.id);
    if (!result.ok) return res.status(result.status || 404).json({ error: result.error });
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
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    return res.status(result.duplicate ? 200 : 201).json(result);
  });

  app.post('/api/door/maintenance', requireManageSession, async (req, res) => {
    const now = req.body?.now ? new Date(req.body.now) : new Date();
    if (Number.isNaN(now.getTime())) return res.status(400).json({ error: 'now is not a valid time' });
    const result = await service.runMaintenance(now);
    return res.json(result);
  });
}

module.exports = {
  HEADER,
  requireDoorWebhook,
  createDoorStack,
  registerDoorRoutes,
  startDoorMaintenance,
};
