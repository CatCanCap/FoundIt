import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { cosine, semanticScore, FLOOR, CEILING } = require('../../matching/semantic')
const { attributeScore, SIMILAR_TEXT, MEANING_SHARE } = require('../../matching/attributes')
const { canMatch } = require('../../matching/category')
const { findMatches } = require('../../matching/index')
const embed = require('../../matching/embed')
const { attachEmbeddings } = require('../../matching/attach-embeddings')
const ItemEmbedding = require('../../models/item-embedding-model')
const { loadSeed } = require('../../data/load')
const { loadHardSet } = require('../../matching/hard-set')

const seed = loadSeed()
const context = { spots: seed.spots, categories: seed.categories, colours: seed.colours }

// A unit-length vector at `angle` radians, so cosine(at(a), at(b)) is cos(a - b)
const at = (angle) => [Math.cos(angle), Math.sin(angle)]
// Two vectors whose cosine similarity is exactly `similarity`
const pairWith = (similarity) => [at(0), at(Math.acos(similarity))]

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('cosine', () => {
  it('is 1 for the same direction, 0 at right angles and -1 for opposite', () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 3])).toBeCloseTo(0)
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1)
  })

  it('is null for missing, empty, zero or different-length lists', () => {
    expect(cosine(undefined, [1])).toBeNull()
    expect(cosine([], [])).toBeNull()
    expect(cosine([0, 0], [1, 0])).toBeNull()
    expect(cosine([1, 0], [1, 0, 0])).toBeNull()
  })
})

describe('semanticScore', () => {
  it('runs in a straight line from 0 at FLOOR to 100 at CEILING', () => {
    const score = (similarity) => {
      const [a, b] = pairWith(similarity)
      return semanticScore({ embedding: a }, { embedding: b })
    }
    expect(score(FLOOR)).toBeCloseTo(0)
    expect(score(CEILING)).toBeCloseTo(100)
    expect(score((FLOOR + CEILING) / 2)).toBeCloseTo(50)
    expect(score(0.1)).toBe(0)
    expect(score(0.99)).toBe(100)
  })

  it('takes other settings from tune.js', () => {
    const [a, b] = pairWith(0.7)
    expect(semanticScore({ embedding: a }, { embedding: b }, { floor: 0.6, ceiling: 0.8 })).toBeCloseTo(50)
  })

  it('is null when either report has no embedding, so matching falls back to words', () => {
    expect(semanticScore({ embedding: at(0) }, {})).toBeNull()
  })
})

describe('attributeScore with embeddings', () => {
  const specs = { title: 'Spectacles', description: 'Gold-rimmed specs in a floral case', category: 'Other', colour: 'Gold' }
  const glasses = { title: 'Eyeglasses', description: 'Golden frame, flowery case', category: 'Other', colour: 'Gold' }

  it('scores the text on meaning when the reports share few words', () => {
    const words = attributeScore(specs, glasses, seed.colours)
    const [a, b] = pairWith(CEILING)
    const meaning = attributeScore({ ...specs, embedding: a }, { ...glasses, embedding: b }, seed.colours)
    expect(meaning.parts.keywords).toBeCloseTo(100 * MEANING_SHARE)
    expect(meaning.score).toBeGreaterThan(words.score)
    expect(meaning.evidence.similarText).toBe(true)
    expect(meaning.reasons).toContainEqual({ lead: 'similar description', detail: '' })
  })

  it('keeps the shared-words score when it is higher, with no meaning reason', () => {
    const lost = { title: 'Totes umbrella', description: 'wooden handle, torn rib', category: 'Umbrella' }
    const found = { title: 'Umbrella', description: 'wooden handle, torn rib', category: 'Umbrella' }
    const [a, b] = pairWith(FLOOR)
    const result = attributeScore({ ...lost, embedding: a }, { ...found, embedding: b }, seed.colours)
    expect(result.parts.keywords).toBe(attributeScore(lost, found, seed.colours).parts.keywords)
    expect(result.evidence.similarText).toBe(false)
    expect(result.reasons.map((r) => r.lead)).not.toContain('similar description')
  })

  it(`counts the text as similar from a meaning score of ${SIMILAR_TEXT}`, () => {
    const similarity = FLOOR + ((CEILING - FLOOR) * SIMILAR_TEXT) / 100 + 0.001
    const [a, b] = pairWith(similarity)
    expect(attributeScore({ ...specs, embedding: a }, { ...glasses, embedding: b }, seed.colours).evidence.similarText).toBe(true)
  })
})

