import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  TOKEN_KEY: 'foundit_token',
}))
// Cloudinary is never called in tests
vi.mock('@/services/cloudinary', () => ({
  PHOTO_HINT: 'JPG, PNG, WebP or HEIC, up to 10 MB.',
  isPhotoUploadEnabled: vi.fn(() => false),
  checkPhoto: vi.fn(() => null),
  uploadPhoto: vi.fn(),
  resizedPhotoUrl: vi.fn((url) => url),
}))

import api from '@/api'
import { isPhotoUploadEnabled } from '@/services/cloudinary'
import { useAuthStore } from '@/stores/auth'
import LostReportView from '../LostReportView.vue'

const lists = {
  '/categories': [
    { name: 'Other', related: [] },
    { name: 'Water Bottle', related: [] },
  ],
  '/colours': [{ name: 'Navy', hex: '#1f2a5a', related: [] }],
  // SCIS 1 has three spots, LKCSB only one
  '/spots': [
    { id: 4, building: 'SCIS 1', floor: 'Level 1', area: 'lobby' },
    { id: 5, building: 'SCIS 1', floor: 'Level 2', area: 'lift lobby' },
    { id: 6, building: 'SCIS 1', floor: 'Level 2', area: 'seminar rooms' },
    { id: 16, building: 'LKCSB', floor: 'Basement 1', area: 'group study rooms' },
  ],
}

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)
const submit = (wrapper) => wrapper.find('form.lost-step').trigger('submit')
const itemPost = () => api.post.mock.calls.find(([path]) => path === '/items')

async function mountForm(path = '/report/lost', user = null) {
  setActivePinia(createPinia())
  // The page needs login, as in the app
  const auth = useAuthStore()
  auth.token = 'abc'
  if (user) auth.user = user
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/report', component: { template: '<div />' } },
      { path: '/report/lost', component: LostReportView },
      { path: '/feed', component: { template: '<div />' } },
      { path: '/matches', component: { template: '<div />' } },
      { path: '/items/:id/dispute', component: { template: '<div />' } },
    ],
  })
  router.push(path)
  await router.isReady()
  const wrapper = mount(
    { template: '<RouterView />' },
    { global: { plugins: [router] }, attachTo: document.body },
  )
  await flushPromises()
  return { wrapper, router }
}

// Step 1, then on to the trail
async function fillWhat(wrapper) {
  await byTestId(wrapper, 'lost-category').setValue('Water Bottle')
  await submit(wrapper)
}

// The trail step: tap a building, then type its times (a new stop has none).
// Tests use a past day, so the times are never in the future.
async function tapBuilding(wrapper, building, times = ['09:00', '10:00']) {
  await byTestId(wrapper, `map-tile-${building}`).trigger('click')
  if (!times) return
  const number = wrapper.findAll('[data-testid^="lost-stop-start-"]').length
  await byTestId(wrapper, `lost-stop-start-${number}`).setValue(times[0])
  await byTestId(wrapper, `lost-stop-end-${number}`).setValue(times[1])
}

beforeEach(() => {
  vi.clearAllMocks()
  // Use the drawn campus map (clickable tiles), even when a Mapbox token is set
  vi.stubEnv('VITE_MAPBOX_TOKEN', '')
  isPhotoUploadEnabled.mockReturnValue(false)
  globalThis.scrollTo = vi.fn()
  window.confirm = vi.fn(() => true)
  api.get.mockImplementation(async (url) => ({ data: lists[url] }))
  api.post.mockResolvedValue({ data: { item: { id: 42, title: 'Water bottle' }, matches: [] } })
})

afterEach(() => {
  vi.unstubAllEnvs()
  document.body.innerHTML = ''
})

