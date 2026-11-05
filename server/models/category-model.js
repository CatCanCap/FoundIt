const supabase = require('../lib/db');
const { unwrap } = require('../lib/errors');

// True if the database answers, for GET /api/health. A failure is logged
// and answered as false rather than thrown, so the health check can say 503.
exports.canReachDatabase = async function () {
  const { error } = await supabase.from('categories').select('name').limit(1);
  if (error) console.error('Health check failed:', error);
  return !error;
};

exports.findAll = async function () {
  return unwrap(await supabase.from('categories').select().order('name'));
};