describe('canMatch with similar text', () => {
  it("lets an 'Other' report match on meaning alone", () => {
    expect(canMatch('Other', 'Other', seed.categories, { sameBrand: false, sharedWords: 0, similarText: true })).toBe(true)
    expect(canMatch('Other', 'Other', seed.categories, { sameBrand: false, sharedWords: 0, similarText: false })).toBe(false)
  })

  it('still never matches unrelated categories', () => {
    expect(canMatch('Umbrella', 'Headphones', seed.categories, { similarText: true })).toBe(false)
  })
})

describe('findMatches with embeddings', () => {
  const hard = loadHardSet(seed)
  const byId = new Map(hard.items.map((item) => [item.id, item]))
  // Group 6: a silver ring, both filed as Other, sharing no word but "silver" (a colour)
  const ring = hard.groups.find((group) => group.groupId === 6)

  it('finds an Other pair that shares no words once the meanings agree', () => {
    const lost = byId.get(ring.lostItemId)
    const found = byId.get(ring.foundItemId)
    expect(findMatches(lost, [found], context)).toEqual([])

    const [a, b] = pairWith(0.9)
    const results = findMatches({ ...lost, embedding: a }, [{ ...found, embedding: b }], context)
    expect(results.map((r) => r.candidateId)).toEqual([found.id])
    expect(results[0].reasons).toContain('similar description')
  })
})

describe('the harder test set', () => {
  it('loads, with known spots, categories and colours, and no clash with seeded ids', () => {
    const hard = loadHardSet(seed)
    expect(hard.groups.length).toBeGreaterThanOrEqual(20)
    const seedIds = new Set(seed.items.map((item) => item.id))
    expect(hard.items.every((item) => !seedIds.has(item.id))).toBe(true)
    for (const group of hard.groups) {
      const ids = new Set(hard.items.map((item) => item.id))
      expect(ids.has(group.lostItemId) && ids.has(group.foundItemId)).toBe(true)
    }
  })
})

// Guards the tuning in the README with the saved embeddings (no key or network):
// fails if the semantic score stops finding the reworded pairs, or if it brings
// back the noise that full credit for meaning gave
describe('semantic score on the harder test set', () => {
  const tune = require('../../matching/tune')
  const words = tune.evaluateHard()
  const missing = tune.useCachedEmbeddings()
  const meaning = tune.evaluateHard(undefined, {}, { semantic: true })
  const seeded = tune.evaluate(require('../../matching/index').WEIGHTS)

  it('has a saved embedding for every seeded report (else run node matching/embed-cache.js)', () => {
    expect(missing).toBe(0)
  })

  it('shows every reworded pair, and ranks more of them first than words alone', () => {
    expect(meaning.shown).toBe(meaning.queries)
    expect(meaning.top1).toBeGreaterThanOrEqual(words.top1 + 10)
    expect(meaning.beatenByLookAlike).toBeLessThan(words.beatenByLookAlike)
  })

  it('keeps the seeded pairs perfect and their noise low', () => {
    expect(seeded.top1).toBe(seeded.queries)
    expect(seeded.shown).toBe(seeded.queries)
    expect(seeded.wrongShown / seeded.queries).toBeLessThan(0.2)
    expect(seeded.decoyShown).toBeLessThanOrEqual(5)
  })
})

