const express = require('express');
const router = express.Router();
const {
  getActivePlacementsWithClient,
  getRecentAppointments,
  getClientCorporations,
} = require('../lib/bullhorn');

function calcHealth(placements, activities) {
  const effective = placements + Math.floor(activities / 5);
  if (effective > 3) return 'green';
  if (effective > 0) return 'yellow';
  return 'red';
}

// GET /api/client-health
router.get('/', async (req, res, next) => {
  try {
    const now = Date.now();
    const twoWeeksAgo = now - (14 * 24 * 60 * 60 * 1000);

    // Parallel queries
    const [placementsRes, appointmentsRes] = await Promise.all([
      getActivePlacementsWithClient(),
      getRecentAppointments(twoWeeksAgo),
    ]);

    const placements = placementsRes?.data || [];
    const appointments = appointmentsRes?.data || [];

    // Count placements per client
    const clientPlacements = {};
    for (const p of placements) {
      const clientId = p.jobOrder?.clientCorporation?.id;
      if (clientId) {
        clientPlacements[clientId] = (clientPlacements[clientId] || 0) + 1;
      }
    }

    // Count appointments per client (via clientContactReference or jobOrder)
    const clientActivities = {};
    for (const a of appointments) {
      const clientId =
        a.clientContactReference?.clientCorporation?.id ||
        a.jobOrder?.clientCorporation?.id;
      if (clientId) {
        clientActivities[clientId] = (clientActivities[clientId] || 0) + 1;
      }
    }

    // Collect all unique client IDs
    const allClientIds = new Set([
      ...Object.keys(clientPlacements).map(Number),
      ...Object.keys(clientActivities).map(Number),
    ]);

    if (allClientIds.size === 0) {
      return res.json({ clients: [] });
    }

    // Fetch client details with owners
    const clientsRes = await getClientCorporations([...allClientIds]);
    const clientsData = clientsRes?.data || [];

    // Build response
    const clients = clientsData.map(c => {
      const activePlacements = clientPlacements[c.id] || 0;
      const recentActivities = clientActivities[c.id] || 0;
      const effectiveScore = activePlacements + Math.floor(recentActivities / 5);
      const health = calcHealth(activePlacements, recentActivities);

      const owners = (c.owners?.data || []).map(o =>
        `${o.firstName || ''} ${o.lastName || ''}`.trim()
      ).filter(Boolean);

      return {
        id: c.id,
        name: c.name || '',
        status: c.status || '',
        owners,
        activePlacements,
        recentActivities,
        effectiveScore,
        health,
      };
    });

    // Sort: red first, then yellow, then green
    const healthOrder = { red: 0, yellow: 1, green: 2 };
    clients.sort((a, b) => healthOrder[a.health] - healthOrder[b.health]);

    const summary = {
      green: clients.filter(c => c.health === 'green').length,
      yellow: clients.filter(c => c.health === 'yellow').length,
      red: clients.filter(c => c.health === 'red').length,
      total: clients.length,
    };

    res.json({ clients, summary });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
