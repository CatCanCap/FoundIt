function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Fixed words for the request-body problems Express finds before any route
// runs, so the answer never repeats a piece of what was sent
const BODY_PROBLEMS = {
  'entity.parse.failed': 'The request body is not valid JSON',
  'entity.too.large': 'The request is larger than 1 MB',
};

// Express calls this for any error thrown in a route (4 parameters).
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
  if (err.type) return res.status(status).json({ error: BODY_PROBLEMS[err.type] || 'The request body could not be read' });
  res.status(status).json({ error: err.message });
}

module.exports = { notFound, errorHandler };
