const Spot = require('../models/spot-model');

exports.getSpots = async (req, res) => {
  res.json(await Spot.findAll());
};
