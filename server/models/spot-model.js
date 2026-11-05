const supabase = require('../lib/db');
const { toCamel } = require('../lib/case');
const { unwrap } = require('../lib/errors');

const TABLE = 'campus_spots';
// Each spot with its bookable rooms (campus_rooms), if it has any
const SELECT = '*, rooms:campus_rooms(id, name, position)';

// The API shows lat and lng as coordinates: { lat, lng }, and the rooms as
// [{ id, name }] in room-number order
function fromRow(row) {
  if (!row) return null;
  const { lat, lng, rooms, ...rest } = toCamel(row);
  return {
    ...rest,
    coordinates: { lat, lng },
    rooms: (rooms || [])
      .sort((a, b) => a.position - b.position)
      .map((room) => ({ id: room.id, name: room.name })),
  };
}

// In list order (position: on each level the lobby, food, rooms, study areas,
// toilets and lifts), so the report forms show the places in that order
exports.findAll = async function () {
  return unwrap(await supabase.from(TABLE).select(SELECT).order('position').order('id')).map(fromRow);
};

exports.findById = async function (id) {
  return fromRow(unwrap(await supabase.from(TABLE).select(SELECT).eq('id', id).maybeSingle()));
};

exports.findCollectionPoints = async function () {
  const result = await supabase.from(TABLE).select(SELECT).eq('is_collection_point', true)
    .order('position').order('id');
  return unwrap(result).map(fromRow);
};
