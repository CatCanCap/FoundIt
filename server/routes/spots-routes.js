const express = require('express');

const spotsController = require('../controllers/spots-controller');

const router = express.Router();

router.get('/', spotsController.getSpots);

module.exports = router;
