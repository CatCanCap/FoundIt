// OWNER: Member 2 (WS2). The only place the app calls Google Cloud Vision.
// The key (GOOGLE_VISION_API_KEY) stays on the server; the browser never sees it.
const { httpError } = require('../lib/errors');

const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const TIMEOUT_MS = 10000;

function isVisionEnabled() {
  return Boolean(process.env.GOOGLE_VISION_API_KEY);
}

// True only for photos uploaded to our own Cloudinary account, so nobody can
// use our Vision allowance on other pictures. The account name comes after
// res.cloudinary.com/ and must match CLOUDINARY_CLOUD_NAME. While that
// setting is empty, any Cloudinary photo is accepted.
function isCloudinaryPhoto(url) {
  if (typeof url !== 'string' || url.length > 500) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const path = parsed.pathname.match(/^\/([^/]+)\/image\/upload\//);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com' || !path) {
    return false;
  }
  const ourCloud = process.env.CLOUDINARY_CLOUD_NAME;
  return !ourCloud || path[1] === ourCloud;
}

// A copy at most 800px wide, which is enough for Vision and quicker to fetch
function visionCopy(url) {
  return url.replace('/image/upload/', '/image/upload/c_limit,w_800/');
}

// Asks Vision what is in the photo. Returns its answer, or throws a 502 error
// if Vision can't be reached or can't read the photo.
async function annotatePhoto(url) {
  let response;
  try {
    response = await fetch(VISION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The key goes in a header so it never shows up in logs
        'X-Goog-Api-Key': process.env.GOOGLE_VISION_API_KEY,
      },
      body: JSON.stringify({
        requests: [
          {
            image: { source: { imageUri: visionCopy(url) } },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 15 },
              { type: 'OBJECT_LOCALIZATION', maxResults: 5 },
              { type: 'LOGO_DETECTION', maxResults: 3 },
              { type: 'IMAGE_PROPERTIES' },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error('Vision request failed:', error.message);
    throw httpError(502, 'Could not read the photo');
  }

  const body = await response.json().catch(() => ({}));
  const result = body.responses?.[0];
  if (!response.ok || !result || result.error) {
    console.error('Vision error:', response.status, body.error?.message || result?.error?.message);
    throw httpError(502, 'Could not read the photo');
  }
  return result;
}

module.exports = { isVisionEnabled, isCloudinaryPhoto, visionCopy, annotatePhoto };
