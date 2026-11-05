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
  isPhotoUploadEnabled: vi.fn(() => true),
  checkPhoto: vi.fn(() => null),
  uploadPhoto: vi.fn(),
  resizedPhotoUrl: vi.fn((url, width) => `${url}?w=${width}`),
}))

import api from '@/api'
import { isPhotoUploadEnabled, checkPhoto, uploadPhoto } from '@/services/cloudinary'
import FoundReportView from '../FoundReportView.vue'
import { useAuthStore } from '@/stores/auth'

const lists = {
  '/categories': [
    { name: 'Other', related: [] },
    { name: 'Water Bottle', related: [] },
    { name: 'Umbrella', related: [] },
  ],
  '/colours': [
    { name: 'Navy', hex: '#1f2a5a', related: [] },
    { name: 'Black', hex: '#1a1a1a', related: [] },
    { name: 'White', hex: '#ffffff', related: [] },
    { name: 'Silver', hex: '#c0c0c0', related: [] },
  ],
  '/spots': [
    { id: 5, building: 'SCIS 1', floor: 'Level 2', area: 'lift lobby' },
    { id: 6, building: 'SCIS 1', floor: 'Level 2', area: 'seminar rooms' },
    { id: 4, building: 'SCIS 1', floor: 'Level 1', area: 'lobby' },
    { id: 16, building: 'LKCSB', floor: 'Basement 1', area: 'group study rooms' },
    {
      id: 20,
      building: 'Administration Building',
      floor: 'Level 1',
      area: 'lobby security counter',
    },
  ],
}

const photoUrl = 'https://res.cloudinary.com/demo/image/upload/v1/bottle.jpg'
const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)
const itemPost = () => api.post.mock.calls.find(([path]) => path === '/items')

