import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api', () => ({
  TOKEN_KEY: 'foundit_token',
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

// Photo upload is set up, and "uploads" without reaching Cloudinary
vi.mock('@/services/cloudinary', async (importOriginal) => ({
  ...(await importOriginal()),
  isPhotoUploadEnabled: () => true,
  uploadPhoto: vi.fn(),
}))

import api from '@/api'
import { uploadPhoto } from '@/services/cloudinary'
import MatchesView from '../MatchesView.vue'
import { useAuthStore } from '@/stores/auth'
import { useMatchesStore } from '@/stores/matches'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)
const point = (spotId) => ({ spotId, from: '2026-10-20T06:00:00Z', to: '2026-10-20T06:05:00Z' })

const flask = {
  item: {
    id: 412,
    type: 'lost',
    status: 'open',
    title: 'Navy Hydro Flask',
    category: 'Water Bottle',
    colour: 'Navy',
    brand: 'Hydro Flask',
    description: 'SMU sticker on the side',
    trail: [point(1)],
  },
  matches: [
    {
      id: 1,
      score: 92.4,
      status: 'suggested',
      reasons: ['same category', 'same colour', 'same brand (Hydro Flask)'],
      item: {
        id: 2,
        title: 'Navy Hydro Flask, 750 ml',
        category: 'Water Bottle',
        photoUrl: null,
        trail: [point(1)],
      },
    },
    {
      id: 3,
      score: 71,
      status: 'suggested',
      reasons: ['same category', 'similar colour'],
      item: {
        id: 4,
        title: 'Dark blue steel bottle',
        category: 'Water Bottle',
        photoUrl: null,
        trail: [point(2)],
      },
    },
  ],
}

const umbrella = {
  item: {
    id: 9,
    type: 'lost',
    status: 'open',
    title: 'Black umbrella',
    category: 'Umbrella',
    trail: [point(2), point(1)],
  },
  matches: [],
}

const spots = [
  { id: 1, building: 'SCIS 1', floor: 'Level 2', area: 'seminar room 2-4' },
  { id: 2, building: 'LKS Library', floor: 'Level 1', area: 'entrance' },
]

function makeRouter() {
  const blank = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      '/',
      '/feed',
      '/matches',
      '/matches/finds/:reportId',
      '/matches/:id/claim',
      '/matches/:id/handoff',
      '/map',
      '/report',
      '/report/lost',
      '/login',
      '/items/:id/record',
    ].map((path) => ({ path, component: blank })),
  })
}

const categories = [{ name: 'Water Bottle' }, { name: 'Umbrella' }, { name: 'Other' }]
const colours = [
  { name: 'Navy', hex: '#1f2a5a' },
  { name: 'Black', hex: '#1a1a1a' },
  { name: 'White', hex: '#f5f5f5' },
  { name: 'Red', hex: '#c0392b' },
]

function serve(reports) {
  api.get.mockImplementation((url) => {
    if (url === '/spots') return Promise.resolve({ data: spots })
    if (url === '/categories') return Promise.resolve({ data: categories })
    if (url === '/colours') return Promise.resolve({ data: colours })
    return Promise.resolve({ data: { reports } })
  })
}

async function mountPage(reports, query = {}) {
  serve(reports)
  const router = makeRouter()
  router.push({ path: '/matches', query })
  await router.isReady()
  const wrapper = mount(MatchesView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

// The report's details are folded until "Details" is pressed
async function openDetails(wrapper) {
  await byTestId(wrapper, 'report-more').trigger('click')
}

const umbrellas = (count) =>
  Array.from({ length: count }, (_, i) => ({
    item: { ...umbrella.item, id: 100 + i, title: `Umbrella ${i + 1}` },
    matches: [],
  }))

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  // A logged-in student, so the shared matches store loads
  const auth = useAuthStore()
  auth.token = 't'
  auth.user = { id: 1, name: 'Alice', role: 'user' }
})

