// OWNER: Member 5. Mounted at /api/messages
const express = require('express');

const messagesController = require('../controllers/messages-controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/:matchId/channel', requireAuth, messagesController.getChannel);
router.get('/:matchId', requireAuth, messagesController.getMessages);
router.post('/:matchId', requireAuth, messagesController.addMessage);

module.exports = router;