async function mountForm(user = null) {
  setActivePinia(createPinia())
  if (user) {
    const auth = useAuthStore()
    auth.token = 'abc'
    auth.user = user
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/report', component: { template: '<div />' } },
      { path: '/report/found', component: FoundReportView },
      { path: '/items/:id/record', component: { template: '<div />' } },
    ],
  })
  router.push('/report/found')
  await router.isReady()
  const wrapper = mount(FoundReportView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

const submit = (wrapper) => byTestId(wrapper, 'report-form').trigger('submit')
// Tapping a colour swatch picks it, or un-picks it when it is already picked
const tapColour = (wrapper, name) => byTestId(wrapper, `report-colour-${name}`).trigger('change')
const pickedColours = (wrapper) =>
  wrapper
    .findAll('input[data-testid^="report-colour-"]')
    .filter((input) => input.element.checked)
    .map((input) => input.element.value)

async function skipPhoto(wrapper) {
  await submit(wrapper)
}

async function fillDetails(wrapper) {
  await byTestId(wrapper, 'report-category').setValue('Water Bottle')
  await tapColour(wrapper, 'Navy')
  await byTestId(wrapper, 'report-brand').setValue('Hydro Flask')
  await byTestId(wrapper, 'report-description').setValue('On a bench outside room 2-4')
  await submit(wrapper)
}

async function fillWhere(wrapper) {
  await byTestId(wrapper, 'map-tile-SCIS 1').trigger('click')
  await byTestId(wrapper, 'report-level').setValue('Level 2')
  await byTestId(wrapper, 'report-facility').setValue('5')
  await byTestId(wrapper, 'report-date').setValue('2026-10-08')
  await byTestId(wrapper, 'report-time').setValue('10:00')
}

async function choose(wrapper, name = 'IMG_2041.jpg') {
  const input = byTestId(wrapper, 'report-photo-input')
  const file = new File(['x'], name, { type: 'image/jpeg' })
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}

function answerWith({ suggestions = { category: null, colour: null, brand: null }, item } = {}) {
  api.post.mockImplementation(async (path) => {
    if (path === '/vision/suggest') {
      if (suggestions instanceof Error) throw suggestions
      return { data: suggestions }
    }
    return { data: item || { item: { id: 81, title: 'Item' }, matches: [] } }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Use the drawn campus map (clickable tiles), even when a Mapbox token is set
  vi.stubEnv('VITE_MAPBOX_TOKEN', '')
  isPhotoUploadEnabled.mockReturnValue(true)
  checkPhoto.mockReturnValue(null)
  uploadPhoto.mockResolvedValue(photoUrl)
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview')
  globalThis.URL.revokeObjectURL = vi.fn()
  globalThis.scrollTo = vi.fn()
  api.get.mockImplementation(async (url) => ({ data: lists[url] }))
  answerWith()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('FoundReportView: steps', () => {
  it('starts with an optional photo, as step 1 of 3, and no hidden question', async () => {
    const { wrapper } = await mountForm()
    expect(byTestId(wrapper, 'report-photo').exists()).toBe(true)
    expect(byTestId(wrapper, 'report-photo-add').exists()).toBe(true)
    expect(byTestId(wrapper, 'report-next').text()).toBe('Skip the photo')
    expect(wrapper.find('[data-testid="report-claim-question"]').exists()).toBe(false)
    // Back from the photo goes to the "What happened?" page
    expect(byTestId(wrapper, 'report-back').text()).toBe('Back')
    expect(byTestId(wrapper, 'report-back').attributes('href')).toBe('/report')
  })

  it('leaves the photo step out until Cloudinary is set up', async () => {
    isPhotoUploadEnabled.mockReturnValue(false)
    const { wrapper } = await mountForm()
    expect(byTestId(wrapper, 'report-category').exists()).toBe(true)
    expect(byTestId(wrapper, 'report-photo').exists()).toBe(false)
    expect(byTestId(wrapper, 'report-category').exists()).toBe(true)
    // Back from the first step goes to the Report choice screen
    expect(byTestId(wrapper, 'report-back').attributes('href')).toBe('/report')
  })

  it('needs a category before where and when', async () => {
    const { wrapper } = await mountForm()
    await skipPhoto(wrapper)
    expect(byTestId(wrapper, 'report-category').exists()).toBe(true)
    expect(byTestId(wrapper, 'report-details-lede').text()).toBe('Tell us what it is.')
    await submit(wrapper)
    expect(byTestId(wrapper, 'report-error').text()).toBe('Pick a category.')
    expect(byTestId(wrapper, 'report-category').exists()).toBe(true)
  })

  it('shows a problem under its field, marked for screen readers, until the field changes', async () => {
    const { wrapper } = await mountForm()
    await skipPhoto(wrapper)
    await submit(wrapper)
    const category = byTestId(wrapper, 'report-category')
    // Under the category, not by the Continue button
    expect(
      category.element.closest('.found-field').querySelector('#report-category-error').textContent,
    ).toContain('Pick a category.')
    expect(wrapper.findAll('[data-testid="report-error"]')).toHaveLength(1)
    expect(category.attributes('aria-invalid')).toBe('true')
    expect(category.attributes('aria-errormessage')).toBe('report-category-error')
    await category.setValue('Water Bottle')
    expect(byTestId(wrapper, 'report-error').exists()).toBe(false)
    expect(category.attributes('aria-invalid')).toBeUndefined()
  })

  it('asks before leaving a report that has something filled in, and stays if told to', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    setActivePinia(createPinia())
    useAuthStore().token = 'abc'
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/report', component: { template: '<div />' } },
        { path: '/report/found', component: FoundReportView },
      ],
    })
    router.push('/report/found')
    await router.isReady()
    // Through RouterView, as in the app, so the page can stop the router leaving
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
    await flushPromises()

    await skipPhoto(wrapper)
    await byTestId(wrapper, 'report-category').setValue('Water Bottle')
    await router.push('/report')
    expect(confirm).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.path).toBe('/report/found')

    // Told to leave: it goes
    confirm.mockReturnValue(true)
    await router.push('/report')
    expect(router.currentRoute.value.path).toBe('/report')
    confirm.mockRestore()
  })

  it('leaves without asking once logged out, since the form can no longer be posted', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.token = 'abc'
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/login', component: { template: '<div />' } },
        { path: '/report/found', component: FoundReportView },
      ],
    })
    router.push('/report/found')
    await router.isReady()
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
    await flushPromises()

    await skipPhoto(wrapper)
    await byTestId(wrapper, 'report-category').setValue('Water Bottle')
    auth.logout()
    await router.push('/login')
    expect(confirm).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/login')
    confirm.mockRestore()
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
    await skipPhoto(wrapper)
    await byTestId(wrapper, 'report-category').setValue('Water Bottle')
    expect(unload()).toBe(true)

    const unlisten = vi.spyOn(window, 'removeEventListener')
    wrapper.unmount()
    expect(unlisten).toHaveBeenCalledWith('beforeunload', warn)
    unlisten.mockRestore()
  })

  it('leaves without asking when nothing is filled in', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    setActivePinia(createPinia())
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/report', component: { template: '<div />' } },
        { path: '/report/found', component: FoundReportView },
      ],
    })
    router.push('/report/found')
    await router.isReady()
    mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
    await flushPromises()
    await router.push('/report')
    expect(confirm).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/report')
    confirm.mockRestore()
  })

  it('suggests an item name from the details until the finder types their own', async () => {
    const { wrapper } = await mountForm()
    await skipPhoto(wrapper)
    await byTestId(wrapper, 'report-category').setValue('Water Bottle')
    await tapColour(wrapper, 'Navy')
    expect(byTestId(wrapper, 'report-title').element.value).toBe('Navy water bottle')
    await byTestId(wrapper, 'report-brand').setValue('Hydro Flask')
    expect(byTestId(wrapper, 'report-title').element.value).toBe('Navy Hydro Flask water bottle')

    await byTestId(wrapper, 'report-title').setValue('Navy Hydro Flask, 750 ml')
    await tapColour(wrapper, 'Black')
    expect(byTestId(wrapper, 'report-title').element.value).toBe('Navy Hydro Flask, 750 ml')
  })

  it('asks for the category before the item name', async () => {
    const { wrapper } = await mountForm()
    await skipPhoto(wrapper)
    const ids = wrapper
      .findAll('[data-testid="report-category"], [data-testid="report-title"]')
      .map((field) => field.attributes('data-testid'))
    expect(ids).toEqual(['report-category', 'report-title'])
    expect(byTestId(wrapper, 'report-title').attributes('placeholder')).toBe(
      'Filled in from the category and colour',
    )
  })

  it('lists the categories A to Z with Other last', async () => {
    const { wrapper } = await mountForm()
    await skipPhoto(wrapper)
    const names = byTestId(wrapper, 'report-category')
      .findAll('option')
      .map((option) => option.text())
    expect(names).toEqual(['Pick one', 'Umbrella', 'Water Bottle', 'Other'])
  })

  it('asks what it is for Other, and needs a name typed in', async () => {
    const { wrapper } = await mountForm()
    await skipPhoto(wrapper)
    await byTestId(wrapper, 'report-category').setValue('Other')
    const title = byTestId(wrapper, 'report-title')
    expect(title.element.value).toBe('')
    expect(title.attributes('placeholder')).toBe('For example, a silver ring')
    expect(wrapper.find('label[for="report-title"]').text()).toBe('What is it?')
    await submit(wrapper)
    expect(byTestId(wrapper, 'report-error').text()).toBe(
      'Say what it is, for example a silver ring.',
    )
    await title.setValue('Silver ring')
    await submit(wrapper)
    expect(byTestId(wrapper, 'report-building').exists()).toBe(true)
  })

  it('picks up to 3 colours in order, and un-picks one tapped again', async () => {
    const { wrapper } = await mountForm()
    await skipPhoto(wrapper)
    const hint = () => byTestId(wrapper, 'report-colour-hint').text()
    expect(hint()).toBe('Pick up to 3, starting with the main colour. Not sure? Leave it blank.')
    await tapColour(wrapper, 'Navy')
    expect(hint()).toBe('Main colour: Navy. Add up to 2 more if it has other colours.')
    await tapColour(wrapper, 'White')
    expect(hint()).toBe('Main colour: Navy, with White. You can add 1 more.')
    await tapColour(wrapper, 'Black')
    expect(pickedColours(wrapper)).toEqual(['Navy', 'Black', 'White'])
    // Each picked chip shows the order it was picked in: Navy is the main colour
    const order = (name) =>
      byTestId(wrapper, `report-colour-${name}`)
        .element.closest('label')
        .querySelector('.colour-swatch__order')
        ?.textContent.trim()
    expect(order('Navy')).toBe('1')
    expect(order('White')).toBe('2')
    expect(order('Black')).toBe('3')
    expect(order('Silver')).toBeUndefined()
    expect(byTestId(wrapper, 'report-colour-hint').text()).toBe(
      'Main colour: Navy, with White and Black. That’s the most. Tap one to remove it.',
    )
    // A fourth cannot be picked until one is taken off
    expect(byTestId(wrapper, 'report-colour-Silver').attributes('disabled')).toBeDefined()
    await tapColour(wrapper, 'Navy')
    expect(pickedColours(wrapper)).toEqual(['Black', 'White'])
    expect(byTestId(wrapper, 'report-colour-Silver').attributes('disabled')).toBeUndefined()
  })

  it('keeps the details when going back a step', async () => {
    const { wrapper } = await mountForm()
    await skipPhoto(wrapper)
    await fillDetails(wrapper)
    expect(byTestId(wrapper, 'report-building').exists()).toBe(true)
    await byTestId(wrapper, 'report-back').trigger('click')
    expect(byTestId(wrapper, 'report-brand').element.value).toBe('Hydro Flask')
    expect(byTestId(wrapper, 'report-leave-out-hint').text()).toBe(
      'Leave out one detail only the owner would know. You can ask about it in chat.',
    )
  })
})

