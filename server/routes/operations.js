const express = require('express');
const { getActivePlacements } = require('../lib/bullhorn');
const { getAllPlacementChecklist, upsertPlacementChecklist } = require('../lib/db');

const router = express.Router();

const OPS_STATUSES = new Set(['Pending', 'Approved']);

// GET /api/operations/placements — Pending & Approved placements with checklist state
router.get('/placements', async (req, res, next) => {
  try {
    const [bhResult, checklistMap] = await Promise.all([
      getActivePlacements(),
      getAllPlacementChecklist(),
    ]);

    // Filter to only Pending & Approved (getActivePlacements also returns Active)
    const filtered = (bhResult?.data || []).filter(p => OPS_STATUSES.has(p.status));

    const placements = filtered.map(p => {
      const checklist = checklistMap[p.id] || {};
      return {
        id: p.id,
        candidate: p.candidate
          ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim()
          : null,
        candidateId: p.candidate?.id || null,
        jobTitle: p.jobOrder?.title || null,
        jobOrderId: p.jobOrder?.id || null,
        employmentType: p.employmentType || null,
        dateBegin: p.dateBegin ? new Date(p.dateBegin).toISOString() : null,
        status: p.status,
        am: p.jobOrder?.owner
          ? `${(p.jobOrder.owner.firstName || '')[0] || ''}${(p.jobOrder.owner.lastName || '')[0] || ''}`.toUpperCase()
          : '—',
        tr: (p.jobOrder?.assignedUsers?.data || [])
          .map(u => `${(u.firstName || '')[0] || ''}${(u.lastName || '')[0] || ''}`.toUpperCase())
          .filter(Boolean)
          .join(', ') || '*',
        // Checklist fields (default false / null)
        ob_paperwork_complete: checklist.ob_paperwork_complete || false,
        new_hire_filed: checklist.new_hire_filed || false,
        healthcare_effective_date: checklist.healthcare_effective_date || null,
        healthcare_payroll_deduction_date: checklist.healthcare_payroll_deduction_date || null,
        enrolled_in_healthcare: checklist.enrolled_in_healthcare || false,
        added_to_payroll: checklist.added_to_payroll || false,
        four01k_opt_in: checklist.four01k_opt_in || false,
        four01k_forms_received: checklist.four01k_forms_received || false,
        added_to_census: checklist.added_to_census || false,
      };
    });

    res.json({ total: placements.length, data: placements });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/operations/placements/:id — Update checklist for a placement
router.patch('/placements/:id', async (req, res, next) => {
  try {
    const placementId = parseInt(req.params.id, 10);
    if (isNaN(placementId)) {
      return res.status(400).json({ error: 'Invalid placement ID' });
    }

    const result = await upsertPlacementChecklist(placementId, {
      ...req.body,
      updated_by: req.user?.name || req.user?.email || '',
    });

    if (!result) {
      return res.status(500).json({ error: 'Failed to save checklist' });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