describe('embed', () => {
  it('blanks out emails, phone numbers and long numbers but keeps short ones', () => {
    expect(embed.scrub('mail me at jo.tan.2025@smu.edu.sg')).toBe('mail me at [email]')
    expect(embed.scrub('call 9123 4567 or +65 9123-4567')).toBe('call [number] or [number]')
    expect(embed.scrub('matric 01234567')).toBe('matric [number]')
    expect(embed.scrub('10000mAh power bank, TI-84')).toBe('10000mAh power bank, TI-84')
  })

  it('sends only the title and description', () => {
    const item = { title: 'Black thermos', description: 'Dent near the bottom', brand: 'Thermos', postedBy: 4, trail: [] }
    expect(embed.embeddingText(item)).toBe('title: Black thermos | text: Dent near the bottom')
  })

  it('gives a new hash when the text changes, and the same hash otherwise', () => {
    const item = { title: 'Black thermos', description: 'Dent near the bottom' }
    expect(embed.textHash(item)).toBe(embed.textHash({ ...item, brand: 'Thermos' }))
    expect(embed.textHash(item)).not.toBe(embed.textHash({ ...item, description: 'No dent' }))
  })

  it('is switched off without a key, and always in tests', () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    expect(embed.isEmbeddingEnabled()).toBe(false)
    vi.stubEnv('VITEST', '')
    expect(embed.isEmbeddingEnabled()).toBe(true)
    vi.stubEnv('GEMINI_API_KEY', '')
    expect(embed.isEmbeddingEnabled()).toBe(false)
  })

  it('asks Google in batches and returns one embedding per item, in order', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    const fetchMock = vi.fn(async (url, options) => {
      const { requests } = JSON.parse(options.body)
      return { ok: true, json: async () => ({ embeddings: requests.map((r) => ({ values: [r.content.parts[0].text.length] })) }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const items = Array.from({ length: embed.BATCH_SIZE + 5 }, (_, i) => ({ title: 'x'.repeat(i + 1), description: '' }))
    const vectors = await embed.embedItems(items)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vectors).toHaveLength(items.length)
    expect(vectors[0]).toEqual([embed.embeddingText(items[0]).length])
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain(embed.MODEL)
    expect(options.headers['x-goog-api-key']).toBe('test-key')
    expect(JSON.parse(options.body).requests[0].outputDimensionality).toBe(embed.DIMENSIONS)
  })

  it('throws when Google refuses, for example at the daily limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'quota' } }) })))
    await expect(embed.embedItems([{ title: 'a', description: '' }])).rejects.toThrow('429')
  })
})

describe('attachEmbeddings', () => {
  const item = { id: 1, title: 'Silver ring', description: 'Engraved band' }
  const other = { id: 2, title: 'Ring by the sink', description: 'Inscription inside' }

  function enable() {
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    vi.stubEnv('VITEST', '')
  }

  it('does nothing in tests or without a key', async () => {
    const find = vi.spyOn(ItemEmbedding, 'findByItemIds')
    await attachEmbeddings({ ...item }, [{ ...other }])
    expect(find).not.toHaveBeenCalled()
  })

  it('reuses saved embeddings while the text is unchanged and fetches the rest', async () => {
    enable()
    const newItem = { ...item }
    const candidate = { ...other }
    vi.spyOn(ItemEmbedding, 'findByItemIds').mockResolvedValue(new Map([
      [2, { textHash: embed.textHash(candidate), embedding: [0, 1] }],
    ]))
    const save = vi.spyOn(ItemEmbedding, 'saveMany').mockResolvedValue()
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ embeddings: [{ values: [1, 0] }] }) }))
    vi.stubGlobal('fetch', fetchMock)

    await attachEmbeddings(newItem, [candidate])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(newItem.embedding).toEqual([1, 0])
    expect(candidate.embedding).toEqual([0, 1])
    expect(save).toHaveBeenCalledWith([{ itemId: 1, textHash: embed.textHash(newItem), embedding: [1, 0] }])
  })

  it('makes a new embedding after the text is edited', async () => {
    enable()
    const edited = { ...item, description: 'Plain band, no engraving' }
    vi.spyOn(ItemEmbedding, 'findByItemIds').mockResolvedValue(new Map([
      [1, { textHash: embed.textHash(item), embedding: [0, 1] }],
    ]))
    vi.spyOn(ItemEmbedding, 'saveMany').mockResolvedValue()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ embeddings: [{ values: [1, 0] }] }) })))
    await attachEmbeddings(edited, [])
    expect(edited.embedding).toEqual([1, 0])
  })

  it('never throws: matching goes on with words only', async () => {
    enable()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(ItemEmbedding, 'findByItemIds').mockResolvedValue(new Map())
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const newItem = { ...item }
    await expect(attachEmbeddings(newItem, [{ ...other }])).resolves.toBeUndefined()
    expect(newItem.embedding).toBeUndefined()
  })
})
