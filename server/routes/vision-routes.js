// OWNER: Member 2 (WS2)
const express = require('express');

const visionController = require('../controllers/vision-controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Signed-in users only, so strangers can't use up our free Vision allowance
router.post('/suggest', requireAuth, visionController.suggest);

module.exports = router;
