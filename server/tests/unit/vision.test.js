import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { suggestTags, nearestColourName, labelHasWord } = require('../../vision/suggest')
const { isCloudinaryPhoto, visionCopy, annotatePhoto } = require('../../vision/google')
const colours = require('../../data/colours.json')
const categories = require('../../data/categories.json')

const lists = { categories, colours }
const rgb = (red, green, blue) => ({ red, green, blue })

describe('labelHasWord', () => {
  it('matches whole words only', () => {
    expect(labelHasWord('plastic bottle', 'bottle')).toBe(true)
    expect(labelHasWord('keyboard', 'key')).toBe(false)
    expect(labelHasWord('t-shirt', 'shirt')).toBe(true)
  })
})

describe('suggestTags: category', () => {
  it('picks the category of the strongest matching label or object', () => {
    const { category } = suggestTags(
      {
        labelAnnotations: [
          { description: 'Drinkware', score: 0.9 },
          { description: 'Blue', score: 0.95 },
        ],
        localizedObjectAnnotations: [{ name: 'Bottle', score: 0.96 }],
      },
      lists,
    )
    expect(category).toEqual({ value: 'Water Bottle', confidence: 96 })
  })

  it('ignores weak labels and categories that are not on our list', () => {
    expect(
      suggestTags({ labelAnnotations: [{ description: 'Umbrella', score: 0.4 }] }, lists).category,
    ).toBeNull()
    const onlyBags = { categories: [{ name: 'Bag' }], colours }
    expect(
      suggestTags({ labelAnnotations: [{ description: 'Umbrella', score: 0.9 }] }, onlyBags)
        .category,
    ).toBeNull()
  })

  it('returns nothing when Vision found nothing', () => {
    expect(suggestTags({}, lists)).toEqual({ category: null, colour: null, brand: null })
  })
})

describe('suggestTags: colour', () => {
  it('turns the main colours into the nearest name on the list', () => {
    expect(nearestColourName(rgb(30, 40, 90), colours)).toBe('Navy')
    expect(nearestColourName(rgb(200, 30, 40), colours)).toBe('Red')
  })

  it('adds up colours that land on the same name, and gives its share', () => {
    const { colour } = suggestTags(
      {
        imagePropertiesAnnotation: {
          dominantColors: {
            colors: [
              { color: rgb(31, 42, 90), score: 0.5 },
              { color: rgb(25, 35, 85), score: 0.3 },
              { color: rgb(245, 245, 245), score: 0.2 },
            ],
          },
        },
      },
      lists,
    )
    expect(colour).toEqual({ value: 'Navy', confidence: 80 })
  })

  it('never suggests Clear or Multicolour', () => {
    const names = colours.filter((c) => c.hex).map((c) => c.name)
    expect(names).not.toContain('Clear')
    expect(names).toContain(nearestColourName(rgb(128, 128, 128), colours))
  })
})

describe('suggestTags: brand', () => {
  it('uses the logo Vision is most sure about', () => {
    const { brand } = suggestTags(
      {
        logoAnnotations: [
          { description: 'Nike', score: 0.4 },
          { description: 'Hydro Flask', score: 0.61 },
        ],
      },
      lists,
    )
    expect(brand).toEqual({ value: 'Hydro Flask', confidence: 61 })
  })

  it('skips a weak logo', () => {
    expect(suggestTags({ logoAnnotations: [{ description: 'Nike', score: 0.2 }] }, lists).brand).toBeNull()
  })
})

describe('isCloudinaryPhoto', () => {
  // Each test sets the cloud name itself, whatever a teammate's shell has
  const before = process.env.CLOUDINARY_CLOUD_NAME
  beforeEach(() => {
    delete process.env.CLOUDINARY_CLOUD_NAME
  })
  afterEach(() => {
    if (before === undefined) delete process.env.CLOUDINARY_CLOUD_NAME
    else process.env.CLOUDINARY_CLOUD_NAME = before
  })

  it('accepts only photos uploaded to Cloudinary', () => {
    expect(isCloudinaryPhoto('https://res.cloudinary.com/demo/image/upload/v1/a.jpg')).toBe(true)
    expect(isCloudinaryPhoto('http://res.cloudinary.com/demo/image/upload/v1/a.jpg')).toBe(false)
    expect(isCloudinaryPhoto('https://example.com/demo/image/upload/a.jpg')).toBe(false)
    expect(isCloudinaryPhoto('https://res.cloudinary.com/demo/video/upload/a.mp4')).toBe(false)
    expect(isCloudinaryPhoto(42)).toBe(false)
  })

  it('accepts only our own Cloudinary account once CLOUDINARY_CLOUD_NAME is set', () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'foundit'
    expect(isCloudinaryPhoto('https://res.cloudinary.com/foundit/image/upload/v1/a.jpg')).toBe(true)
    // Someone else's free account, with our quota
    expect(isCloudinaryPhoto('https://res.cloudinary.com/demo/image/upload/v1/a.jpg')).toBe(false)
    // Left empty, any Cloudinary photo still passes
    process.env.CLOUDINARY_CLOUD_NAME = ''
    expect(isCloudinaryPhoto('https://res.cloudinary.com/demo/image/upload/v1/a.jpg')).toBe(true)
  })

  it('asks Vision for a smaller copy', () => {
    expect(visionCopy('https://res.cloudinary.com/demo/image/upload/v1/a.jpg')).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_limit,w_800/v1/a.jpg',
    )
  })
})

describe('annotatePhoto', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends the key in a header and returns the first response', async () => {
    vi.stubEnv('GOOGLE_VISION_API_KEY', 'test-key')
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ responses: [{ labelAnnotations: [] }] }),
    }))
    vi.stubGlobal('fetch', fetch)

    const result = await annotatePhoto('https://res.cloudinary.com/demo/image/upload/v1/a.jpg')
    expect(result).toEqual({ labelAnnotations: [] })
    const [url, options] = fetch.mock.calls[0]
    expect(url).not.toContain('test-key')
    expect(options.headers['X-Goog-Api-Key']).toBe('test-key')
    vi.unstubAllEnvs()
  })

  it('turns any Vision failure into a 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ responses: [{ error: { message: 'Bad image data' } }] }),
      })),
    )
    await expect(annotatePhoto('https://res.cloudinary.com/d/image/upload/a.jpg')).rejects.toMatchObject({
      status: 502,
      message: 'Could not read the photo',
    })

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('timeout'))))
    await expect(annotatePhoto('https://res.cloudinary.com/d/image/upload/a.jpg')).rejects.toMatchObject({
      status: 502,
    })
  })
})