describe('MatchesView', () => {
  it('hangs the lost reports as tags, with their names and how many finds', async () => {
    const { wrapper } = await mountPage([flask, umbrella])
    expect(byTestId(wrapper, 'matches-title').text()).toBe('Your lost reports')
    const items = wrapper.findAll('[data-testid="report-item"]')
    expect(items).toHaveLength(2)
    expect(byTestId(items[0], 'report-name').text()).toBe('Navy Hydro Flask')
    expect(byTestId(items[0], 'report-finds').text()).toBe('2 finds')
    expect(items[0].text()).toContain('92%')
    expect(byTestId(items[1], 'report-name').text()).toBe('Black umbrella')
    expect(byTestId(items[1], 'report-finds').text()).toBe('No finds yet')
    expect(items[0].attributes('aria-selected')).toBe('true')
    expect(items[1].attributes('aria-selected')).toBe('false')
    // No "Updated just now" line any more
    expect(byTestId(wrapper, 'matches-meta').exists()).toBe(false)
  })

  it('shows the picked report as one line, with the rest under "Details"', async () => {
    const { wrapper } = await mountPage([flask, umbrella])
    const details = byTestId(wrapper, 'report-details')
    expect(byTestId(details, 'report-title').text()).toBe('Navy Hydro Flask')
    // Folded: the category, colour, brand and place only
    expect(details.text()).toContain('Water Bottle')
    expect(details.text()).toContain('SCIS 1')
    expect(byTestId(details, 'report-trail').exists()).toBe(false)
    expect(details.text()).not.toContain('SMU sticker on the side')
    expect(byTestId(details, 'report-more').attributes('aria-expanded')).toBe('false')

    await openDetails(wrapper)
    expect(byTestId(details, 'report-more').attributes('aria-expanded')).toBe('true')
    expect(details.text()).toContain('Lost report 0412')
    expect(details.text()).toContain('Navy')
    expect(details.text()).toContain('Hydro Flask')
    expect(details.text()).toContain('SMU sticker on the side')
    expect(byTestId(details, 'report-trail').text()).toContain('SCIS 1, Level 2 · Seminar Room 2-4')
  })

  it('shows the best find large, the others as rows, and a link to compare them', async () => {
    const { wrapper } = await mountPage([flask])
    expect(byTestId(wrapper, 'finds-title').text()).toBe('2 finds look like it')
    const best = byTestId(wrapper, 'best-find')
    expect(best.text()).toContain('Navy Hydro Flask, 750 ml')
    expect(best.text()).toContain('Found at SCIS 1')
    expect(byTestId(best, 'finds-score').text()).toBe('92%')
    expect(best.text()).toContain('Same brand (Hydro Flask)')
    expect(byTestId(best, 'this-is-mine').attributes('href')).toBe('/matches/1/claim')
    const others = wrapper.findAll('[data-testid="other-find"]')
    expect(others).toHaveLength(1)
    expect(others[0].text()).toContain('Dark blue steel bottle')
    expect(others[0].attributes('href')).toBe('/matches/finds/412?find=3')
    const link = byTestId(wrapper, 'finds-link')
    expect(link.attributes('href')).toBe('/matches/finds/412')
    expect(link.text()).toBe('Compare side by side')
  })

  it('links a report being returned straight to its handoff chat', async () => {
    const beingReturned = {
      ...flask,
      item: { ...flask.item, status: 'matched' },
      matches: [{ ...flask.matches[0], status: 'claimed' }, flask.matches[1]],
    }
    const { wrapper } = await mountPage([beingReturned])
    const link = byTestId(wrapper, 'handoff-link')
    expect(link.attributes('href')).toBe(`/matches/${flask.matches[0].id}/handoff`)
    expect(link.attributes('aria-label')).toContain('Open the chat')
    expect(wrapper.text()).toContain('Your claim is under way')
    expect(byTestId(wrapper, 'report-finds').text()).toBe('Being returned')
    expect(byTestId(wrapper, 'finds-link').exists()).toBe(false)
    // A report being returned cannot be closed by hand
    expect(byTestId(wrapper, 'found-it').exists()).toBe(false)
  })

  it('draws the best find in its own colour, not the report’s', async () => {
    // The report says Navy; the finder reported the best find as Black
    const report = structuredClone(flask)
    report.matches[0].item.colours = ['Black']
    const { wrapper } = await mountPage([report])
    const style = byTestId(wrapper, 'best-find').find('svg').attributes('style')
    expect(style).toMatch(/#1a1a1a|rgb\(26, 26, 26\)/)
  })

  it('says the place stays private when the server leaves it out of the best find', async () => {
    const report = structuredClone(flask)
    report.matches[0].item.placeHidden = true
    report.matches[0].item.trail = [{ spotId: null, roomId: null, from: null, to: null }]
    const { wrapper } = await mountPage([report])
    expect(wrapper.find('[data-testid="find-place-hidden"]').text()).toContain('stay private')
    expect(wrapper.text()).not.toContain('Found at Place hidden')
    expect(wrapper.text()).not.toContain('1970')
  })

  it('switches report when another tag is picked, keeping the details open', async () => {
    const { wrapper, router } = await mountPage([flask, umbrella])
    await openDetails(wrapper)
    await wrapper.findAll('[data-testid="report-item"]')[1].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.report).toBe('9')
    expect(byTestId(wrapper, 'report-title').text()).toBe('Black umbrella')
    // No finds: no link to a finds page, just an invitation to search the feed
    expect(byTestId(wrapper, 'finds-link').exists()).toBe(false)
    expect(byTestId(wrapper, 'no-finds').text()).toContain('No finds look like it yet.')
    expect(byTestId(wrapper, 'search-feed').attributes('href')).toBe('/feed?family=umbrellas')
    expect(byTestId(wrapper, 'search-feed').text()).toBe('Browse our finds')
    expect(wrapper.findAll('[data-testid="report-item"]')[1].attributes('aria-selected')).toBe(
      'true',
    )
    expect(byTestId(wrapper, 'report-trail').findAll('li')).toHaveLength(2)
  })

  it('filters the tags by what each report needs, leaving out empty filters', async () => {
    const { wrapper, router } = await mountPage([flask, umbrella])
    expect(byTestId(wrapper, 'filter-all').text()).toContain('2')
    expect(byTestId(wrapper, 'filter-finds').text()).toContain('1')
    expect(byTestId(wrapper, 'filter-none').text()).toContain('1')
    // Nothing is being returned, so that filter is not offered
    expect(byTestId(wrapper, 'filter-back').exists()).toBe(false)

    await byTestId(wrapper, 'filter-none').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.show).toBe('none')
    expect(byTestId(wrapper, 'filter-none').attributes('aria-pressed')).toBe('true')
    const items = wrapper.findAll('[data-testid="report-item"]')
    expect(items).toHaveLength(1)
    expect(byTestId(items[0], 'report-name').text()).toBe('Black umbrella')
    // The ticket follows: the only report left is shown
    expect(byTestId(wrapper, 'report-title').text()).toBe('Black umbrella')
  })

  it('hangs every report on one rail, with no pages', async () => {
    const { wrapper } = await mountPage(umbrellas(12))
    expect(wrapper.findAll('[data-testid="report-item"]')).toHaveLength(12)
    expect(byTestId(wrapper, 'feed-pager').exists()).toBe(false)
    expect(byTestId(wrapper, 'report-rails').find('[role="tablist"]').exists()).toBe(true)
  })

  it('moves between the tags with the arrow keys, Home and End', async () => {
    const { wrapper, router } = await mountPage(umbrellas(4))
    const rail = byTestId(wrapper, 'report-rails').find('[role="tablist"]')
    await rail.trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(router.currentRoute.value.query.report).toBe('101')
    await rail.trigger('keydown', { key: 'End' })
    await flushPromises()
    expect(router.currentRoute.value.query.report).toBe('103')
    await rail.trigger('keydown', { key: 'Home' })
    await flushPromises()
    expect(router.currentRoute.value.query.report).toBe('100')
    // Only the tag shown is in the Tab order
    const tabbable = wrapper.findAll('[data-testid="report-item"][tabindex="0"]')
    expect(tabbable).toHaveLength(1)
  })

  it('opens on the report in the address', async () => {
    const { wrapper } = await mountPage(umbrellas(8), { report: '107' })
    const current = wrapper.find('[data-testid="report-item"][aria-selected="true"]')
    expect(byTestId(current, 'report-name').text()).toBe('Umbrella 8')
    expect(byTestId(wrapper, 'report-title').text()).toBe('Umbrella 8')
  })

  it('says so when the owner comes back from clearing every find', async () => {
    const { wrapper, router } = await mountPage([flask, umbrella], { report: '9', cleared: '1' })
    // The flag leaves the address, so a reload doesn't show the note again
    expect(router.currentRoute.value.query).toEqual({ report: '9' })
    expect(byTestId(wrapper, 'report-title').text()).toBe('Black umbrella')
    expect(byTestId(wrapper, 'cleared-note').text()).toContain('No finds left for your umbrella.')
    await byTestId(wrapper, 'cleared-note-dismiss').trigger('click')
    expect(byTestId(wrapper, 'cleared-note').exists()).toBe(false)
  })

  it('drops the note once another report is picked', async () => {
    const { wrapper } = await mountPage([flask, umbrella], { report: '9', cleared: '1' })
    await wrapper.findAll('[data-testid="report-item"]')[0].trigger('click')
    await flushPromises()
    expect(byTestId(wrapper, 'cleared-note').exists()).toBe(false)
  })

  it('edits the details, sends only what changed and checks the finds again', async () => {
    api.patch.mockResolvedValue({ data: {} })
    const { wrapper } = await mountPage([structuredClone(flask)])
    await openDetails(wrapper)
    await byTestId(wrapper, 'edit-report').trigger('click')
    expect(byTestId(wrapper, 'edit-title').element.value).toBe('Navy Hydro Flask')
    expect(
      byTestId(wrapper, 'edit-category')
        .findAll('option')
        .map((o) => o.text()),
    ).toContain('Other')

    // Navy off, then Black and White on: Black becomes the main colour
    await byTestId(wrapper, 'edit-colour-Navy').trigger('change')
    await byTestId(wrapper, 'edit-colour-Black').trigger('change')
    await byTestId(wrapper, 'edit-colour-White').trigger('change')
    await byTestId(wrapper, 'edit-description').setValue('SMU sticker and a dent')
    const callsBefore = api.get.mock.calls.filter(([url]) => url === '/matches/mine').length
    await byTestId(wrapper, 'edit-form').trigger('submit')
    await flushPromises()

    expect(api.patch).toHaveBeenCalledWith('/items/412', {
      colours: ['Black', 'White'],
      description: 'SMU sticker and a dent',
    })
    const callsAfter = api.get.mock.calls.filter(([url]) => url === '/matches/mine').length
    expect(callsAfter).toBe(callsBefore + 1)
    expect(byTestId(wrapper, 'report-saved').exists()).toBe(true)
    expect(byTestId(wrapper, 'edit-form').exists()).toBe(false)
  })

  it('shows every colour of a report, main colour first', async () => {
    const twoTone = structuredClone(flask)
    twoTone.item.colours = ['Navy', 'White']
    const { wrapper } = await mountPage([twoTone])
    expect(byTestId(wrapper, 'report-colours').text().replace(/\s+/g, ' ')).toBe('Navy White')
  })

  it('lets at most 3 colours be picked while editing', async () => {
    const { wrapper } = await mountPage([structuredClone(flask)])
    await openDetails(wrapper)
    await byTestId(wrapper, 'edit-report').trigger('click')
    await byTestId(wrapper, 'edit-colour-Black').trigger('change')
    await byTestId(wrapper, 'edit-colour-White').trigger('change')
    expect(byTestId(wrapper, 'edit-colour-Red').attributes('disabled')).toBeDefined()
    expect(byTestId(wrapper, 'edit-colour-hint').text()).toContain('Main colour: Navy')
  })

  it('uploads a new photo when it is chosen and saves its link with the details', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
    uploadPhoto.mockResolvedValue('https://res.cloudinary.com/demo/image/upload/flask.jpg')
    api.patch.mockResolvedValue({ data: {} })
    const { wrapper } = await mountPage([structuredClone(flask)])
    await openDetails(wrapper)
    await byTestId(wrapper, 'edit-report').trigger('click')
    expect(byTestId(wrapper, 'edit-photo-status').text()).toContain('No photo yet')

    const input = byTestId(wrapper, 'edit-photo-input')
    const file = new File(['x'], 'flask.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(uploadPhoto).toHaveBeenCalledWith(file, expect.anything())
    expect(byTestId(wrapper, 'edit-photo-preview').attributes('src')).toBe('blob:preview')
    await byTestId(wrapper, 'edit-form').trigger('submit')
    await flushPromises()
    expect(api.patch).toHaveBeenCalledWith('/items/412', {
      photoUrl: 'https://res.cloudinary.com/demo/image/upload/flask.jpg',
    })
  })

  it('removes a report’s photo', async () => {
    api.patch.mockResolvedValue({ data: {} })
    const withPhoto = structuredClone(flask)
    withPhoto.item.photoUrl = 'https://res.cloudinary.com/demo/image/upload/old.jpg'
    const { wrapper } = await mountPage([withPhoto])
    await openDetails(wrapper)
    await byTestId(wrapper, 'edit-report').trigger('click')
    expect(byTestId(wrapper, 'edit-photo-preview').attributes('src')).toBe(withPhoto.item.photoUrl)
    await byTestId(wrapper, 'edit-photo-remove').trigger('click')
    expect(byTestId(wrapper, 'edit-photo-preview').exists()).toBe(false)
    await byTestId(wrapper, 'edit-form').trigger('submit')
    await flushPromises()
    expect(api.patch).toHaveBeenCalledWith('/items/412', { photoUrl: '' })
  })

  it('keeps the form open and says why when the name is empty or saving fails', async () => {
    api.patch.mockRejectedValue({ response: { data: { error: 'Category is required' } } })
    const { wrapper } = await mountPage([structuredClone(flask)])
    await openDetails(wrapper)
    await byTestId(wrapper, 'edit-report').trigger('click')
    await byTestId(wrapper, 'edit-title').setValue('   ')
    await byTestId(wrapper, 'edit-form').trigger('submit')
    expect(byTestId(wrapper, 'edit-error').text()).toBe('Give your item a name.')
    expect(api.patch).not.toHaveBeenCalled()

    await byTestId(wrapper, 'edit-title').setValue('Navy bottle')
    await byTestId(wrapper, 'edit-form').trigger('submit')
    await flushPromises()
    expect(byTestId(wrapper, 'edit-error').text()).toBe('Category is required')
    expect(byTestId(wrapper, 'edit-form').exists()).toBe(true)
  })

  it('offers a search once there are 9 reports, kept in the address', async () => {
    const few = await mountPage(umbrellas(8))
    expect(byTestId(few.wrapper, 'report-search').exists()).toBe(false)
    few.wrapper.unmount()

    const reports = umbrellas(9)
    reports[4].item.title = 'Red Nike cap'
    const { wrapper, router } = await mountPage(reports)
    await byTestId(wrapper, 'report-search').setValue('nike')
    await flushPromises()
    expect(router.currentRoute.value.query.q).toBe('nike')
    const names = wrapper.findAll('[data-testid="report-name"]').map((name) => name.text())
    expect(names).toEqual(['Red Nike cap'])
    expect(byTestId(wrapper, 'report-title').text()).toBe('Red Nike cap')

    await byTestId(wrapper, 'report-search').setValue('wallet')
    await flushPromises()
    expect(byTestId(wrapper, 'report-search-empty').text()).toContain('No reports match “wallet”.')
    expect(byTestId(wrapper, 'report-details').exists()).toBe(false)
    await byTestId(wrapper, 'report-search-clear').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="report-item"]')).toHaveLength(9)
    expect(router.currentRoute.value.query.q).toBeUndefined()
  })

  it('opens the edit form from "Add details" on a report with no finds', async () => {
    const { wrapper } = await mountPage([structuredClone(umbrella)])
    expect(byTestId(wrapper, 'edit-form').exists()).toBe(false)
    await byTestId(wrapper, 'add-details').trigger('click')
    expect(byTestId(wrapper, 'edit-form').exists()).toBe(true)
    expect(byTestId(wrapper, 'edit-title').element.value).toBe('Black umbrella')
  })

  it('hides a find on "Not mine", offers Undo, and saves it a few seconds later', async () => {
    api.post.mockResolvedValue({ data: {} })
    const { wrapper } = await mountPage([structuredClone(flask)])
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await byTestId(wrapper, 'not-mine').trigger('click')
      // The next find moves up at once, and nothing is saved yet
      expect(byTestId(wrapper, 'best-find').text()).toContain('Dark blue steel bottle')
      expect(byTestId(wrapper, 'finds-title').text()).toBe('1 find looks like it')
      expect(byTestId(wrapper, 'not-mine-undo').text()).toContain('Navy Hydro Flask, 750 ml')
      expect(api.post).not.toHaveBeenCalled()

      await byTestId(wrapper, 'not-mine-undo-button').trigger('click')
      expect(byTestId(wrapper, 'best-find').text()).toContain('Navy Hydro Flask, 750 ml')
      expect(byTestId(wrapper, 'not-mine-undo').exists()).toBe(false)
      vi.advanceTimersByTime(10000)
      expect(api.post).not.toHaveBeenCalled()

      await byTestId(wrapper, 'not-mine').trigger('click')
      vi.advanceTimersByTime(6000)
    } finally {
      vi.useRealTimers()
    }
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/matches/1/reject')
    expect(byTestId(wrapper, 'not-mine-undo').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="other-find"]')).toHaveLength(0)
    expect(byTestId(wrapper, 'best-find').text()).toContain('Dark blue steel bottle')
  })

  it('says so when "Not mine" clears the last find', async () => {
    api.post.mockResolvedValue({ data: {} })
    const single = structuredClone(flask)
    single.matches = [single.matches[0]]
    const { wrapper } = await mountPage([single, umbrella])
    await byTestId(wrapper, 'not-mine').trigger('click')
    // Picking another report saves it straight away
    await wrapper.findAll('[data-testid="report-item"]')[1].trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/matches/1/reject')
    await wrapper.findAll('[data-testid="report-item"]')[0].trigger('click')
    await flushPromises()
    expect(byTestId(wrapper, 'cleared-note').text()).toContain(
      'No finds left for your water bottle.',
    )
    expect(byTestId(wrapper, 'report-finds').text()).toBe('No finds yet')
  })

  it('shows the find again and says why when hiding it fails', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'Match not found' } } })
    const { wrapper } = await mountPage([structuredClone(flask)])
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await byTestId(wrapper, 'not-mine').trigger('click')
      vi.advanceTimersByTime(6000)
    } finally {
      vi.useRealTimers()
    }
    await flushPromises()
    expect(byTestId(wrapper, 'matches-error').text()).toBe('Match not found')
    expect(byTestId(wrapper, 'best-find').text()).toContain('Navy Hydro Flask, 750 ml')
  })

  it('saves a "Not mine" still waiting for Undo when the page is left', async () => {
    api.post.mockResolvedValue({ data: {} })
    const { wrapper } = await mountPage([structuredClone(flask)])
    await byTestId(wrapper, 'not-mine').trigger('click')
    expect(api.post).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(api.post).toHaveBeenCalledWith('/matches/1/reject')
  })

  it('closes a report the owner found themselves', async () => {
    api.patch.mockResolvedValue({ data: { id: 9, status: 'resolved' } })
    const { wrapper } = await mountPage([structuredClone(umbrella)])
    await byTestId(wrapper, 'found-it').trigger('click')
    await byTestId(wrapper, 'found-it-confirm').trigger('click')
    await flushPromises()
    expect(api.patch).toHaveBeenCalledWith('/items/9', { status: 'resolved' })
    expect(wrapper.text()).toContain('Nothing reported lost')
  })

  it('shares its reports with the header badge', async () => {
    await mountPage([flask, umbrella])
    expect(useMatchesStore().count).toBe(2)
  })

  it('says why when the matches cannot be loaded', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Server is down' } } })
    const router = makeRouter()
    router.push('/matches')
    await router.isReady()
    const wrapper = mount(MatchesView, { global: { plugins: [router] } })
    await flushPromises()
    expect(byTestId(wrapper, 'matches-error').text()).toBe('Server is down')
  })
})
