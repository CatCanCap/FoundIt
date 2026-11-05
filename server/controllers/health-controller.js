const Category = require('../models/category-model');

// GET /api/health, which also proves the database is reachable
exports.getHealth = async (req, res) => {
  if (!(await Category.canReachDatabase())) {
    return res.status(503).json({ status: 'error', database: 'unreachable' });
  }
  res.json({ status: 'ok', database: 'ok' });
};