describe('LostReportView: the trail step', () => {
  it('does not guess the part of a building that has several', async () => {
    const { wrapper } = await mountForm()
    await fillWhat(wrapper)
    await byTestId(wrapper, 'lost-date').setValue('2026-10-08')
    await tapBuilding(wrapper, 'SCIS 1')

    const where = byTestId(wrapper, 'lost-stop-spot-1')
    expect(where.element.value).toBe('')
    expect(where.find('option').text()).toBe('Where in the building?')

    await submit(wrapper)
    expect(byTestId(wrapper, 'lost-error').text()).toBe('Stop 1: pick where in the building.')
    expect(byTestId(wrapper, 'lost-step-count').text()).toBe('Step 2 of 3')
  })

  it('posts the part of the building the owner picked', async () => {
    const { wrapper } = await mountForm()
    await fillWhat(wrapper)
    await byTestId(wrapper, 'lost-date').setValue('2026-10-08')
    await tapBuilding(wrapper, 'SCIS 1')
    await byTestId(wrapper, 'lost-stop-spot-1').setValue('5')
    await submit(wrapper)
    expect(byTestId(wrapper, 'lost-step-count').text()).toBe('Step 3 of 3')

    await submit(wrapper)
    await flushPromises()
    expect(itemPost()[1].trail.map((point) => point.spotId)).toEqual([5])
  })

  it('needs no choice for a building with one spot', async () => {
    const { wrapper } = await mountForm()
    await fillWhat(wrapper)
    await byTestId(wrapper, 'lost-date').setValue('2026-10-08')
    await tapBuilding(wrapper, 'LKCSB')
    expect(byTestId(wrapper, 'lost-stop-spot-1').exists()).toBe(false)

    await submit(wrapper)
    await submit(wrapper)
    await flushPromises()
    expect(itemPost()[1].trail.map((point) => point.spotId)).toEqual([16])
  })

  it('starts a new stop with no times, and will not go on until both are typed', async () => {
    const { wrapper } = await mountForm()
    await fillWhat(wrapper)
    await byTestId(wrapper, 'lost-date').setValue('2026-10-08')
    await tapBuilding(wrapper, 'LKCSB', null)
    expect(byTestId(wrapper, 'lost-stop-start-1').element.value).toBe('')
    expect(byTestId(wrapper, 'lost-stop-end-1').element.value).toBe('')
    expect(byTestId(wrapper, 'lost-stop-start-1').attributes('required')).toBeDefined()

    await submit(wrapper)
    expect(byTestId(wrapper, 'lost-error').text()).toBe('Stop 1: add a start and end time.')

    await byTestId(wrapper, 'lost-stop-start-1').setValue('14:00')
    await byTestId(wrapper, 'lost-stop-end-1').setValue('13:00')
    await submit(wrapper)
    expect(byTestId(wrapper, 'lost-error').text()).toBe(
      'Stop 1: the end time must be after the start.',
    )

    await byTestId(wrapper, 'lost-stop-end-1').setValue('15:30')
    await submit(wrapper)
    expect(byTestId(wrapper, 'lost-step-count').text()).toBe('Step 3 of 3')
  })

  it('posts the times the owner typed, widened by how sure they are', async () => {
    const { wrapper } = await mountForm()
    await fillWhat(wrapper)
    await byTestId(wrapper, 'lost-date').setValue('2026-10-08')
    await tapBuilding(wrapper, 'LKCSB', ['14:00', '15:30'])
    await tapBuilding(wrapper, 'SCIS 1', ['16:00', '17:00'])
    // The second stop's time is not copied from the first
    expect(byTestId(wrapper, 'lost-stop-start-2').element.value).toBe('16:00')
    await byTestId(wrapper, 'lost-stop-spot-2').setValue('4')
    await submit(wrapper)
    await submit(wrapper)
    await flushPromises()

    const minutes = 30 * 60 * 1000
    const [first, second] = itemPost()[1].trail
    expect(new Date(first.from).getTime()).toBe(
      new Date('2026-10-08T14:00+08:00').getTime() - minutes,
    )
    expect(new Date(first.to).getTime()).toBe(
      new Date('2026-10-08T15:30+08:00').getTime() + minutes,
    )
    expect(new Date(second.from).getTime()).toBe(
      new Date('2026-10-08T16:00+08:00').getTime() - minutes,
    )
  })

  it('wants the stops in the order the owner went', async () => {
    const { wrapper } = await mountForm()
    await fillWhat(wrapper)
    await byTestId(wrapper, 'lost-date').setValue('2026-10-08')
    await tapBuilding(wrapper, 'LKCSB', ['14:00', '15:00'])
    await tapBuilding(wrapper, 'SCIS 1', ['09:00', '10:00'])
    await byTestId(wrapper, 'lost-stop-spot-2').setValue('4')
    await submit(wrapper)
    expect(byTestId(wrapper, 'lost-error').text()).toBe(
      'Stop 2: it starts before stop 1. Put the stops in the order you went.',
    )
  })

  it('clears the message once that problem is fixed, and keeps the next for Continue', async () => {
    const { wrapper } = await mountForm()
    await fillWhat(wrapper)
    await byTestId(wrapper, 'lost-date').setValue('2026-10-08')
    await tapBuilding(wrapper, 'SCIS 1', ['10:00', '09:00'])
    await submit(wrapper)
    expect(byTestId(wrapper, 'lost-error').text()).toBe('Stop 1: pick where in the building.')

    // Fixing that clears it, without jumping to the next problem
    await byTestId(wrapper, 'lost-stop-spot-1').setValue('5')
    expect(byTestId(wrapper, 'lost-error').exists()).toBe(false)

    // The next problem shows on the next Continue
    await submit(wrapper)
    expect(byTestId(wrapper, 'lost-error').text()).toBe(
      'Stop 1: the end time must be after the start.',
    )
    expect(byTestId(wrapper, 'lost-step-count').text()).toBe('Step 2 of 3')
  })

  it('shows the message under the field it is about, with that field marked', async () => {
    const { wrapper } = await mountForm()
    await submit(wrapper)
    const category = byTestId(wrapper, 'lost-category')
    expect(category.attributes('aria-invalid')).toBe('true')
    // The message sits right under the category, not in the box above the buttons
    const message = byTestId(wrapper, 'lost-error')
    expect(message.text()).toBe('Pick a category.')
    expect(category.element.closest('.lost-field').contains(message.element)).toBe(true)
    expect(byTestId(wrapper, 'lost-title').attributes('aria-invalid')).toBeUndefined()

    // Fixed: the mark goes with the message
    await category.setValue('Water Bottle')
    expect(category.attributes('aria-invalid')).toBeUndefined()
  })

  it('marks the stop field a trail message is about', async () => {
    const { wrapper } = await mountForm()
    await fillWhat(wrapper)
    await byTestId(wrapper, 'lost-date').setValue('2026-10-08')
    await tapBuilding(wrapper, 'SCIS 1', ['10:00', '09:00'])
    await submit(wrapper)
    expect(byTestId(wrapper, 'lost-error').text()).toBe('Stop 1: pick where in the building.')
    expect(byTestId(wrapper, 'lost-stop-spot-1').attributes('aria-invalid')).toBe('true')
    expect(byTestId(wrapper, 'lost-stop-end-1').attributes('aria-invalid')).toBeUndefined()

    await byTestId(wrapper, 'lost-stop-spot-1').setValue('5')
    await submit(wrapper)
    expect(byTestId(wrapper, 'lost-stop-end-1').attributes('aria-invalid')).toBe('true')
    expect(byTestId(wrapper, 'lost-stop-spot-1').attributes('aria-invalid')).toBeUndefined()
  })

  it('does not swap in a new message when the category changes to Other', async () => {
    const { wrapper } = await mountForm()
    await submit(wrapper)
    expect(byTestId(wrapper, 'lost-error').text()).toBe('Pick a category.')

    // Picking Other fixes "Pick a category"; the empty name waits for Continue
    await byTestId(wrapper, 'lost-category').setValue('Other')
    expect(byTestId(wrapper, 'lost-error').exists()).toBe(false)
    await submit(wrapper)
    expect(byTestId(wrapper, 'lost-error').text()).toBe(
      'Say what it is, for example a silver ring.',
    )
  })

  it('does not show a message before Continue is pressed', async () => {
    const { wrapper } = await mountForm()
    await fillWhat(wrapper)
    await byTestId(wrapper, 'lost-date').setValue('2026-10-08')
    await tapBuilding(wrapper, 'SCIS 1', ['10:00', '09:00'])
    expect(byTestId(wrapper, 'lost-error').exists()).toBe(false)
  })
})

