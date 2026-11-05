// An Error that carries the HTTP status the error middleware should send.
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Postgres error codes that mean the caller sent something wrong
const BAD_INPUT_CODES = ['23502', '23514', '22P02', '22007', '22003', '22001'];

// Turns a supabase-js result into its data, or throws an httpError.
function unwrap({ data, error }) {
  if (!error) return data;
  if (error.code === '23505') throw httpError(409, 'Already exists');
  if (error.code === '23503') throw httpError(400, 'Refers to something that does not exist');
  if (BAD_INPUT_CODES.includes(error.code)) throw httpError(400, 'Invalid value');
  console.error('Database error:', error);
  throw httpError(500, 'Database error');
}

module.exports = { httpError, unwrap };
