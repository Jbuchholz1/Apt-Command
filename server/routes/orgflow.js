const express = require('express');
const router = express.Router();
const { getActivePlacementsWithClient } = require('../lib/bullhorn');

// GET /api/org-flow/contractor-counts
// Returns a map of clientContact email → active contractor count
router.get('/contractor-counts', async (req, res, next) => {
  try {
    const result = await getActivePlacementsWithClient();
    const placements = result?.data || [];

    // Group by clientContact email (case-insensitive)
    const countByEmail = {};
    for (const p of placements) {
      const email = p.jobOrder?.clientContact?.email;
      if (!email) continue;
      const key = email.toLowerCase();
      if (!countByEmail[key]) countByEmail[key] = 0;
      countByEmail[key]++;
    }

    res.json(countByEmail);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
