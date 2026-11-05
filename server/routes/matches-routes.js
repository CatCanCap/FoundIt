// OWNER: Member 3. Mounted at /api/matches
const express = require('express');

const matchesController = require('../controllers/matches-controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// The owner's Matches page: their lost reports with the finds that might be them
router.get('/mine', requireAuth, matchesController.getMine);
// "Not mine": hide a suggested match
router.post('/:id/reject', requireAuth, matchesController.rejectMatch);

module.exports = router;