describe('FoundReportView: where and when', () => {
  async function toWhere() {
    const mounted = await mountForm()
    await skipPhoto(mounted.wrapper)
    await fillDetails(mounted.wrapper)
    return mounted
  }

  const options = (wrapper, id) =>
    byTestId(wrapper, id)
      .findAll('option')
      .map((o) => o.text())

  it('narrows down by building, level, then facility', async () => {
    const { wrapper } = await toWhere()
    // Buildings use their short names, as on the map, A to Z
    expect(options(wrapper, 'report-building')).toEqual([
      'Tap the map or pick one',
      'Admin Bldg',
      'LKCSB',
      'SCIS 1',
    ])
    expect(byTestId(wrapper, 'report-level').attributes('disabled')).toBeDefined()
    expect(byTestId(wrapper, 'report-facility').attributes('disabled')).toBeDefined()

    await byTestId(wrapper, 'map-tile-SCIS 1').trigger('click')
    expect(byTestId(wrapper, 'report-building').element.value).toBe('SCIS 1')
    expect(options(wrapper, 'report-level')).toEqual(['Pick one', 'Level 1', 'Level 2'])
    expect(options(wrapper, 'report-facility')).toEqual(['Pick the level first'])

    await byTestId(wrapper, 'report-level').setValue('Level 2')
    expect(options(wrapper, 'report-facility')).toEqual(['Pick one', 'Lift Lobby', 'Seminar Rooms'])
    expect(byTestId(wrapper, 'report-facility').element.value).toBe('')

    // A level with one facility has it picked for you
    await byTestId(wrapper, 'report-level').setValue('Level 1')
    expect(byTestId(wrapper, 'report-facility').element.value).toBe('4')

    // A building with one level and one facility has both picked for you
    await byTestId(wrapper, 'report-building').setValue('LKCSB')
    expect(byTestId(wrapper, 'report-level').element.value).toBe('Basement 1')
    expect(byTestId(wrapper, 'report-facility').element.value).toBe('16')
  })

  it('asks for the level, then the facility, before posting', async () => {
    const { wrapper } = await toWhere()
    await byTestId(wrapper, 'map-tile-SCIS 1').trigger('click')
    await submit(wrapper)
    expect(byTestId(wrapper, 'report-error').text()).toBe('Pick the level in SCIS 1.')
    await byTestId(wrapper, 'report-level').setValue('Level 2')
    await submit(wrapper)
    expect(byTestId(wrapper, 'report-error').text()).toBe('Pick the facility on Level 2 of SCIS 1.')
    expect(itemPost()).toBeUndefined()
  })

  it('posts the facility picked as the spot', async () => {
    answerWith()
    const { wrapper } = await toWhere()
    await fillWhere(wrapper)
    await byTestId(wrapper, 'report-facility').setValue('6')
    await submit(wrapper)
    await flushPromises()
    expect(itemPost()[1].trail[0].spotId).toBe(6)
  })

  it('posts a found item with its name and one trail point, then shows the matches', async () => {
    answerWith({
      item: {
        item: {
          id: 81,
          title: 'Navy Hydro Flask water bottle',
          category: 'Water Bottle',
          colours: ['Navy'],
        },
        matches: [{ id: 3, score: 87.5, reasons: ['same category', 'same floor'] }],
      },
    })
    const { wrapper } = await toWhere()
    await fillWhere(wrapper)
    await submit(wrapper)
    await flushPromises()

    const when = new Date('2026-10-08T10:00+08:00').toISOString()
    expect(itemPost()[1]).toEqual({
      type: 'found',
      title: 'Navy Hydro Flask water bottle',
      description: 'On a bench outside room 2-4',
      category: 'Water Bottle',
      colours: ['Navy'],
      brand: 'Hydro Flask',
      trail: [{ spotId: 5, from: when, to: when }],
    })
    expect(byTestId(wrapper, 'report-success').text()).toContain('Navy Hydro Flask water bottle')
    // With no photo, the drawing is in the item's main colour
    expect(byTestId(wrapper, 'report-success').find('svg').element.style.color).toBe(
      'rgb(31, 42, 90)',
    )
    // One line about the lost reports it looks like, rather than a list of scores
    expect(byTestId(wrapper, 'report-matches').text()).toBe(
      '1 lost report looks like this. Its owner will see it in their matches.',
    )
    expect(byTestId(wrapper, 'report-view-record').attributes('href')).toBe('/items/81/record')
  })

  it('shows the error the API sends back', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'Pick a colour from the list' } } })
    const { wrapper } = await toWhere()
    await fillWhere(wrapper)
    await submit(wrapper)
    await flushPromises()
    expect(byTestId(wrapper, 'report-error').text()).toBe('Pick a colour from the list')
  })

  it('starts again from step 1 after "Report another item"', async () => {
    const { wrapper } = await toWhere()
    await fillWhere(wrapper)
    await submit(wrapper)
    await flushPromises()
    expect(byTestId(wrapper, 'report-no-matches').exists()).toBe(true)
    await byTestId(wrapper, 'report-another').trigger('click')
    expect(byTestId(wrapper, 'report-photo').exists()).toBe(true)
    await skipPhoto(wrapper)
    expect(byTestId(wrapper, 'report-category').element.value).toBe('')
    expect(byTestId(wrapper, 'report-title').element.value).toBe('')
  })

  it('shows a message when the lists cannot be loaded, and tries again', async () => {
    const offline = new Error('Network Error')
    api.get
      .mockRejectedValueOnce(offline)
      .mockRejectedValueOnce(offline)
      .mockRejectedValueOnce(offline)
    const { wrapper } = await mountForm()
    expect(byTestId(wrapper, 'report-load-error').text()).toContain(
      'We couldn’t load the form. Check your connection and try again.',
    )
    await byTestId(wrapper, 'report-retry').trigger('click')
    await flushPromises()
    expect(byTestId(wrapper, 'report-load-error').exists()).toBe(false)
    expect(byTestId(wrapper, 'report-form').exists()).toBe(true)
  })
})

