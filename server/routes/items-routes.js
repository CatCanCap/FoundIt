const express = require('express');

const itemsController = require('../controllers/items-controller');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// optionalAuth: the owner and admins see a lost item's photo, and only you
// may list your own reports with ?postedBy
router.get('/', optionalAuth, itemsController.getItems);
router.get('/:id', optionalAuth, itemsController.getItem);
router.get('/:id/record', optionalAuth, itemsController.getItemRecord);
router.get('/:id/matches', requireAuth, itemsController.getItemMatches);
router.post('/', requireAuth, itemsController.addItem);
router.patch('/:id', requireAuth, itemsController.editItem);
router.delete('/:id', requireAuth, itemsController.deleteItem);

module.exports = router;
