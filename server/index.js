const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { requireAuth } = require('./middleware/auth');

const jobsRouter = require('./routes/jobs');
const placementsRouter = require('./routes/placements');
const statsRouter = require('./routes/stats');
const reportingRouter = require('./routes/reporting');
const clientHealthRouter = require('./routes/clientHealth');
const performanceRouter = require('./routes/performance');
const orgflowRouter = require('./routes/orgflow');
const usersRouter = require('./routes/users');
const adminRouter = require('./routes/admin');
const operationsRouter = require('./routes/operations');
const supportRouter = require('./routes/support');
const goalsRouter = require('./routes/goals');
const searchRouter = require('./routes/search');
const dashboardRouter = require('./routes/dashboard');
const projectManagementRouter = require('./routes/projectManagement');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// Railway runs behind a reverse proxy — trust it for accurate rate limiting
app.set('trust proxy', 1);

// --- CORS: strict origin control ---
const allowedOrigins = [
  process.env.FRONTEND_URL,        // Production frontend (Railway)
  ...(!IS_PROD ? [
    'http://localhost:5173',        // Vite dev server
    'http://localhost:5174',        // Vite alt port
  ] : []),
].filter(Boolean).map(u => u.replace(/\/+$/, '')); // strip trailing slashes

console.log(`CORS: ${allowedOrigins.length} origin(s) configured`);

// --- Security headers ---
//
// CSP_MODE controls Content-Security-Policy enforcement:
//   off          (default) — header not sent; current behavior
//   report-only  — Content-Security-Policy-Report-Only header sent; violations
//                  POST to /api/csp-report but nothing is blocked
//   enforce      — Content-Security-Policy header sent; violations blocked
//
// Phase 1 inventory (2026-04-29) confirmed zero inline <script>/<style> blocks
// in the build, no eval/new Function, no runtime DOM injection. 'unsafe-inline'
// in style-src is required only for React runtime style="..." attributes.
const CSP_MODE = (process.env.CSP_MODE || 'off').toLowerCase();
const CSP_ENABLED = CSP_MODE === 'report-only' || CSP_MODE === 'enforce';
const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com'],
  imgSrc: ["'self'", 'data:', 'https:'],
  connectSrc: [
    "'self'",
    'https://login.microsoftonline.com',
    'https://*.microsoftonline.com',
    'https://graph.microsoft.com',
  ],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'", 'https://login.microsoftonline.com'],
  objectSrc: ["'none'"],
  reportUri: ['/api/csp-report'],
};
console.log(`CSP: ${CSP_MODE}`);
app.use(helmet({
  contentSecurityPolicy: CSP_ENABLED ? {
    useDefaults: false,
    directives: CSP_DIRECTIVES,
    reportOnly: CSP_MODE === 'report-only',
  } : false,
}));

// --- Response compression (gzip) ---
app.use(compression());

// --- Rate limiting ---
//
// Two layers so a shared office NAT doesn't penalize individual users:
//   1. Coarse per-IP flood limiter BEFORE auth — protects the auth path
//      from unauthenticated abuse.
//   2. Real per-user budget AFTER auth — keyed by the Entra oid (req.user.id),
//      falling back to IP when auth is skipped in dev mode.
//
// Per-user thresholds match the previous per-IP numbers, so a single user's
// experience is unchanged; what changes is that 30 colleagues behind one
// office IP no longer share a single 200-req/min budget.
const ipFloodLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this network — please try again shortly' },
});

// Fall back to the library's IPv6-safe IP keying when we don't have an authed user
// (dev mode or unauthenticated routes that still hit this limiter).
const userKey = (req, res) => {
  if (req.user && req.user.id) return `u:${req.user.id}`;
  return `ip:${ipKeyGenerator(req, res)}`;
};

const userGeneralLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
  message: { error: 'Too many requests — please try again shortly' },
});

const userWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
  message: { error: 'Too many updates — please try again shortly' },
});

app.use('/api', ipFloodLimiter);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, health checks)
    if (!origin) return callback(null, true);
    const cleaned = origin.replace(/\/+$/, '');
    // Allow only explicitly configured origins
    if (allowedOrigins.includes(cleaned)) {
      return callback(null, true);
    }
    console.warn(`CORS rejected origin: ${origin}`);
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  credentials: true, // Allow Authorization header
}));

app.use(express.json());

// --- Cache-Control for GET responses ---
// `no-store` because GETs surface override-mutable data (notes, deadlines,
// follow-ups, recruiter assignments). A browser HTTP cache here causes saved
// edits to "disappear" briefly when the auto-refresh or manual refresh hits
// a cached pre-edit response — server-side cache busting can't reach the
// browser. Server-side caches (lib/cache.js) and Bullhorn caching still
// absorb load.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

