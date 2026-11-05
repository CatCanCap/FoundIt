// The database uses snake_case column names; the API uses camelCase.
// Both functions convert only the top-level keys of one object.

function toCamel(row) {
  if (row === null || row === undefined) return null;
  const result = {};
  for (const key of Object.keys(row)) {
    const camelKey = key.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
    result[camelKey] = row[key];
  }
  return result;
}

function toSnake(object) {
  const result = {};
  for (const key of Object.keys(object)) {
    if (object[key] === undefined) continue;
    const snakeKey = key.replace(/[A-Z]/g, (letter) => '_' + letter.toLowerCase());
    result[snakeKey] = object[key];
  }
  return result;
}

module.exports = { toCamel, toSnake };
