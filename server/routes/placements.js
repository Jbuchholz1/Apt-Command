const express = require('express');
const { getActivePlacements } = require('../lib/bullhorn');
const { getAllOverrides } = require('../lib/db');
const { contractorWeeklySpread, permWeeklyFee } = require('../lib/spread');
const { requireModule } = require('../middleware/adminAuth');

const router = express.Router();

router.use(requireModule('req_board'));

// GET /api/placements — Active placements (active contractors)
// `?apt_india=true` scopes the list to contractors whose job is India-flagged
// (via job_overrides.apt_india), mirroring the same filter on /stats. Without
// this, the India Req Board's Active Contractors modal showed firm-wide rows.
router.get('/', async (req, res, next) => {
  try {
    const aptIndiaOnly = req.query.apt_india === 'true';
    const [result, overrides] = await Promise.all([
      getActivePlacements(),
      aptIndiaOnly ? getAllOverrides() : Promise.resolve({}),
    ]);
    let rows = result?.data || [];
    if (aptIndiaOnly) {
      const indiaJobIds = new Set(
        Object.entries(overrides)
          .filter(([, ov]) => ov && (ov.apt_india === true || ov.apt_india === 'true'))
          .map(([id]) => parseInt(id, 10))
          .filter(id => !Number.isNaN(id)),
      );
      rows = rows.filter(p => p.jobOrder && indiaJobIds.has(p.jobOrder.id));
    }
    const placements = rows.map(p => {
      const employmentType = p.employmentType || p.jobOrder?.employmentType || null;
      const payRate = p.payRate || null;
      const billRate = p.clientBillRate || null;
      // VMS Fee / Hourly Referral live on the originating submission, not the
      // placement (see Placement.jobSubmission TO_ONE). customFloat2 = VMS Fee
      // (whole percent), customFloat5 = Hourly Referral ($/hr).
      const vmsFee = p.jobSubmission?.customFloat2 ?? null;
      const hourlyReferral = p.jobSubmission?.customFloat5 ?? null;

      // Weekly spread: perm fee for Direct Hire, otherwise the fee-aware
      // contractor spread. feesMissing flags a contractor row that had to fall
      // back to the legacy (no-fee) formula so the UI can render it red.
      let spread = null;
      let feesMissing = false;
      if (employmentType === 'Direct Hire') {
        spread = permWeeklyFee({ salary: p.salary, fee: p.fee });
      } else {
        const r = contractorWeeklySpread({ payRate, billRate, employmentType, vmsFee, hourlyReferral });
        spread = r.spread;
        feesMissing = r.spread != null && !r.hasFeeData;
      }

      return {
        id: p.id,
        candidate: p.candidate
          ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim()
          : null,
        candidateId: p.candidate?.id || null,
        jobTitle: p.jobOrder?.title || null,
        jobOrderId: p.jobOrder?.id || null,
        employmentType,
        dateBegin: p.dateBegin ? new Date(p.dateBegin).toISOString() : null,
        dateEnd: p.dateEnd ? new Date(p.dateEnd).toISOString() : null,
        payRate,
        billRate,
        salary: p.salary || null,
        fee: p.fee || null,
        vmsFee,
        hourlyReferral,
        spread,
        feesMissing,
        status: p.status,
        am: p.jobOrder?.owner
          ? `${(p.jobOrder.owner.firstName || '')[0] || ''}${(p.jobOrder.owner.lastName || '')[0] || ''}`.toUpperCase()
          : '—',
        tr: '*', // assignedUsers (TO_MANY) corrupts Bullhorn JSON when nested in jobOrder — default to *
      };
    });
    res.json({ total: placements.length, data: placements });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
