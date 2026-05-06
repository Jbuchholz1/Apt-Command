const express = require('express');
const { getOpenJobs, getActivePlacements, getOpenOpportunities } = require('../lib/bullhorn');
const { requireModule } = require('../middleware/adminAuth');

const router = express.Router();

router.use(requireModule('req_board'));

// GET /api/stats — Summary counts for the stats strip
router.get('/', async (req, res, next) => {
  try {
    const [jobsResult, placementsResult, opportunitiesResult] = await Promise.all([
      getOpenJobs(),
      getActivePlacements(),
      getOpenOpportunities(),
    ]);

    const jobs = jobsResult?.data || [];
    const placements = placementsResult?.data || [];
    const opportunities = opportunitiesResult?.data || [];
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
