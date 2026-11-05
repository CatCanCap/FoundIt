// OWNER: Member 1. Mounted at /api/disputes (feature 5a, "This is my item")
const express = require('express');

const disputesController = require('../controllers/disputes-controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/mine', requireAuth, disputesController.getMyDisputes);
router.get('/on-my-claims', requireAuth, disputesController.getDisputesOnMyClaims);
router.post('/', requireAuth, disputesController.addDispute);
router.post('/:id/respond', requireAuth, disputesController.respond);
router.post('/:id/withdraw', requireAuth, disputesController.withdrawClaim);

module.exports = router;
