// The 10 MB limit on photos. The browser uploads a photo straight to
// Cloudinary and only sends us the link, so the server never sees the file
// itself. Instead, before a link is saved, we ask Cloudinary how big the photo
// is (a HEAD request returns its size without downloading it) and refuse
// anything over the limit. The forms check the same limit before uploading
// (client/src/services/cloudinary.js), so this only catches a photo that got
// past them.
const { httpError } = require('./errors');
const { optionalOurPhotoUrl } = require('./validate');

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 5000;

// Throws a 400 error unless the photo at `link` exists and is at most 10 MB.
// The limit is strict: a photo whose size can't be checked is refused too.
// Tests skip the request, as they do for email.
async function checkPhotoSize(link, label = 'Photo') {
  if (process.env.VITEST) return;

  let response;
  try {
    response = await fetch(link, { method: 'HEAD', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    console.error('Photo size check failed:', error.message);
    throw httpError(400, `We could not check the size of the ${label.toLowerCase()}. Please try again.`);
  }
  if (response.status === 404) {
    throw httpError(400, `The ${label.toLowerCase()} could not be found. Please upload it again.`);
  }
  const bytes = Number(response.headers.get('content-length'));
  if (!response.ok || !Number.isFinite(bytes) || bytes <= 0) {
    console.error('Photo size check failed:', response.status);
    throw httpError(400, `We could not check the size of the ${label.toLowerCase()}. Please try again.`);
  }
  if (bytes > MAX_PHOTO_BYTES) {
    throw httpError(400, `The ${label.toLowerCase()} is larger than 10 MB. Choose a smaller photo.`);
  }
}

// optionalOurPhotoUrl (lib/validate.js) plus the size check. Use this for
// every photo link a request saves. Returns the link, or null when empty.
async function optionalOurPhoto(value, label = 'Photo link') {
  const link = optionalOurPhotoUrl(value, label);
  if (link !== null) await checkPhotoSize(link, label.replace(/ link$/, ''));
  return link;
}

module.exports = { MAX_PHOTO_BYTES, checkPhotoSize, optionalOurPhoto };
