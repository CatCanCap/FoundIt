// Mounted at /api/stats
const express = require('express');

const statsController = require('../controllers/stats-controller');

const router = express.Router();

// Read-only campus figures, so no login needed (like GET /api/items)
router.get('/hotspots', statsController.getHotspots);

module.exports = router;
