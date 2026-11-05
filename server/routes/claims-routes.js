// OWNER: Member 5. Mounted at /api/claims
const express = require('express');

const claimsController = require('../controllers/claims-controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Before /:matchId, so "mine" is not read as a match id
router.get('/mine', requireAuth, claimsController.getMine);
router.get('/:matchId', requireAuth, claimsController.getClaim);
router.post('/:matchId', requireAuth, claimsController.addClaim);
router.post('/:matchId/decline', requireAuth, claimsController.declineClaim);

module.exports = router;
