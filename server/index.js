const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
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

// --- Security headers (CSP disabled to avoid breaking inline styles/scripts) ---
app.use(helmet({ contentSecurityPolicy: false }));

// --- Response compression (gzip) ---
app.use(compression());

// --- Rate limiting ---
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 200,              // 200 requests per minute per IP
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again shortly' },
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,               // 30 writes per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many updates — please try again shortly' },
});

app.use('/api', generalLimiter);
app.use('/api', (req, res, next) => {
  if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
    return writeLimiter(req, res, next);
  }
  next();
});

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
  methods: ['GET', 'POST', 'PATCH', 'PUT'],
  credentials: true, // Allow Authorization header
}));

app.use(express.json());

// --- Cache-Control for GET responses (browser can reuse recent responses) ---
app.use('/api', (req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', 'private, max-age=300'); // 5 minutes
  }
  next();
});

// --- Health check (UNAUTHENTICATED — Railway needs this) ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Auth middleware: all /api/* routes below require a valid Microsoft token ---
app.use('/api', requireAuth);

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
  if (IS_PROD) {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
  console.log(`Auth: ${process.env.AZURE_TENANT_ID ? 'Microsoft SSO enabled' : 'DEV MODE (no auth)'}`);
});