describe('LostReportView: the photo step', () => {
  it('has one button, which skips the step until a photo is added', async () => {
    isPhotoUploadEnabled.mockReturnValue(true)
    const { wrapper } = await mountForm()
    await fillWhat(wrapper)
    expect(byTestId(wrapper, 'lost-photo').exists()).toBe(true)
    expect(byTestId(wrapper, 'lost-photo-skip').exists()).toBe(false)
    expect(byTestId(wrapper, 'lost-next').text()).toBe('Skip the photo')

    await submit(wrapper)
    expect(byTestId(wrapper, 'lost-step-count').text()).toBe('Step 3 of 4')
    expect(byTestId(wrapper, 'lost-date').exists()).toBe(true)
  })
})

describe('LostReportView: a suspended account', () => {
  it('is told it cannot post, instead of being shown the form', async () => {
    const { wrapper } = await mountForm('/report/lost', {
      id: 7,
      name: 'Ben Lim',
      suspendedAt: '2026-10-20T00:00:00Z',
    })
    expect(byTestId(wrapper, 'lost-suspended').text()).toContain('suspended')
    expect(wrapper.find('form.lost-step').exists()).toBe(false)
    expect(byTestId(wrapper, 'lost-category').exists()).toBe(false)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows the form as usual to an account that is not suspended', async () => {
    const { wrapper } = await mountForm('/report/lost', {
      id: 7,
      name: 'Ben Lim',
      suspendedAt: null,
    })
    expect(byTestId(wrapper, 'lost-suspended').exists()).toBe(false)
    expect(byTestId(wrapper, 'lost-category').exists()).toBe(true)
  })
})

