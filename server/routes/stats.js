const express = require('express');
const { getOpenJobs, getActivePlacements, getOpenOpportunities } = require('../lib/bullhorn');
const { getAllOverrides } = require('../lib/db');
const { requireModule } = require('../middleware/adminAuth');

const router = express.Router();

router.use(requireModule('req_board'));

// GET /api/stats — Summary counts for the stats strip.
// Optional `?apt_india=true` query param filters jobs + placements to those
// flagged as India-owned (via job_overrides.apt_india). Opportunities are
// left firm-wide since they are pre-job and have no apt_india concept.
router.get('/', async (req, res, next) => {
  try {
    const aptIndiaOnly = req.query.apt_india === 'true';

    const [jobsResult, placementsResult, opportunitiesResult, overrides] = await Promise.all([
      getOpenJobs(),
      getActivePlacements(),
      getOpenOpportunities(),
      aptIndiaOnly ? getAllOverrides() : Promise.resolve({}),
    ]);

    let jobs = jobsResult?.data || [];
    let placements = placementsResult?.data || [];
    const opportunities = opportunitiesResult?.data || [];

    if (aptIndiaOnly) {
      const indiaJobIds = new Set(
        Object.entries(overrides)
          .filter(([, ov]) => ov && (ov.apt_india === true || ov.apt_india === 'true'))
          .map(([id]) => parseInt(id, 10))
          .filter(id => !Number.isNaN(id)),
      );
      jobs = jobs.filter(j => indiaJobIds.has(j.id));
      placements = placements.filter(p => p.jobOrder && indiaJobIds.has(p.jobOrder.id));
    }

    const activeOpportunities = opportunities.filter(o => {
      const s = Array.isArray(o.status) ? o.status[0] : o.status;
      return ['Open', 'Qualifying', 'Negotiating'].includes(s);
    });

    const statusCount = (status) =>
      jobs.filter(j => {
        const s = Array.isArray(j.status) ? j.status[0] : j.status;
        return s === status;
      }).length;

    res.json({
      openReqs: jobs.length,
      activeContractors: placements.length,
      totalOpportunities: activeOpportunities.length,
      offersOut: statusCount('Offer Out'),
      covered: statusCount('Covered'),
      acceptingCandidates: statusCount('Accepting Candidates'),
      placed: statusCount('Placed'),
      filled: statusCount('Filled'),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
