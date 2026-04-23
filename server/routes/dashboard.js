const express = require('express');
const router = express.Router();
const {
  getCorporateUserByEmail,
  getInPlaySubmissionsForUser,
  getClientContactsOwnedBy,
  getAppointmentsInRange,
} = require('../lib/bullhorn');

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

module.exports = router;
