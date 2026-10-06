const fs = require('fs').promises;
const path = require('path');
const {
  DoorEvent,
  BadgeMap,
  DoorVisit,
  EmailOutbox,
  SweepRun,
} = require('../../models');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class MemoryDoorRepository {
  constructor() {
    this.events = new Map();
    this.badges = new Map();
    this.visits = new Map();
    this.outbox = new Map();
    this.sweeps = new Map();
  }

  reset() {
    this.events.clear();
    this.badges.clear();
    this.visits.clear();
    this.outbox.clear();
    this.sweeps.clear();
  }

  async findEvent(eventId) {
    const row = this.events.get(eventId);
    return row ? clone(row) : null;
  }

  async insertEvent(event) {
    if (this.events.has(event.eventId)) {
      const error = new Error('duplicate event');
      error.code = 'DUPLICATE';
      throw error;
    }
    this.events.set(event.eventId, clone(event));
    return clone(event);
  }

  async listEvents() {
    return Array.from(this.events.values()).map(clone);
  }

  async listBadges() {
    return Array.from(this.badges.values()).map(clone);
  }

  async upsertBadge(badge) {
    this.badges.set(badge.id, clone(badge));
    return clone(badge);
  }

  async deleteBadge(id) {
    return this.badges.delete(id);
  }

  async findVisit(id) {
    const row = this.visits.get(id);
    return row ? clone(row) : null;
  }

  async insertVisit(visit) {
    this.visits.set(visit.id, clone(visit));
    return clone(visit);
  }

  async updateVisit(id, patch, options = {}) {
    const row = this.visits.get(id);
    if (!row) return null;
    if (options.ifOpenUnalerted && (row.status !== 'open' || row.alertedAt)) return null;
    Object.assign(row, patch);
    return clone(row);
  }

  async listVisits() {
    return Array.from(this.visits.values()).map(clone);
  }

  async insertOutbox(row) {
    this.outbox.set(row.id, clone(row));
    return clone(row);
  }

  async listOutbox() {
    return Array.from(this.outbox.values()).map(clone);
  }

  async findSweep(dayKey) {
    const row = this.sweeps.get(dayKey);
    return row ? clone(row) : null;
  }

  async insertSweep(row) {
    if (this.sweeps.has(row.dayKey)) {
      const error = new Error('duplicate sweep');
      error.code = 'DUPLICATE';
      throw error;
    }
    this.sweeps.set(row.dayKey, clone(row));
    return clone(row);
  }

  async listSweeps() {
    return Array.from(this.sweeps.values()).map(clone);
  }
}

class PersistentDoorRepository {
  constructor(dbService) {
    this.db = dbService;
    this.dir = path.join(__dirname, '../../database');
    this.files = {
      events: path.join(this.dir, 'door-events.json'),
      badges: path.join(this.dir, 'door-badges.json'),
      visits: path.join(this.dir, 'door-visits.json'),
      outbox: path.join(this.dir, 'door-outbox.json'),
      sweeps: path.join(this.dir, 'door-sweeps.json'),
    };
  }

  mongo() {
    return Boolean(this.db && this.db.useMongoDb);
  }

