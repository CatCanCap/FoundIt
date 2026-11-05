import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  MAX_PHOTO_BYTES,
  isPhotoUploadEnabled,
  checkPhoto,
  uploadPhoto,
  resizedPhotoUrl,
  UPLOAD_TIMEOUT_MS,
} from '../cloudinary'

// The network is always mocked: tests never reach Cloudinary
let fetchMock

function photo(type = 'image/jpeg', size = 2000, name = 'umbrella.jpg') {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'foundit-demo')
  vi.stubEnv('VITE_CLOUDINARY_UPLOAD_PRESET', 'foundit_unsigned')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('isPhotoUploadEnabled', () => {
  it('needs both settings', () => {
    expect(isPhotoUploadEnabled()).toBe(true)
    vi.stubEnv('VITE_CLOUDINARY_UPLOAD_PRESET', '')
    expect(isPhotoUploadEnabled()).toBe(false)
  })
})

describe('checkPhoto', () => {
  it('accepts common phone photo types', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) {
      expect(checkPhoto(photo(type))).toBeNull()
    }
  })

  it('checks the name when the browser gives the file no type', () => {
    expect(checkPhoto(photo('', 2000, 'IMG_0042.HEIC'))).toBeNull()
    expect(checkPhoto(photo('', 2000, 'umbrella.heif'))).toBeNull()
    expect(checkPhoto(photo('', 2000, 'notes.pdf'))).toBe('Choose a JPG, PNG, WebP or HEIC photo.')
  })

  it('refuses other files and photos over 10 MB', () => {
    expect(checkPhoto(null)).toBe('Choose a photo.')
    expect(checkPhoto(photo('application/pdf'))).toBe('Choose a JPG, PNG, WebP or HEIC photo.')
    expect(checkPhoto(photo('image/gif'))).toBe('Choose a JPG, PNG, WebP or HEIC photo.')
    expect(checkPhoto(photo('image/jpeg', MAX_PHOTO_BYTES + 1))).toBe(
      'Choose a photo smaller than 10 MB.',
    )
  })
})

describe('uploadPhoto', () => {
  it('posts the file with the unsigned preset and returns the https link', async () => {
    fetchMock.mockResolvedValue(
      reply(200, { secure_url: 'https://res.cloudinary.com/foundit-demo/image/upload/v1/a.jpg' }),
    )
    const file = photo()

    const url = await uploadPhoto(file)
    expect(url).toBe('https://res.cloudinary.com/foundit-demo/image/upload/v1/a.jpg')

    const [endpoint, options] = fetchMock.mock.calls[0]
    expect(endpoint).toBe('https://api.cloudinary.com/v1_1/foundit-demo/image/upload')
    expect(options.method).toBe('POST')
    expect(options.body.get('file')).toBe(file)
    expect(options.body.get('upload_preset')).toBe('foundit_unsigned')
    // Our login token must never be sent to Cloudinary
    expect(options.headers).toBeUndefined()
  })

  it('checks the file before uploading anything', async () => {
    await expect(uploadPhoto(photo('application/pdf'))).rejects.toThrow('Choose a JPG')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses when the settings are missing', async () => {
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', '')
    await expect(uploadPhoto(photo())).rejects.toThrow('Photo upload is not set up yet.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gives a friendly message when Cloudinary refuses the file', async () => {
    fetchMock.mockResolvedValue(reply(400, { error: { message: 'Upload preset not found' } }))
    await expect(uploadPhoto(photo())).rejects.toThrow(
      'Could not upload the photo. Please try another one.',
    )
  })

  it('gives a friendly message when the network fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(uploadPhoto(photo())).rejects.toThrow('Check your connection')
  })

  it('refuses a link that is not https', async () => {
    fetchMock.mockResolvedValue(reply(200, { secure_url: 'http://example.com/a.jpg' }))
    await expect(uploadPhoto(photo())).rejects.toThrow('Could not upload the photo')
  })

  it('lets a cancelled upload through as an AbortError', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    fetchMock.mockRejectedValue(abort)
    const controller = new AbortController()
    await expect(uploadPhoto(photo(), { signal: controller.signal })).rejects.toBe(abort)
    // The form's signal and the time limit both reach the upload
    const sent = fetchMock.mock.calls[0][1].signal
    expect(sent.aborted).toBe(false)
    controller.abort()
    expect(sent.aborted).toBe(true)
  })

  it('gives up on an upload that stalls, with a message the form can show', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockImplementation(
        (url, { signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener('abort', () =>
              reject(new DOMException('The operation timed out.', 'TimeoutError')),
            )
          }),
      )
      const upload = uploadPhoto(photo()).catch((error) => error)
      await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS)
      const error = await upload
      expect(error.message).toMatch('took too long')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('resizedPhotoUrl', () => {
  it('asks Cloudinary for a smaller copy', () => {
    expect(
      resizedPhotoUrl('https://res.cloudinary.com/foundit-demo/image/upload/v1/a.jpg', 600),
    ).toBe(
      'https://res.cloudinary.com/foundit-demo/image/upload/c_limit,w_600,q_auto,f_auto/v1/a.jpg',
    )
  })

  it('leaves other links alone', () => {
    expect(resizedPhotoUrl('https://example.com/a.jpg', 600)).toBe('https://example.com/a.jpg')
    expect(resizedPhotoUrl(null, 600)).toBeNull()
  })
})
