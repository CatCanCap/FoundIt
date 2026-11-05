const Colour = require('../models/colour-model');

// The fixed colour list (the colours table) for the report forms' swatches:
// [{ name, hex, related }]. An item can have up to 3 of these. The hex codes
// let the form turn a colour the vision API reads from a photo into a name on
// the list.
exports.getColours = async (req, res) => {
  res.json(await Colour.findAll());
};