  async readFile(name) {
    try {
      const raw = await fs.readFile(this.files[name], 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async writeFile(name, rows) {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.files[name], JSON.stringify(rows, null, 2));
  }

  async findEvent(eventId) {
    if (this.mongo()) {
      const doc = await DoorEvent.findOne({ eventId }).lean();
      return doc || null;
    }
    const rows = await this.readFile('events');
    return rows.find((row) => row.eventId === eventId) || null;
  }

  async insertEvent(event) {
    if (this.mongo()) {
      try {
        await DoorEvent.create(event);
      } catch (error) {
        if (error && error.code === 11000) {
          const dup = new Error('duplicate event');
          dup.code = 'DUPLICATE';
          throw dup;
        }
        throw error;
      }
      return event;
    }
    const rows = await this.readFile('events');
    if (rows.some((row) => row.eventId === event.eventId)) {
      const dup = new Error('duplicate event');
      dup.code = 'DUPLICATE';
      throw dup;
    }
    rows.push(event);
    await this.writeFile('events', rows);
    return event;
  }

  async listEvents() {
    if (this.mongo()) return DoorEvent.find({}).lean();
    return this.readFile('events');
  }

  async listBadges() {
    if (this.mongo()) return BadgeMap.find({}).lean();
    return this.readFile('badges');
  }

  async upsertBadge(badge) {
    if (this.mongo()) {
      await BadgeMap.findOneAndUpdate({ id: badge.id }, badge, { upsert: true, new: true });
      return badge;
    }
    const rows = await this.readFile('badges');
    const index = rows.findIndex((row) => row.id === badge.id);
    if (index >= 0) rows[index] = badge;
    else rows.push(badge);
    await this.writeFile('badges', rows);
    return badge;
  }

  async deleteBadge(id) {
    if (this.mongo()) {
      const result = await BadgeMap.deleteOne({ id });
      return result.deletedCount > 0;
    }
    const rows = await this.readFile('badges');
    const next = rows.filter((row) => row.id !== id);
    await this.writeFile('badges', next);
    return next.length !== rows.length;
  }

  async findVisit(id) {
    if (this.mongo()) return DoorVisit.findOne({ id }).lean();
    const rows = await this.readFile('visits');
    return rows.find((row) => row.id === id) || null;
  }

  async insertVisit(visit) {
    if (this.mongo()) {
      await DoorVisit.create(visit);
      return visit;
    }
    const rows = await this.readFile('visits');
    rows.push(visit);
    await this.writeFile('visits', rows);
    return visit;
  }

  async updateVisit(id, patch, options = {}) {
    if (this.mongo()) {
      const filter = { id };
      if (options.ifOpenUnalerted) {
        filter.status = 'open';
        filter.alertedAt = null;
      }
      const doc = await DoorVisit.findOneAndUpdate(filter, { $set: patch }, { new: true }).lean();
      return doc || null;
    }
    const rows = await this.readFile('visits');
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) return null;
    if (options.ifOpenUnalerted && (rows[index].status !== 'open' || rows[index].alertedAt)) return null;
    rows[index] = { ...rows[index], ...patch };
    await this.writeFile('visits', rows);
    return rows[index];
  }

  async listVisits() {
    if (this.mongo()) return DoorVisit.find({}).lean();
    return this.readFile('visits');
  }

  async insertOutbox(row) {
    if (this.mongo()) {
      await EmailOutbox.create(row);
      return row;
    }
    const rows = await this.readFile('outbox');
    rows.push(row);
    await this.writeFile('outbox', rows);
    return row;
  }

  async listOutbox() {
    if (this.mongo()) return EmailOutbox.find({}).sort({ createdAt: -1 }).lean();
    const rows = await this.readFile('outbox');
    return rows.slice().reverse();
  }

  async findSweep(dayKey) {
    if (this.mongo()) return SweepRun.findOne({ dayKey }).lean();
    const rows = await this.readFile('sweeps');
    return rows.find((row) => row.dayKey === dayKey) || null;
  }

  async insertSweep(row) {
    if (this.mongo()) {
      try {
        await SweepRun.create(row);
      } catch (error) {
        if (error && error.code === 11000) {
          const dup = new Error('duplicate sweep');
          dup.code = 'DUPLICATE';
          throw dup;
        }
        throw error;
      }
      return row;
    }
    const rows = await this.readFile('sweeps');
    if (rows.some((item) => item.dayKey === row.dayKey)) {
      const dup = new Error('duplicate sweep');
      dup.code = 'DUPLICATE';
      throw dup;
    }
    rows.push(row);
    await this.writeFile('sweeps', rows);
    return row;
  }

  async listSweeps() {
    if (this.mongo()) return SweepRun.find({}).lean();
    return this.readFile('sweeps');
  }
}

module.exports = {
  MemoryDoorRepository,
  PersistentDoorRepository,
};
