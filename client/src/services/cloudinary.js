// Photo upload. The browser sends the photo straight to Cloudinary, and only
// the link goes to our API (which takes at most 1 MB per request).
//
// Settings in client/.env.local (see client/.env.example):
//   VITE_CLOUDINARY_CLOUD_NAME     our Cloudinary account name
//   VITE_CLOUDINARY_UPLOAD_PRESET  an unsigned upload preset
// Never put the Cloudinary API secret here.

// 10 MB, the most Cloudinary's free plan takes per photo. The server checks
// the same limit before it saves a photo link (server/lib/photo-size.js).
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024
// Shown in every photo drop box, so people know the limit before they pick
export const PHOTO_HINT = 'JPG, PNG, WebP or HEIC, up to 10 MB.'
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
// Some browsers give a file no type (often iPhone HEIC photos on a laptop), so
// then the name's ending is checked instead
const PHOTO_ENDINGS = /\.(jpe?g|png|webp|heic|heif)$/i

// True when the file is one of the photo types above
function isPhotoFile(file) {
  if (file.type) return PHOTO_TYPES.includes(file.type)
  return PHOTO_ENDINGS.test(file.name || '')
}

function settings() {
  return {
    cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
    uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET,
  }
}

// Photo upload works only when both settings are filled in
export function isPhotoUploadEnabled() {
  const { cloudName, uploadPreset } = settings()
  return Boolean(cloudName && uploadPreset)
}

// Returns a message to show, or null if the file can be uploaded
export function checkPhoto(file) {
  if (!file) return 'Choose a photo.'
  if (!isPhotoFile(file)) return 'Choose a JPG, PNG, WebP or HEIC photo.'
  if (file.size > MAX_PHOTO_BYTES) return 'Choose a photo smaller than 10 MB.'
  return null
}

// Uploads the photo and returns its link. If it fails, the error's message
// can be shown to the user. The signal lets the form cancel an upload.
// How long one upload may take
export const UPLOAD_TIMEOUT_MS = 60000

export async function uploadPhoto(file, { signal } = {}) {
  const problem = checkPhoto(file)
  if (problem) throw new Error(problem)
  if (!isPhotoUploadEnabled()) throw new Error('Photo upload is not set up yet.')

  const { cloudName, uploadPreset } = settings()
  const body = new FormData()
  body.append('file', file)
  body.append('upload_preset', uploadPreset)

  // A stalled upload (a weak phone signal) gives up after a minute, so the
  // form's button never stays disabled for good
  const timer = new AbortController()
  const stopTimer = setTimeout(() => timer.abort(), UPLOAD_TIMEOUT_MS)
  const timeout = timer.signal
  let response
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
      { method: 'POST', body, signal: signal ? AbortSignal.any([signal, timeout]) : timeout },
    )
  } catch (error) {
    // Cancelled by the form: pass it on as it is
    if (error.name === 'AbortError' && !timeout.aborted) throw error
    if (timeout.aborted) {
      throw new Error('The photo took too long to upload. Check your connection and try again.', {
        cause: error,
      })
    }
    // `cause` keeps the original error, for debugging
    throw new Error('Could not upload the photo. Check your connection and try again.', {
      cause: error,
    })
  } finally {
    clearTimeout(stopTimer)
  }

  // An empty object if the answer isn't JSON
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    console.error('Cloudinary upload failed:', response.status, data.error?.message)
    throw new Error('Could not upload the photo. Please try another one.')
  }
  // The API only accepts https links
  if (typeof data.secure_url !== 'string' || !data.secure_url.startsWith('https://')) {
    throw new Error('Could not upload the photo. Please try again.')
  }
  return data.secure_url
}

// A smaller copy of a Cloudinary photo, for cards and previews. Other links
// are returned as they are.
export function resizedPhotoUrl(url, width) {
  if (typeof url !== 'string' || !url.startsWith('https://res.cloudinary.com/')) return url
  return url.replace('/image/upload/', `/image/upload/c_limit,w_${width},q_auto,f_auto/`)
}
