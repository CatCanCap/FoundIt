const express = require('express');

const cronController = require('../controllers/cron-controller');

const router = express.Router();

router.get('/daily', cronController.runDaily);

module.exports = router;
