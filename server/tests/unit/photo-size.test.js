import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { MAX_PHOTO_BYTES, checkPhotoSize, optionalOurPhoto } = require('../../lib/photo-size')

const PHOTO = 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg'

// What Cloudinary answers to a HEAD request
function answer(status, bytes) {
  const headers = new Headers(bytes === undefined ? {} : { 'content-length': String(bytes) })
  return { ok: status >= 200 && status < 300, status, headers }
}

describe('checkPhotoSize', () => {
  beforeEach(() => {
    // The check is skipped under Vitest, like email, so switch that off here
    vi.stubEnv('VITEST', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('accepts a photo of up to 10 MB, asking with a HEAD request', async () => {
    const fetch = vi.fn(async () => answer(200, MAX_PHOTO_BYTES))
    vi.stubGlobal('fetch', fetch)
    await expect(checkPhotoSize(PHOTO)).resolves.toBeUndefined()
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe(PHOTO)
    expect(options.method).toBe('HEAD')
  })

  it('refuses a photo over 10 MB', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer(200, MAX_PHOTO_BYTES + 1)))
    await expect(checkPhotoSize(PHOTO, 'Proof')).rejects.toMatchObject({
      status: 400,
      message: 'The proof is larger than 10 MB. Choose a smaller photo.',
    })
  })

  it('refuses a photo that is not on Cloudinary', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer(404)))
    await expect(checkPhotoSize(PHOTO)).rejects.toMatchObject({
      status: 400,
      message: 'The photo could not be found. Please upload it again.',
    })
  })

  it('refuses a photo whose size cannot be checked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer(200)))
    await expect(checkPhotoSize(PHOTO)).rejects.toMatchObject({ status: 400 })

    vi.stubGlobal('fetch', vi.fn(async () => answer(500, 100)))
    await expect(checkPhotoSize(PHOTO)).rejects.toMatchObject({ status: 400 })

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('timeout'))))
    await expect(checkPhotoSize(PHOTO)).rejects.toMatchObject({
      status: 400,
      message: 'We could not check the size of the photo. Please try again.',
    })
  })

  it('makes no request while the tests run', async () => {
    vi.unstubAllEnvs()
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await checkPhotoSize(PHOTO)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('optionalOurPhoto', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns null for no photo without asking Cloudinary', async () => {
    vi.stubEnv('VITEST', '')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(optionalOurPhoto('')).resolves.toBeNull()
    await expect(optionalOurPhoto(undefined)).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('still refuses links that are not our Cloudinary photos', async () => {
    await expect(optionalOurPhoto('https://example.com/a.jpg')).rejects.toMatchObject({ status: 400 })
  })

  it('checks the size and names the field in the message', async () => {
    vi.stubEnv('VITEST', '')
    vi.stubGlobal('fetch', vi.fn(async () => answer(200, MAX_PHOTO_BYTES * 2)))
    await expect(optionalOurPhoto(PHOTO, 'Proof link')).rejects.toMatchObject({
      message: 'The proof is larger than 10 MB. Choose a smaller photo.',
    })
    vi.stubGlobal('fetch', vi.fn(async () => answer(200, 2048)))
    await expect(optionalOurPhoto(` ${PHOTO} `, 'Photo link')).resolves.toBe(PHOTO)
  })
})
