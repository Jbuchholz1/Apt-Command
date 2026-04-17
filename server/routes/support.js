const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireManager } = require('../middleware/adminAuth');
const { resolveRole } = require('../lib/roles');
const db = require('../lib/db');

// Multer: in-memory storage for screenshot uploads (max 5MB, images only)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

// =============================================
// Phase 2: System Health
// =============================================

// GET /api/support/health — system health check
router.get('/health', async (req, res, next) => {
  try {
    const results = await Promise.allSettled([
      // 1. Bullhorn MCP ping
      (async () => {
        const { callTool } = require('../lib/bullhorn');
        const start = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          await callTool('search_jobs', { query: 'health_check', count: 1 });
          clearTimeout(timeout);
          return { status: 'healthy', responseTimeMs: Date.now() - start };
        } catch (err) {
          clearTimeout(timeout);
          return { status: 'down', error: err.message, responseTimeMs: Date.now() - start };
        }
      })(),
      // 2. Supabase ping
      (async () => {
        const ok = await db.pingSupabase();
        return { status: ok ? 'healthy' : 'down' };
      })(),
    ]);

    const [mcpResult, dbResult] = results;

    res.json({
      api: { status: 'healthy', uptimeSeconds: Math.floor(process.uptime()) },
      mcp: mcpResult.status === 'fulfilled' ? mcpResult.value : { status: 'down', error: 'Check failed' },
      database: dbResult.status === 'fulfilled' ? dbResult.value : { status: 'down', error: 'Check failed' },
      timestamp: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

// =============================================
// Teams Notification (fire-and-forget)
// =============================================

const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;

async function notifyTeams(ticket) {
  if (!TEAMS_WEBHOOK_URL) return;
  try {
    const categoryLabel = {
      issue: 'Issue',
      bug: 'Issue',
      feature: 'Feature Request',
      feedback: 'General Question',
    }[ticket.category] || ticket.category;

    const time = ticket.created_at
      ? new Date(ticket.created_at).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'short', timeStyle: 'short' })
      : '';

    const ticketRef = ticket.ticket_number
      ? `Apt${String(ticket.ticket_number).padStart(6, '0')}`
      : null;

    const card = {
      type: 'AdaptiveCard',
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: ticketRef ? `NEW SUPPORT TICKET — ${ticketRef}` : 'NEW SUPPORT TICKET',
          weight: 'Bolder',
          color: 'Attention',
          size: 'Small',
        },
        {
          type: 'TextBlock',
          text: ticket.title,
          weight: 'Bolder',
          size: 'Medium',
          wrap: true,
        },
        {
          type: 'TextBlock',
          text: ticket.description,
          wrap: true,
          size: 'Small',
        },
        {
          type: 'FactSet',
          facts: [
            ...(ticketRef ? [{ title: 'Ticket #', value: ticketRef }] : []),
            { title: 'Category', value: categoryLabel },
            { title: 'Submitted by', value: ticket.submitted_by_name || ticket.submitted_by },
            { title: 'Time', value: time },
          ],
        },
      ],
    };

    if (ticket.screenshot_url) {
      card.body.push({
        type: 'ActionSet',
        actions: [{
          type: 'Action.OpenUrl',
          title: 'View Screenshot',
          url: ticket.screenshot_url,
        }],
      });
    }

    const resp = await fetch(TEAMS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: card,
        }],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(`[support] Teams webhook returned ${resp.status}: ${body}`);
    } else {
      console.log('[support] Teams notification sent');
    }
  } catch (err) {
    console.error('[support] Teams notification failed:', err.message);
  }
}

// =============================================
// Phase 3: Support Tickets
// =============================================

const VALID_CATEGORIES = ['issue', 'feature', 'feedback', 'bug', 'it_support'];
const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

// POST /api/support/tickets — submit a new ticket (all users)
router.post('/tickets', upload.single('screenshot'), async (req, res, next) => {
  try {
    const { category, title, description } = req.body;

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Description is required' });
    }

    let screenshotUrl = null;
    if (req.file) {
      screenshotUrl = await db.uploadSupportScreenshot(req.file.buffer, req.file.originalname, req.file.mimetype);
    }

    const ticket = await db.createSupportTicket({
      category: category.trim(),
      title: title.trim(),
      description: description.trim(),
      screenshot_url: screenshotUrl,
      submitted_by: req.user.email,
      submitted_by_name: req.user.name || req.user.email,
    });

    // Fire-and-forget — don't block the response
    notifyTeams(ticket);

    res.status(201).json(ticket);
  } catch (err) { next(err); }
});

