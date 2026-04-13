const express = require('express');
const router = express.Router();
const { resolveRole } = require('../lib/roles');

// GET /api/users/me — Returns the current user's profile and role
router.get('/me', async (req, res, next) => {
  try {
    const email = req.user?.email || '';
    const name = req.user?.name || '';
    const role = await resolveRole(email);

    res.json({ email, name, role });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