describe('LostReportView: loading', () => {
  it('says the form could not load in plain words and can try again', async () => {
    api.get.mockRejectedValue(new Error('Network Error'))
    const { wrapper } = await mountForm()
    expect(byTestId(wrapper, 'lost-load-error').text()).toContain('couldn’t load the form')
    expect(byTestId(wrapper, 'lost-load-error').text()).not.toContain('API')

    api.get.mockImplementation(async (url) => ({ data: lists[url] }))
    await byTestId(wrapper, 'lost-retry').trigger('click')
    await flushPromises()
    expect(byTestId(wrapper, 'lost-load-error').exists()).toBe(false)
    expect(byTestId(wrapper, 'lost-category').exists()).toBe(true)
  })
})

describe('LostReportView: leaving', () => {
  it('leaves an empty form without asking', async () => {
    const { wrapper, router } = await mountForm()
    await router.push('/feed')
    expect(byTestId(wrapper, 'leave-dialog').exists()).toBe(false)
    expect(router.currentRoute.value.path).toBe('/feed')
  })

  it('asks in its own dialog before throwing away what was filled in, and stays if told to', async () => {
    const { wrapper, router } = await mountForm()
    await byTestId(wrapper, 'lost-category').setValue('Water Bottle')
    const going = router.push('/feed')
    await flushPromises()
    // The browser's own OK / Cancel box is not used
    expect(window.confirm).not.toHaveBeenCalled()
    expect(byTestId(wrapper, 'leave-dialog').text()).toContain('Leave this report?')
    // Keep editing has focus, so Enter keeps the work
    expect(document.activeElement).toBe(byTestId(wrapper, 'leave-stay').element)

    await byTestId(wrapper, 'leave-stay').trigger('click')
    await going
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/report/lost')
    expect(byTestId(wrapper, 'leave-dialog').exists()).toBe(false)
  })

  it('leaves when the owner picks Leave', async () => {
    const { wrapper, router } = await mountForm()
    await byTestId(wrapper, 'lost-category').setValue('Water Bottle')
    const going = router.push('/feed')
    await flushPromises()
    await byTestId(wrapper, 'leave-go').trigger('click')
    await going
    expect(router.currentRoute.value.path).toBe('/feed')
  })

  it('keeps the work when Escape is pressed', async () => {
    const { wrapper, router } = await mountForm()
    await byTestId(wrapper, 'lost-category').setValue('Water Bottle')
    const going = router.push('/feed')
    await flushPromises()
    await wrapper.find('[role="alertdialog"]').trigger('keydown', { key: 'Escape' })
    await going
    expect(router.currentRoute.value.path).toBe('/report/lost')
  })

  it('leaves without asking once logged out, since the form can no longer be posted', async () => {
    const { wrapper, router } = await mountForm()
    await byTestId(wrapper, 'lost-category').setValue('Water Bottle')
    useAuthStore().logout()
    await router.push('/feed')
    expect(byTestId(wrapper, 'leave-dialog').exists()).toBe(false)
    expect(router.currentRoute.value.path).toBe('/feed')
  })

  it('warns before a refresh or closing the tab while something is filled in', async () => {
    const listen = vi.spyOn(window, 'addEventListener')
    const { wrapper } = await mountForm()
    const [, warn] = listen.mock.calls.find(([name]) => name === 'beforeunload')
    listen.mockRestore()
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true })
      warn(event)
      return event.defaultPrevented
    }
    expect(unload()).toBe(false)
    await byTestId(wrapper, 'lost-category').setValue('Water Bottle')
    expect(unload()).toBe(true)

    const unlisten = vi.spyOn(window, 'removeEventListener')
    wrapper.unmount()
    expect(unlisten).toHaveBeenCalledWith('beforeunload', warn)
    unlisten.mockRestore()
  })

  it('goes back to the page that sent the owner here, once posted', async () => {
    const { wrapper } = await mountForm('/report/lost?redirect=/items/7/dispute')
    await fillWhat(wrapper)
    await byTestId(wrapper, 'lost-date').setValue('2026-10-08')
    await tapBuilding(wrapper, 'LKCSB')
    await submit(wrapper)
    await submit(wrapper)
    await flushPromises()

    // Numbered the same way as on every other page
    expect(byTestId(wrapper, 'lost-posted').text()).toContain('0042')
    expect(byTestId(wrapper, 'lost-posted').text()).not.toContain('L-0042')
    const back = byTestId(wrapper, 'lost-return')
    expect(back.text()).toBe('Back to the dispute')
    expect(back.attributes('href')).toBe('/items/7/dispute')
  })

  it('never sends the owner to another site', async () => {
    const { wrapper } = await mountForm('/report/lost?redirect=//example.com')
    await fillWhat(wrapper)
    await byTestId(wrapper, 'lost-date').setValue('2026-10-08')
    await tapBuilding(wrapper, 'LKCSB')
    await submit(wrapper)
    await submit(wrapper)
    await flushPromises()
    expect(byTestId(wrapper, 'lost-return').exists()).toBe(false)
  })
})
