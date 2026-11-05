const supabase = require('../lib/db');
const { unwrap } = require('../lib/errors');

// The fixed colour list, in the report form's order:
// [{ name, hex, related: ['Navy', ...] }]. hex is null for Clear and Multicolour.
exports.findAll = async function () {
  const rows = unwrap(await supabase.from('colours').select('name, hex, related').order('sort_order'));
  return rows.map((row) => ({ name: row.name, hex: row.hex, related: row.related || [] }));
};

// Puts the list in the database, adding new colours and updating changed
// ones (used by the seed script, from data/colours.json). Never deletes a
// colour, because items may still use it.
exports.saveAll = async function (colours) {
  const rows = colours.map((colour, index) => ({
    name: colour.name,
    hex: colour.hex || null,
    related: colour.related || [],
    sort_order: index + 1,
  }));
  unwrap(await supabase.from('colours').upsert(rows, { onConflict: 'name' }));
};
