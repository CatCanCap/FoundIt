const supabase = require('../lib/db');
const { toCamel } = require('../lib/case');
const { unwrap } = require('../lib/errors');

// The bookable rooms from SMU's booking system, e.g. "LKCSB Seminar Room 3-2".
// Each room is in one spot (a building, level and area); GET /api/spots lists
// them under their spot.
const TABLE = 'campus_rooms';

// The rooms with these ids, as [{ id, spotId, name, position }] in any order.
// Ids that do not exist are left out.
exports.findByIds = async function (ids) {
  if (ids.length === 0) return [];
  return unwrap(await supabase.from(TABLE).select().in('id', ids)).map(toCamel);
};
