const express = require('express');
const { getActivePlacements } = require('../lib/bullhorn');

const router = express.Router();

// GET /api/placements — Active placements (active contractors)
router.get('/', async (req, res, next) => {
  try {
    const result = await getActivePlacements();
    const placements = (result?.data || []).map(p => ({
      id: p.id,
      candidate: p.candidate
        ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim()
        : null,
      candidateId: p.candidate?.id || null,
      jobTitle: p.jobOrder?.title || null,
      jobOrderId: p.jobOrder?.id || null,
      employmentType: p.employmentType || p.jobOrder?.employmentType || null,
      dateBegin: p.dateBegin ? new Date(p.dateBegin).toISOString() : null,
      dateEnd: p.dateEnd ? new Date(p.dateEnd).toISOString() : null,
      payRate: p.payRate || null,
      billRate: p.clientBillRate || null,
      salary: p.salary || null,
      fee: p.fee || null,
      status: p.status,
      am: p.jobOrder?.owner
        ? `${(p.jobOrder.owner.firstName || '')[0] || ''}${(p.jobOrder.owner.lastName || '')[0] || ''}`.toUpperCase()
        : '—',
      tr: '*', // assignedUsers (TO_MANY) corrupts Bullhorn JSON when nested in jobOrder — default to *
    }));
    res.json({ total: placements.length, data: placements });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