// --- Health check (UNAUTHENTICATED — Railway needs this) ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- CSP violation reports (UNAUTHENTICATED — browsers can't send auth headers).
// Body comes in as application/csp-report (legacy report-uri) or
// application/reports+json (modern report-to). Per-route parser handles both.
// Size-capped and IP-rate-limited via the upstream ipFloodLimiter.
app.post(
  '/api/csp-report',
  express.json({
    type: ['application/csp-report', 'application/reports+json', 'application/json'],
    limit: '10kb',
  }),
  (req, res) => {
    const r = (req.body && (req.body['csp-report'] || req.body)) || {};
    console.warn('[CSP-REPORT]', JSON.stringify({
      directive: r['effective-directive'] || r['violated-directive'],
      blockedUri: r['blocked-uri'],
      sourceFile: r['source-file'],
      line: r['line-number'],
      docUri: r['document-uri'],
    }));
    res.status(204).end();
  }
);

// --- Auth middleware: all /api/* routes below require a valid Microsoft token ---
app.use('/api', requireAuth);

// Per-user rate limits — applied after auth so they key off req.user.id.
app.use('/api', userGeneralLimiter);
app.use('/api', (req, res, next) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    return userWriteLimiter(req, res, next);
  }
  next();
});

// --- Routes (all authenticated) ---
// Namespaced routes (new — used by APT Command shell)
app.use('/api/req-board/jobs', jobsRouter);
app.use('/api/req-board/placements', placementsRouter);
app.use('/api/req-board/stats', statsRouter);
// Reporting module
app.use('/api/reporting', reportingRouter);
// Client Health module
app.use('/api/client-health', clientHealthRouter);
// Individual Performance module
app.use('/api/performance', performanceRouter);
// Org Flow module
app.use('/api/org-flow', orgflowRouter);
// Operations module
app.use('/api/operations', operationsRouter);
// Support module
app.use('/api/support', supportRouter);
// Goal Tracking module
app.use('/api/goals', goalsRouter);
// Project Management module (admin/manager only — gated inside the router)
app.use('/api/project-management', projectManagementRouter);
// Universal Search
app.use('/api/search', searchRouter);
// Daily Brief role-aware tiles
app.use('/api/dashboard', dashboardRouter);
// User management
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);
// Legacy routes (backward compat — remove after deploy confirmed)
app.use('/api/jobs', jobsRouter);
app.use('/api/placements', placementsRouter);
app.use('/api/stats', statsRouter);

// --- Error handler: don't leak details in production ---
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // Typed errors (have err.statusCode or err.code) are intentional and
  // safe to surface — e.g., READ_ONLY_MODE (403) from the sandbox guard,
  // OVERRIDE_CONFLICT (409), validation errors. Plain Errors fall through
  // to the generic 500 to avoid leaking internals.
  if (err.statusCode || err.code) {
    return res.status(err.statusCode || 500).json({
      error: err.message,
      code: err.code,
    });
  }

  if (IS_PROD) {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
  console.log(`Auth: ${process.env.AZURE_TENANT_ID ? 'Microsoft SSO enabled' : 'DEV MODE (no auth)'}`);
  // Single shared Supabase Realtime subscription for the Req Board.
  // Fans out override + note changes to every connected SSE client at
  // /api/req-board/jobs/events. Safe to call when Supabase isn't configured —
  // the module no-ops with a warning and SSE connections continue to work
  // (heartbeats only, no events).
  try {
    require('./lib/realtimeBroadcast').initRealtimeChannel();
  } catch (err) {
    console.warn('[realtime] init failed:', err && err.message);
  }
});

// Background: sync Bullhorn ClientCorporations into Org Flow every 30 min.
// Off by default in dev so local runs don't hammer the MCP; opt in via
// ENABLE_SYNC_CRON=true. Always on in production.
if (IS_PROD || process.env.ENABLE_SYNC_CRON === 'true') {
  const cron = require('node-cron');
  const { syncBullhornClients } = require('./lib/orgflowSync');
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await syncBullhornClients();
      console.log('[cron] orgflow bullhorn sync:', result);
    } catch (err) {
      console.error('[cron] orgflow bullhorn sync failed:', err.message);
    }
  });
  console.log('[cron] orgflow bullhorn sync registered (every 30 min)');
}

// Background: nightly SharePoint export of Req Board, Org Flow, and Pipeline
// at 23:00 America/Chicago. Off by default in dev; opt in via
// ENABLE_EXPORT_CRON=true. Always on in production.
if (IS_PROD || process.env.ENABLE_EXPORT_CRON === 'true') {
  const cron = require('node-cron');
  const { runNightlyExport } = require('./lib/scheduledExport');
  cron.schedule('0 23 * * *', async () => {
    try {
      const results = await runNightlyExport();
      console.log('[cron] nightly sharepoint export:', JSON.stringify(results));
    } catch (err) {
      console.error('[cron] nightly sharepoint export failed:', err.message);
    }
  }, { timezone: 'America/Chicago' });
  console.log('[cron] nightly sharepoint export registered (23:00 America/Chicago)');
}
