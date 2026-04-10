const express = require('express');
const router = express.Router();
const { getActivePlacementsWithClient } = require('../lib/bullhorn');

// Supabase client for reading employees
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// GET /api/org-flow/contractor-counts
// Returns a map of clientContact email → active contractor count
router.get('/contractor-counts', async (req, res, next) => {
  try {
    const result = await getActivePlacementsWithClient();
    const placements = result?.data || [];

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

// GET /api/org-flow/client-health
// Returns per-client healthy manager percentage
router.get('/client-health', async (req, res, next) => {
  try {
    if (!supabase) return res.json({});

    // Fetch all employees and contractor counts in parallel
    const [employeesRes, placementsResult] = await Promise.all([
      supabase.from('employees').select('id,client_id,name,role,email,num_ftes,num_contractors,reports_to_id'),
      getActivePlacementsWithClient(),
    ]);

    const employees = employeesRes?.data || [];
    const placements = placementsResult?.data || [];

    // Build live contractor counts by email
    const liveCountByEmail = {};
    for (const p of placements) {
      const email = p.jobOrder?.clientContact?.email;
      if (!email) continue;
      const key = email.toLowerCase();
      if (!liveCountByEmail[key]) liveCountByEmail[key] = 0;
      liveCountByEmail[key]++;
    }

    // Build set of employee IDs that have direct reports
    const hasDirectReports = new Set();
    for (const emp of employees) {
      if (emp.reports_to_id) {
        hasDirectReports.add(emp.reports_to_id);
      }
    }

    // Group employees by client and calculate per-client stats
    const clientStats = {};
    // Build name lookup for reports-to
    const nameMap = {};
    for (const emp of employees) {
      nameMap[emp.id] = emp.name || `Employee ${emp.id}`;
    }

    for (const emp of employees) {
      const cid = emp.client_id;
      if (!clientStats[cid]) clientStats[cid] = { totalManagers: 0, healthyManagers: 0, managers: [] };

      const liveContractors = emp.email ? (liveCountByEmail[emp.email.toLowerCase()] || 0) : 0;
      const hasFtes = (emp.num_ftes || 0) > 0;
      const hasContractors = (emp.num_contractors || 0) > 0;
      const hasReports = hasDirectReports.has(emp.id);
      const hasLiveContractors = liveContractors > 0;

      // Is this a people manager?
      const isPeopleManager = hasReports || hasFtes || hasContractors || hasLiveContractors;
      if (!isPeopleManager) continue;

      clientStats[cid].totalManagers++;
      if (hasLiveContractors) {
        clientStats[cid].healthyManagers++;
      }

      clientStats[cid].managers.push({
        name: emp.name || '',
        role: emp.role || '',
        email: emp.email || '',
        healthy: hasLiveContractors,
        activeContractors: liveContractors,
        ftes: emp.num_ftes || 0,
        contractors: emp.num_contractors || 0,
        directReports: hasReports,
      });
    }

    // Build response: clientId → percentage + manager details
    const result = {};
    for (const [cid, stats] of Object.entries(clientStats)) {
      // Sort: unhealthy first, then by name
      stats.managers.sort((a, b) => {
        if (a.healthy !== b.healthy) return a.healthy ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
      result[cid] = {
        totalManagers: stats.totalManagers,
        healthyManagers: stats.healthyManagers,
        percentage: stats.totalManagers > 0 ? Math.round((stats.healthyManagers / stats.totalManagers) * 100) : 0,
        managers: stats.managers,
      };
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