describe('FoundReportView: photo', () => {
  it('uploads one photo, shows it, and posts its link', async () => {
    let finish
    uploadPhoto.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { wrapper } = await mountForm()
    await choose(wrapper)
    expect(byTestId(wrapper, 'report-photo-preview').attributes('src')).toBe('blob:preview')
    expect(byTestId(wrapper, 'report-photo-name').text()).toBe('IMG_2041.jpg')
    expect(byTestId(wrapper, 'report-photo-status').text()).toBe('Uploading…')
    expect(byTestId(wrapper, 'report-next').attributes('disabled')).toBeDefined()

    finish(photoUrl)
    await flushPromises()
    expect(byTestId(wrapper, 'report-photo-status').text()).toBe('Photo added')
    expect(byTestId(wrapper, 'report-next').text()).toBe('Continue')

    await submit(wrapper)
    await fillDetails(wrapper)
    await fillWhere(wrapper)
    await submit(wrapper)
    await flushPromises()
    expect(itemPost()[1].photoUrl).toBe(photoUrl)
  })

  it('takes a photo dropped on the box', async () => {
    const { wrapper } = await mountForm()
    const file = new File(['x'], 'dropped.jpg', { type: 'image/jpeg' })
    await wrapper.find('.found-drop').trigger('drop', { dataTransfer: { files: [file] } })
    await flushPromises()
    expect(uploadPhoto).toHaveBeenCalledWith(file, expect.anything())
    expect(byTestId(wrapper, 'report-photo-name').text()).toBe('dropped.jpg')
  })

  it('can remove the photo and go on without one', async () => {
    const { wrapper } = await mountForm()
    await choose(wrapper)
    await flushPromises()
    await byTestId(wrapper, 'report-photo-remove').trigger('click')
    expect(byTestId(wrapper, 'report-photo-add').exists()).toBe(true)
    expect(byTestId(wrapper, 'report-next').text()).toBe('Skip the photo')
  })

  it('shows why a file was refused, without uploading it', async () => {
    checkPhoto.mockReturnValue('Choose a photo smaller than 10 MB.')
    const { wrapper } = await mountForm()
    await choose(wrapper)
    expect(byTestId(wrapper, 'report-photo-error').text()).toBe(
      'Choose a photo smaller than 10 MB.',
    )
    expect(uploadPhoto).not.toHaveBeenCalled()
  })
})

