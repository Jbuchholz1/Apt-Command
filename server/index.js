const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./middleware/auth');

const jobsRouter = require('./routes/jobs');
const placementsRouter = require('./routes/placements');
const statsRouter = require('./routes/stats');
const reportingRouter = require('./routes/reporting');
const clientHealthRouter = require('./routes/clientHealth');
const performanceRouter = require('./routes/performance');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// --- CORS: strict origin control ---
const allowedOrigins = [
  process.env.FRONTEND_URL,        // Production frontend (Railway)
  'http://localhost:5173',          // Vite dev server
  'http://localhost:5174',          // Vite alt port
].filter(Boolean).map(u => u.replace(/\/+$/, '')); // strip trailing slashes

console.log('Allowed CORS origins:', allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, health checks)
    if (!origin) return callback(null, true);
    const cleaned = origin.replace(/\/+$/, '');
    // Allow configured origins + any Railway subdomain
    if (allowedOrigins.includes(cleaned) || cleaned.endsWith('.up.railway.app')) {
      return callback(null, true);
    }
    console.warn(`CORS rejected origin: ${origin}`);
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PATCH'],
  credentials: true, // Allow Authorization header
}));

app.use(express.json());

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
