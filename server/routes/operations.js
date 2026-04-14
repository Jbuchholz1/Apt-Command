const express = require('express');
const { getActivePlacements } = require('../lib/bullhorn');
const { getAllPlacementChecklist, upsertPlacementChecklist } = require('../lib/db');

const router = express.Router();

const OPS_STATUSES = new Set(['Pending', 'Approved']);

// GET /api/operations/debug — Raw Bullhorn response for debugging
router.get('/debug', async (req, res, next) => {
  try {
    console.log('[operations/debug] Calling getActivePlacements...');
    const result = await getActivePlacements();
    console.log('[operations/debug] Result type:', typeof result, '| Has data:', !!result?.data, '| Count:', result?.data?.length ?? 'N/A');
    res.json({
      resultType: typeof result,
      isNull: result === null,
      hasData: !!result?.data,
      dataLength: result?.data?.length ?? 0,
      firstItem: result?.data?.[0] || null,
      rawKeys: result ? Object.keys(result) : [],
    });
  } catch (err) {
    console.log('[operations/debug] ERROR:', err.message);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// GET /api/operations/placements — Pending & Approved placements with checklist state
router.get('/placements', async (req, res, next) => {
  try {
    // Fetch Bullhorn placements first (proven function)
    let bhResult;
    try {
      bhResult = await getActivePlacements();
      console.log('[operations] Bullhorn OK — type:', typeof bhResult, '| keys:', Object.keys(bhResult || {}), '| raw:', JSON.stringify(bhResult).slice(0, 500));
    } catch (bhErr) {
      console.log('[operations] Bullhorn FAILED:', bhErr.message);
      bhResult = null;
    }

    // Fetch checklist state separately so Supabase issues don't block Bullhorn data
    let checklistMap = {};
    try {
      checklistMap = await getAllPlacementChecklist();
      console.log('[operations] Supabase OK — keys:', Object.keys(checklistMap).length);
    } catch (dbErr) {
      console.log('[operations] Supabase FAILED:', dbErr.message);
    }

    const allPlacements = bhResult?.data || [];
    console.log('[operations] Statuses found:', [...new Set(allPlacements.map(p => p.status))]);

    // Filter to only Pending & Approved
    const filtered = allPlacements.filter(p => OPS_STATUSES.has(p.status));
    console.log('[operations] After filter:', filtered.length, 'of', allPlacements.length);

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
    console.error('[operations] Unhandled error:', err.message);
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