describe('FoundReportView: suggestions from the photo (V05.2)', () => {
  const suggestions = {
    category: { value: 'Water Bottle', confidence: 96 },
    colour: { value: 'Navy', confidence: 88 },
    brand: { value: 'Hydro Flask', confidence: 61 },
  }

  async function withSuggestions(answer = suggestions) {
    answerWith({ suggestions: answer })
    const mounted = await mountForm()
    await choose(mounted.wrapper)
    await flushPromises()
    await submit(mounted.wrapper)
    return mounted
  }

  it('fills the fields from the photo and marks how sure it was', async () => {
    const { wrapper } = await withSuggestions()
    expect(api.post).toHaveBeenCalledWith('/vision/suggest', { photoUrl })
    expect(byTestId(wrapper, 'report-details-lede').text()).toBe(
      'We filled these in from your photo. Fix anything that’s off.',
    )
    expect(byTestId(wrapper, 'report-category').element.value).toBe('Water Bottle')
    expect(pickedColours(wrapper)).toEqual(['Navy'])
    expect(byTestId(wrapper, 'report-badge-colour').text()).toBe('From photo')
    expect(byTestId(wrapper, 'report-brand').element.value).toBe('Hydro Flask')
    expect(byTestId(wrapper, 'report-badge-category').text()).toBe('From photo')
    expect(byTestId(wrapper, 'report-badge-brand').text()).toBe('Unsure')
    expect(byTestId(wrapper, 'report-title').element.value).toBe('Navy Hydro Flask water bottle')
  })

  it('drops the label once the finder changes a field', async () => {
    const { wrapper } = await withSuggestions()
    await tapColour(wrapper, 'Navy')
    await tapColour(wrapper, 'Black')
    expect(byTestId(wrapper, 'report-badge-colour').exists()).toBe(false)
    expect(byTestId(wrapper, 'report-badge-category').exists()).toBe(true)
  })

  it('empties what the old photo suggested when the photo is replaced', async () => {
    const { wrapper } = await withSuggestions()
    await tapColour(wrapper, 'Navy')
    await tapColour(wrapper, 'Black')
    await byTestId(wrapper, 'report-back').trigger('click')
    answerWith()
    await choose(wrapper, 'other.jpg')
    await flushPromises()
    await submit(wrapper)
    // Suggested and untouched: emptied. Changed by the finder: kept.
    expect(byTestId(wrapper, 'report-category').element.value).toBe('')
    expect(pickedColours(wrapper)).toEqual(['Black'])
  })

  it('shows the plain fields when Vision cannot read the photo', async () => {
    const { wrapper } = await withSuggestions(
      Object.assign(new Error('500'), { response: { status: 500 } }),
    )
    expect(byTestId(wrapper, 'report-details-lede').text()).toBe('Tell us what it is.')
    expect(byTestId(wrapper, 'report-category').element.value).toBe('')
    expect(byTestId(wrapper, 'report-badge-category').exists()).toBe(false)
  })
})

describe('FoundReportView: a suspended account', () => {
  it('is told it cannot post, instead of being shown the form', async () => {
    const { wrapper } = await mountForm({
      id: 7,
      name: 'Ben Lim',
      suspendedAt: '2026-10-20T00:00:00Z',
    })
    expect(byTestId(wrapper, 'report-suspended').text()).toContain('suspended')
    expect(byTestId(wrapper, 'report-form').exists()).toBe(false)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows the form as usual to an account that is not suspended', async () => {
    const { wrapper } = await mountForm({ id: 7, name: 'Ben Lim', suspendedAt: null })
    expect(byTestId(wrapper, 'report-suspended').exists()).toBe(false)
    expect(byTestId(wrapper, 'report-form').exists()).toBe(true)
  })
})
