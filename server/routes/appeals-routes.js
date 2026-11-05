// OWNER: Member 1. Mounted at /api/appeals (feature 5, appealing a suspension)
const express = require('express');
const appealsController = require('../controllers/appeals-controller');
const { requireAuth, requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/mine', requireAuth, appealsController.getMine);
// requireLogin: a suspended account may send this one thing
router.post('/', requireLogin, appealsController.addAppeal);

module.exports = router;
