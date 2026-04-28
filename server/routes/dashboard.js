const express = require('express');
const router = express.Router();
const {
  getCorporateUserByEmail,
  getInPlaySubmissionsForUser,
  getClientContactsOwnedBy,
  getAppointmentsInRange,
  findContactsByEmails,
  findCandidatesByEmails,
  createAppointment,
} = require('../lib/bullhorn');
const { supabase } = require('../lib/db');
const { SALES_POINTS } = require('../lib/salesConfig');

// GET /api/dashboard/candidates-in-play
// Recruiter tile: JobSubmissions currently in an interviewing/offer stage,
// scoped to the signed-in recruiter.
router.get('/candidates-in-play', async (req, res, next) => {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ error: 'User email not available' });

    const corpUser = await getCorporateUserByEmail(email);
    if (!corpUser) return res.json({ total: 0, data: [] });

    const result = await getInPlaySubmissionsForUser(corpUser.id);
    const rows = (result?.data || []).map(sub => ({
      id: sub.id,
      status: sub.status,
      dateAdded: sub.dateAdded ? new Date(sub.dateAdded).toISOString() : null,
      candidate: sub.candidate
        ? `${sub.candidate.firstName || ''} ${sub.candidate.lastName || ''}`.trim()
        : '',
      candidateId: sub.candidate?.id || null,
      jobId: sub.jobOrder?.id || null,
      jobTitle: sub.jobOrder?.title || '',
      client: sub.jobOrder?.clientCorporation?.name || '',
    }));

    res.json({ total: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/am-stale-contacts
// AM tile: ClientContacts owned by the signed-in AM that have had no MAR-driving
// activity logged by that AM in the last 14 days.
//
// "Activity" = Appointment (types drive MAR via salesConfig.SALES_POINTS).
// We reuse getAppointmentsInRange with ownerIds=[userId] — the same query that
// backs the AM performance dashboard — so the definition of "activity" stays
// consistent with the MAR number the user sees elsewhere.
router.get('/am-stale-contacts', async (req, res, next) => {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ error: 'User email not available' });

    const corpUser = await getCorporateUserByEmail(email);
    const role = (corpUser?.customText1 || '').trim();
    if (!corpUser || role !== 'Account Manager') {
      // Non-AMs get an empty response rather than 403 — the tile is hidden for
      // them anyway; this prevents a noisy error if the client ever calls it.
      return res.json({ total: 0, data: [] });
    }

    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const [contactsRes, apptRes] = await Promise.all([
      getClientContactsOwnedBy(corpUser.id),
      getAppointmentsInRange(fourteenDaysAgo, Date.now(), [corpUser.id]),
    ]);

    // Build a set of ClientContact IDs that had any appointment logged by this AM
    // in the last 14 days. Appointments expose the contact via clientContactReference
    // (single) — fall back to an empty array when absent.
    const activeContactIds = new Set();
    for (const appt of (apptRes?.data || [])) {
      const cc = appt.clientContactReference;
      if (cc?.id) activeContactIds.add(cc.id);
    }

    const stale = (contactsRes?.data || [])
      .filter(c => !activeContactIds.has(c.id))
      .map(c => ({
        id: c.id,
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
        email: c.email || '',
        clientId: c.clientCorporation?.id || null,
        client: c.clientCorporation?.name || '',
      }));

    res.json({ total: stale.length, data: stale });
  } catch (err) {
    next(err);
  }
});

// --- "Last 7 days of meetings" section -----------------------------------

// GET /api/dashboard/logged-meeting-ids
// Returns the set of Outlook event IDs the signed-in user has already logged
// activity for via the Daily Brief "Log activity" modal. Used to render the
// ✓ Logged badge on rows that have been handled.
router.get('/logged-meeting-ids', async (req, res, next) => {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ error: 'User email not available' });
    if (!supabase) return res.json({ ids: [] });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('meeting_activity_logged')
      .select('outlook_event_id')
      .eq('user_email', email.toLowerCase())
      .gte('logged_at', sevenDaysAgo);

    if (error) {
      // Table may not exist yet on a fresh deploy — degrade silently so the
      // section still renders the meeting list (just without ✓ marks).
      if (error.message.includes('meeting_activity_logged')) {
        return res.json({ ids: [] });
      }
      throw error;
    }
    res.json({ ids: (data || []).map(r => r.outlook_event_id) });
  } catch (err) {
    next(err);
  }
});

