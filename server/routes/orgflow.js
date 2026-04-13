const express = require('express');
const router = express.Router();
const { getActivePlacementsWithClient } = require('../lib/bullhorn');

// Supabase client for reading employees
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// GET /api/org-flow/contractor-counts
// Returns a map of clientContact email → { contractors, permPlacements, placements[] }
router.get('/contractor-counts', async (req, res, next) => {
  try {
    const result = await getActivePlacementsWithClient();
    const placements = result?.data || [];

    const dataByEmail = {};
    for (const p of placements) {
      const email = p.jobOrder?.clientContact?.email;
      if (!email) continue;
      const key = email.toLowerCase();
      if (!dataByEmail[key]) dataByEmail[key] = { contractors: 0, permPlacements: 0, placements: [] };

      const empType = (p.employeeType || '').toLowerCase();
      const isPerm = empType === 'perm';
      const candidateName = p.candidate
        ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim()
        : 'Unknown';

      if (isPerm) {
        dataByEmail[key].permPlacements++;
      } else {
        dataByEmail[key].contractors++;
      }

      dataByEmail[key].placements.push({
        id: p.id,
        candidateId: p.candidate?.id || null,
        candidateName,
        type: isPerm ? 'perm' : 'contractor',
        jobTitle: p.jobOrder?.title || '',
      });
    }

    res.json(dataByEmail);
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

    // Build live counts by email, split by type
    const liveCountByEmail = {};
    for (const p of placements) {
      const email = p.jobOrder?.clientContact?.email;
      if (!email) continue;
      const key = email.toLowerCase();
      if (!liveCountByEmail[key]) liveCountByEmail[key] = { contractors: 0, permPlacements: 0, total: 0 };

      const empType = (p.employeeType || '').toLowerCase();
      if (empType === 'perm') {
        liveCountByEmail[key].permPlacements++;
      } else {
        liveCountByEmail[key].contractors++;
      }
      liveCountByEmail[key].total++;
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
    const nameMap = {};
    for (const emp of employees) {
      nameMap[emp.id] = emp.name || `Employee ${emp.id}`;
    }

    for (const emp of employees) {
      const cid = emp.client_id;
      if (!clientStats[cid]) clientStats[cid] = { totalManagers: 0, healthyManagers: 0, managers: [], totalAllies: 0 };

      const counts = emp.email ? (liveCountByEmail[emp.email.toLowerCase()] || { contractors: 0, permPlacements: 0, total: 0 }) : { contractors: 0, permPlacements: 0, total: 0 };
      const hasFtes = (emp.num_ftes || 0) > 0;
      const hasContractors = (emp.num_contractors || 0) > 0;
      const hasReports = hasDirectReports.has(emp.id);
      const hasLivePlacements = counts.total > 0;

      // Accumulate allies for this client
      clientStats[cid].totalAllies += counts.total;

      // Is this a people manager?
      const isPeopleManager = hasReports || hasFtes || hasContractors || hasLivePlacements;
      if (!isPeopleManager) continue;

      clientStats[cid].totalManagers++;
      if (hasLivePlacements) {
        clientStats[cid].healthyManagers++;
      }

      clientStats[cid].managers.push({
        name: emp.name || '',
        role: emp.role || '',
        email: emp.email || '',
        healthy: hasLivePlacements,
        activeContractors: counts.contractors,
        activePerm: counts.permPlacements,
        ftes: emp.num_ftes || 0,
        contractors: emp.num_contractors || 0,
        directReports: hasReports,
      });
    }

    // Build response: clientId → percentage + manager details
    const result = {};
    for (const [cid, stats] of Object.entries(clientStats)) {
      stats.managers.sort((a, b) => {
        if (a.healthy !== b.healthy) return a.healthy ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
      result[cid] = {
        totalManagers: stats.totalManagers,
        healthyManagers: stats.healthyManagers,
        percentage: stats.totalManagers > 0 ? Math.round((stats.healthyManagers / stats.totalManagers) * 100) : 0,
        managers: stats.managers,
        totalAllies: stats.totalAllies,
      };
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
