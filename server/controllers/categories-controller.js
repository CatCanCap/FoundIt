const Category = require('../models/category-model');

exports.getCategories = async (req, res) => {
  res.json(await Category.findAll());
};
