// OWNER: Member 1. Mounted at /api/reports (feature 5c, report a message or a post)
const express = require('express');

const reportsController = require('../controllers/reports-controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, reportsController.addReport);

module.exports = router;
