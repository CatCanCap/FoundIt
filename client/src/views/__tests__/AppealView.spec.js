import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({ TOKEN_KEY: 'foundit_token', default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/services/cloudinary', () => ({
  PHOTO_HINT: 'JPG, PNG, WebP or HEIC, up to 10 MB.',
  isPhotoUploadEnabled: () => false,
  uploadPhoto: vi.fn(),
}))

// The page's leave guard is caught here, so the tests can call it
let leaveGuard = null
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/appeal', meta: {} }),
  useRouter: () => ({ push: vi.fn() }),
  onBeforeRouteLeave: (guard) => {
    leaveGuard = guard
  },
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}))

import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import AppealView from '../AppealView.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)
const suspension = { suspendedAt: '2026-11-01T13:13:00.000Z', reason: 'Asked for payment in chat' }

async function mountWith(data) {
  api.get.mockResolvedValue({ data })
  const wrapper = mount(AppealView, {
    global: { stubs: { AppHeader: true, AppFooter: true } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  leaveGuard = null
  localStorage.clear()
  useAuthStore().user = { id: 7, name: 'Sam Lee', suspendedAt: suspension.suspendedAt }
})

describe('AppealView', () => {
  it('shows why the account was suspended, and sends one appeal', async () => {
    const wrapper = await mountWith({ suspension, appeal: null, canAppeal: true })
    expect(api.get).toHaveBeenCalledWith('/appeals/mine')
    expect(byTestId(wrapper, 'appeal-title').text()).toBe('Appeal your suspension')
    expect(byTestId(wrapper, 'appeal-reason').text()).toContain('Asked for payment in chat')
    expect(byTestId(wrapper, 'appeal-send').attributes('disabled')).toBeDefined()

    await byTestId(wrapper, 'appeal-message').setValue('  I only asked about the bus fare.  ')
    api.post.mockResolvedValue({
      data: {
        id: 3,
        status: 'open',
        message: 'I only asked about the bus fare.',
        createdAt: '2026-11-03T02:00:00.000Z',
      },
    })
    await byTestId(wrapper, 'appeal-form').trigger('submit')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/appeals', {
      message: 'I only asked about the bus fare.',
    })
    expect(byTestId(wrapper, 'appeal-title').text()).toBe('Your appeal')
    expect(byTestId(wrapper, 'appeal-sent').text()).toContain('I only asked about the bus fare.')
    expect(localStorage.getItem('foundit_appeal_waiting')).toBe('3')
  })

  it('asks before leaving a half-written appeal, and not otherwise', async () => {
    const wrapper = await mountWith({ suspension, appeal: null, canAppeal: true })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    expect(leaveGuard()).toBe(true)
    expect(confirm).not.toHaveBeenCalled()

    await byTestId(wrapper, 'appeal-message').setValue('Half a thought')
    expect(leaveGuard()).toBe(false)
    expect(confirm.mock.calls[0][0]).toContain('what you wrote will be lost')

    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    confirm.mockRestore()
  })

  it('shows the admin reply once decided', async () => {
    const wrapper = await mountWith({
      suspension,
      canAppeal: false,
      appeal: {
        id: 3,
        status: 'declined',
        message: 'I only asked about the bus fare.',
        reply: 'The chat shows it twice.',
        createdAt: '2026-11-03T02:00:00.000Z',
        decidedAt: '2026-11-04T02:00:00.000Z',
      },
    })
    expect(byTestId(wrapper, 'appeal-reply').text()).toContain('Declined 4 Nov')
    expect(byTestId(wrapper, 'appeal-reply').text()).toContain('The chat shows it twice.')
    expect(byTestId(wrapper, 'appeal-form').exists()).toBe(false)
  })

  it('says when there is nothing to appeal', async () => {
    useAuthStore().user = { id: 7, name: 'Sam Lee', suspendedAt: null }
    const wrapper = await mountWith({ suspension: null, appeal: null, canAppeal: false })
    expect(byTestId(wrapper, 'appeal-none').text()).toContain('nothing to appeal')
  })
})
