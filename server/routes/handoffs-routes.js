// OWNER: Member 5. Mounted at /api/handoffs
const express = require('express');

const handoffsController = require('../controllers/handoffs-controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/collection-points', handoffsController.getCollectionPoints);
router.get('/match/:matchId', requireAuth, handoffsController.getHandoff);
router.get('/match/:matchId/summary', requireAuth, handoffsController.getSummary);
router.post('/', requireAuth, handoffsController.addHandoff);
router.patch('/:id', requireAuth, handoffsController.editHandoff);
router.post('/:id/handed-over', requireAuth, handoffsController.markHandedOver);
router.post('/:id/confirm', requireAuth, handoffsController.confirm);

module.exports = router;