// POST /api/dashboard/match-meeting-attendees
// Body: { emails: ["alice@x.com", "bob@y.com"] }
// Returns: { matches: { "alice@x.com": { kind: "contact"|"candidate", ... } } }
// Used to auto-suggest a Bullhorn ClientContact (or Candidate fallback) for
// each external attendee so the modal can pre-fill on open.
router.post('/match-meeting-attendees', async (req, res, next) => {
  try {
    const emails = Array.isArray(req.body?.emails) ? req.body.emails : [];
    const lowered = emails.map(e => String(e || '').toLowerCase().trim()).filter(Boolean);
    if (lowered.length === 0) return res.json({ matches: {} });

    const [contactsRes, candidatesRes] = await Promise.all([
      findContactsByEmails(lowered),
      findCandidatesByEmails(lowered),
    ]);

    const matches = {};
    for (const c of (contactsRes?.data || [])) {
      const key = (c.email || '').toLowerCase();
      if (!key || matches[key]) continue;
      matches[key] = {
        kind: 'contact',
        id: c.id,
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        email: c.email || '',
        clientId: c.clientCorporation?.id || null,
        clientName: c.clientCorporation?.name || '',
      };
    }
    // Candidate match only used when there's no contact match for the email.
    for (const c of (candidatesRes?.data || [])) {
      const key = (c.email || '').toLowerCase();
      if (!key || matches[key]) continue;
      matches[key] = {
        kind: 'candidate',
        id: c.id,
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        email: c.email || '',
      };
    }
    res.json({ matches });
  } catch (err) {
    next(err);
  }
});

// POST /api/dashboard/log-meeting-activity
// Body: {
//   outlookEventId, type, dateBegin (ms), subject,
//   clientContactId?, candidateId?, jobOrderId?, comments?, durationMinutes?
// }
// Creates a Bullhorn Appointment owned by the signed-in user and records the
// Outlook event ID in Supabase so the row stays marked ✓ across page loads.
router.post('/log-meeting-activity', async (req, res, next) => {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ error: 'User email not available' });

    const {
      outlookEventId, type, dateBegin, subject,
      clientContactId, candidateId, jobOrderId, comments, durationMinutes,
    } = req.body || {};

    if (!outlookEventId) return res.status(400).json({ error: 'outlookEventId is required' });
    if (!type || !(type in SALES_POINTS)) {
      return res.status(400).json({ error: `Invalid activity type "${type}"` });
    }
    if (!dateBegin || typeof dateBegin !== 'number') {
      return res.status(400).json({ error: 'dateBegin (ms timestamp) is required' });
    }

    const corpUser = await getCorporateUserByEmail(email);
    if (!corpUser) return res.status(403).json({ error: 'No Bullhorn user matched for your email' });

    // Idempotency: if this Outlook event was already logged, return the prior
    // appointment id rather than creating a duplicate.
    if (supabase) {
      const { data: existing } = await supabase
        .from('meeting_activity_logged')
        .select('bullhorn_appointment_id')
        .eq('user_email', email.toLowerCase())
        .eq('outlook_event_id', outlookEventId)
        .maybeSingle();
      if (existing?.bullhorn_appointment_id) {
        return res.json({
          alreadyLogged: true,
          appointmentId: existing.bullhorn_appointment_id,
        });
      }
    }

    let appointmentId;
    try {
      const created = await createAppointment({
        ownerId: corpUser.id,
        type,
        dateBegin,
        subject,
        clientContactId,
        candidateId,
        jobOrderId,
        comments,
        durationMinutes,
      });
      appointmentId = created.id;
    } catch (bhErr) {
      // createAppointment now throws when Bullhorn rejects (MCP { message }
      // shape) — surface the rejection text to the modal so the user knows
      // exactly what to fix instead of getting a silent fake-success.
      return res.status(502).json({ error: bhErr.message || 'Bullhorn rejected the appointment' });
    }

    if (supabase) {
      const { error: upErr } = await supabase
        .from('meeting_activity_logged')
        .upsert(
          {
            user_email: email.toLowerCase(),
            outlook_event_id: outlookEventId,
            bullhorn_appointment_id: appointmentId,
            logged_at: new Date().toISOString(),
          },
          { onConflict: 'user_email,outlook_event_id' },
        );
      if (upErr && !upErr.message.includes('meeting_activity_logged')) {
        // Real error (not "table missing") — surface but don't roll back the
        // Bullhorn write since that's already committed.
        console.error('[dashboard] meeting_activity_logged upsert error:', upErr.message);
      }
    }

    res.json({ ok: true, appointmentId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
