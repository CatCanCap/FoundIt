const { httpError } = require('./errors');

// Ids arrive as text in URLs and query strings.
function parseId(value) {
  const text = String(value ?? '');
  if (!/^[1-9]\d{0,14}$/.test(text)) throw httpError(400, 'Invalid id');
  return Number(text);
}

function isNonEmptyString(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

// A full date and time WITH a timezone, e.g. 2026-10-09T14:00:00+08:00 or
// 2026-10-09T06:00:00Z. Without a timezone the same text would mean different
// moments on a laptop in Singapore and on the server.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

function parseDate(value) {
  if (typeof value !== 'string' || !ISO_WITH_ZONE.test(value)) {
    throw httpError(400, 'Dates must look like 2026-10-09T14:00:00+08:00 (include the timezone)');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw httpError(400, 'Invalid date');
  return date;
}

// An optional https:// link (for example a photo uploaded to Cloudinary).
// Returns null when empty. Links are shown in the browser, so only https is allowed.
function optionalHttpsUrl(value, label = 'Link') {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 500) throw httpError(400, `${label} is not valid`);
  let url;
  try {
    url = new URL(value.trim());
  } catch (error) {
    throw httpError(400, `${label} is not valid`);
  }
  if (url.protocol !== 'https:') throw httpError(400, `${label} must start with https://`);
  return value.trim();
}

// An optional photo uploaded to our Cloudinary account by the report or
// dispute form, e.g. https://res.cloudinary.com/<account>/image/upload/....
// Any other link is refused: every visitor's browser loads these photos, so a
// link to someone else's server would tell that server who looked, and the
// picture could be swapped after posting. The account name must match
// CLOUDINARY_CLOUD_NAME; while that setting is empty, any Cloudinary photo is
// accepted. Returns null when empty.
function optionalOurPhotoUrl(value, label = 'Photo link') {
  const link = optionalHttpsUrl(value, label);
  if (link === null) return null;
  const url = new URL(link);
  const path = url.pathname.match(/^\/([^/]+)\/image\/upload\//);
  const ourCloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (url.hostname !== 'res.cloudinary.com' || !path || (ourCloud && path[1] !== ourCloud)) {
    throw httpError(400, `${label} must be a photo uploaded through FoundIt`);
  }
  return link;
}

module.exports = { parseId, isNonEmptyString, parseDate, optionalHttpsUrl, optionalOurPhotoUrl };
