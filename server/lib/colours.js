// An item's colours from a request: up to 3 names from the fixed list (the
// colours table), main colour first. No database here, so it is easy to unit
// test; the controller passes in the list.
const { httpError } = require('./errors');

const MAX_COLOURS = 3;

// body: { colours?: ['Navy', 'white'], colour?: 'Navy' }, list: [{ name }]
// Returns the names spelt the way the list spells them (['Navy', 'White']),
// [] to clear the colours, or undefined when the request says nothing about
// colour. `colours` wins over the older single `colour`, which pages still
// send until they move to the list.
function parseColours(body, list) {
  let values;
  if (body.colours !== undefined) {
    if (body.colours === null) return [];
    if (!Array.isArray(body.colours)) throw httpError(400, 'Colours must be a list of colour names');
    values = body.colours;
  } else if (body.colour !== undefined) {
    values = body.colour === null || body.colour === '' ? [] : [body.colour];
  } else {
    return undefined;
  }

  if (values.length > MAX_COLOURS) throw httpError(400, `Pick up to ${MAX_COLOURS} colours`);
  const names = values.map((value) => {
    const entry = typeof value === 'string'
      && list.find((colour) => colour.name.toLowerCase() === value.trim().toLowerCase());
    if (!entry) throw httpError(400, 'Pick a colour from the list');
    return entry.name;
  });
  if (new Set(names).size !== names.length) throw httpError(400, 'Pick each colour only once');
  return names;
}

module.exports = { parseColours, MAX_COLOURS };
