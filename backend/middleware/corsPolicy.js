/** Public production frontend. Override with FRONTEND_ORIGIN when the host differs. */
const PRODUCTION_FRONTEND_ORIGIN = 'https://wki-tool-room-system.onrender.com';

function normalizeOrigin(value) {
  if (!value) return '';
  return String(value).trim().replace(/\/$/, '');
}

function allowedOrigins() {
  const origins = new Set();
  origins.add(normalizeOrigin(process.env.FRONTEND_ORIGIN || PRODUCTION_FRONTEND_ORIGIN));
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }
  origins.delete('');
  return origins;
}

function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  if (allowedOrigins().has(normalizeOrigin(origin))) return callback(null, true);
  return callback(null, false);
}

const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform-Token', 'X-Requested-With'],
};

module.exports = {
  PRODUCTION_FRONTEND_ORIGIN,
  allowedOrigins,
  corsOptions,
};
