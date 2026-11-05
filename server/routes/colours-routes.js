const express = require('express');

const coloursController = require('../controllers/colours-controller');

const router = express.Router();

router.get('/', coloursController.getColours);

module.exports = router;