// GET /api/support/tickets — get tickets (mine=true for own, all for manager/admin)
router.get('/tickets', async (req, res, next) => {
  try {
    const mine = req.query.mine === 'true';
    const targetEmail = req.query.email;

    // If ?email= is provided and differs from caller, require manager/admin
    if (targetEmail && targetEmail !== req.user.email) {
      const role = await resolveRole(req.user.email);
      if (role !== 'admin' && role !== 'manager') {
        return res.status(403).json({ error: "Forbidden — manager or admin required to view other users' tickets" });
      }
      const tickets = await db.getSupportTickets({ submittedBy: targetEmail });
      return res.json(tickets);
    }

    if (mine) {
      const tickets = await db.getSupportTickets({ submittedBy: req.user.email });
      return res.json(tickets);
    }

    // All tickets — requires admin
    const role = await resolveRole(req.user.email);
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden — admin access required' });
    }

    const tickets = await db.getSupportTickets({});
    res.json(tickets);
  } catch (err) { next(err); }
});

// PATCH /api/support/tickets/:id/status — update ticket status (manager/admin)
router.patch('/tickets/:id/status', requireManager, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const ticket = await db.updateSupportTicket(id, {
      status,
      admin_notes: admin_notes || undefined,
      updated_by: req.user.email,
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(ticket);
  } catch (err) { next(err); }
});

// =============================================
// Ticket Comments (admin + submitter only)
// =============================================

// Helper: load ticket and verify caller can view/comment
async function loadTicketForComment(req, res) {
  const { id } = req.params;
  const ticket = await db.getSupportTicketById(id);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return null;
  }
  const isSubmitter = ticket.submitted_by === req.user.email;
  const role = await resolveRole(req.user.email);
  const isAdmin = role === 'admin';
  if (!isSubmitter && !isAdmin) {
    res.status(403).json({ error: 'Forbidden — only the submitter or an admin can view/comment on this ticket' });
    return null;
  }
  return { ticket, isSubmitter, isAdmin };
}

// GET /api/support/tickets/:id/comments — list comments on a ticket
router.get('/tickets/:id/comments', async (req, res, next) => {
  try {
    const ctx = await loadTicketForComment(req, res);
    if (!ctx) return;
    const comments = await db.getTicketComments(req.params.id);
    res.json(comments);
  } catch (err) { next(err); }
});

// POST /api/support/tickets/:id/comments — add a comment to a ticket
router.post('/tickets/:id/comments', async (req, res, next) => {
  try {
    const ctx = await loadTicketForComment(req, res);
    if (!ctx) return;
    const { comment } = req.body;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }
    const newComment = await db.addTicketComment({
      ticketId: req.params.id,
      authorEmail: req.user.email,
      authorName: req.user.name || req.user.email,
      comment: comment.trim(),
    });
    res.status(201).json(newComment);
  } catch (err) { next(err); }
});

// =============================================
// Phase 3: Known Issues
// =============================================

const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];

// GET /api/support/known-issues — list known issues (all users)
router.get('/known-issues', async (req, res, next) => {
  try {
    const statusFilter = req.query.status || 'active';
    const issues = await db.getKnownIssues(statusFilter === 'all' ? null : statusFilter);
    res.json(issues);
  } catch (err) { next(err); }
});

// POST /api/support/known-issues — create known issue (manager/admin)
router.post('/known-issues', requireManager, async (req, res, next) => {
  try {
    const { title, description, severity } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Description is required' });
    }
    if (severity && !VALID_SEVERITIES.includes(severity)) {
      return res.status(400).json({ error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}` });
    }

    const issue = await db.createKnownIssue({
      title: title.trim(),
      description: description.trim(),
      severity: severity || 'medium',
      created_by: req.user.email,
    });

    res.status(201).json(issue);
  } catch (err) { next(err); }
});

// PATCH /api/support/known-issues/:id — update known issue (manager/admin)
router.patch('/known-issues/:id', requireManager, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, title, description } = req.body;

    const updates = {};
    if (status) updates.status = status;
    if (title) updates.title = title.trim();
    if (description) updates.description = description.trim();
    if (status === 'resolved') updates.resolved_at = new Date().toISOString();

    const issue = await db.updateKnownIssue(id, updates);
    if (!issue) {
      return res.status(404).json({ error: 'Known issue not found' });
    }

    res.json(issue);
  } catch (err) { next(err); }
});

module.exports = router;
