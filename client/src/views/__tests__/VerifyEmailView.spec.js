import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({ TOKEN_KEY: 'foundit_token', default: { get: vi.fn(), post: vi.fn() } }))
const push = vi.fn()
const routeQuery = { value: {} }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query: routeQuery.value }),
  RouterLink: { template: '<a><slot /></a>' },
}))

import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import VerifyEmailView from '../VerifyEmailView.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)
const verifiedSession = (role = 'user') => ({
  data: {
    token: 'fresh',
    user: { id: 1, email: 'alice.tan.2025@smu.edu.sg', role, emailVerifiedAt: '2026-10-15' },
  },
})

// Logged out, sent here by the register page with ?email=
function mountPage(query = {}) {
  routeQuery.value = { email: 'alice.tan.2025@smu.edu.sg', ...query }
  return mount(VerifyEmailView, { global: { stubs: { RouterLink: true } } })
}

async function enterCode(wrapper, code = '123456') {
  await byTestId(wrapper, 'verify-code').setValue(code)
  await byTestId(wrapper, 'verify-form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setActivePinia(createPinia())
  routeQuery.value = {}
})

afterEach(() => {
  vi.useRealTimers()
})

describe('VerifyEmailView', () => {
  it('shows where the code was sent, logged out, from the address in the link', () => {
    const wrapper = mountPage()
    expect(byTestId(wrapper, 'verify-email-address').text()).toBe('alice.tan.2025@smu.edu.sg')
    expect(byTestId(wrapper, 'verify-email-input').exists()).toBe(false)
    // Nobody is signed in, so there is nobody to log out
    expect(byTestId(wrapper, 'verify-logout').exists()).toBe(false)
    expect(byTestId(wrapper, 'verify-go-login').exists()).toBe(true)
  })

  it('uses the address of an older account that is signed in without its code', () => {
    const auth = useAuthStore()
    auth.token = 'old'
    auth.user = { id: 1, email: 'ben.lim.2024@smu.edu.sg', emailVerifiedAt: null }
    const wrapper = mount(VerifyEmailView, { global: { stubs: { RouterLink: true } } })
    expect(byTestId(wrapper, 'verify-email-address').text()).toBe('ben.lim.2024@smu.edu.sg')
    expect(byTestId(wrapper, 'verify-logout').exists()).toBe(true)
  })

  it('asks for the address when it does not know it, and checks it is an SMU one', async () => {
    const wrapper = mount(VerifyEmailView, { global: { stubs: { RouterLink: true } } })
    const input = byTestId(wrapper, 'verify-email-input')
    expect(input.exists()).toBe(true)
    await input.setValue('alice@gmail.com')
    await enterCode(wrapper)
    expect(wrapper.text()).toContain('Use your SMU email, ending in smu.edu.sg.')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('lets the person change an address they did not mean', async () => {
    const wrapper = mountPage()
    await byTestId(wrapper, 'verify-email-change').trigger('click')
    const input = byTestId(wrapper, 'verify-email-input')
    expect(input.element.value).toBe('alice.tan.2025@smu.edu.sg')
    await input.setValue('alice.tan.2026@smu.edu.sg')
    await byTestId(wrapper, 'verify-password').setValue('password123')
    api.post.mockResolvedValue(verifiedSession())
    await enterCode(wrapper)
    expect(api.post).toHaveBeenCalledWith('/auth/verify-email', {
      email: 'alice.tan.2026@smu.edu.sg',
      code: '123456',
      password: 'password123',
    })
  })

  it('asks for the password only when the register or sign-in page did not pass it on', async () => {
    expect(byTestId(mountPage(), 'verify-password').exists()).toBe(true)
    const auth = useAuthStore()
    auth.pendingPassword = 'password123'
    expect(byTestId(mountPage(), 'verify-password').exists()).toBe(false)
  })

  it('says why when the sign-in page sent the person here', () => {
    expect(byTestId(mountPage({ from: 'sign-in' }), 'verify-reason').text()).toMatch(
      /finished signing up/,
    )
    expect(byTestId(mountPage(), 'verify-reason').exists()).toBe(false)
  })

  it('says so when the code email could not be sent, in words for the user', async () => {
    const auth = useAuthStore()
    auth.codeSent = false
    const wrapper = mountPage()
    expect(byTestId(wrapper, 'verify-email-failed').text()).toMatch(/could not email the code/)
  })

  it('links to the feed so the user can look around first', () => {
    expect(byTestId(mountPage(), 'verify-browse').exists()).toBe(true)
  })

  it('signs in with the code and goes on to the page the user wanted', async () => {
    api.post.mockResolvedValue(verifiedSession())
    useAuthStore().pendingPassword = 'password123'
    const wrapper = mountPage({ redirect: '/report' })
    await enterCode(wrapper, ' 123456 ')

    expect(api.post).toHaveBeenCalledWith('/auth/verify-email', {
      email: 'alice.tan.2025@smu.edu.sg',
      code: '123456',
      password: 'password123',
    })
    const auth = useAuthStore()
    expect(auth.isLoggedIn).toBe(true)
    expect(auth.isVerified).toBe(true)
    expect(localStorage.getItem('foundit_token')).toBe('fresh')
    expect(push).toHaveBeenCalledWith('/report')
  })

  it('goes to the usual landing page without a redirect, and never to another site', async () => {
    api.post.mockResolvedValue(verifiedSession())
    await enterCode(mountPage())
    expect(push).toHaveBeenLastCalledWith('/feed')

    setActivePinia(createPinia())
    await enterCode(mountPage({ redirect: '//evil.example.com' }))
    expect(push).toHaveBeenLastCalledWith('/feed')

    setActivePinia(createPinia())
    api.post.mockResolvedValue(verifiedSession('admin'))
    await enterCode(mountPage({ redirect: '/verify-email' }))
    expect(push).toHaveBeenLastCalledWith('/admin')
  })

  it('shows the API message for a wrong code and stays logged out', async () => {
    api.post.mockRejectedValue({
      response: { status: 400, data: { error: 'That code is wrong or has expired.' } },
    })
    const wrapper = mountPage()
    await enterCode(wrapper, '000000')
    expect(byTestId(wrapper, 'verify-error').text()).toBe('That code is wrong or has expired.')
    expect(push).not.toHaveBeenCalled()
    expect(useAuthStore().isLoggedIn).toBe(false)
  })

  it('asks for a new code, shows the server message, then rests the button', async () => {
    vi.useFakeTimers()
    api.post.mockResolvedValueOnce({
      data: { message: 'If that email is waiting for its code, we sent a new one.' },
    })
    const wrapper = mountPage()
    await byTestId(wrapper, 'verify-resend').trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/auth/resend-code', {
      email: 'alice.tan.2025@smu.edu.sg',
    })
    expect(byTestId(wrapper, 'verify-notice').text()).toBe(
      'If that email is waiting for its code, we sent a new one.',
    )
    expect(byTestId(wrapper, 'verify-resend').attributes('disabled')).toBeDefined()

    vi.advanceTimersByTime(30000)
    await flushPromises()
    expect(byTestId(wrapper, 'verify-resend').attributes('disabled')).toBeUndefined()
  })

  it('shows the server message when asking for codes too often', async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 429, data: { error: 'Too many tries. Wait a few minutes.' } },
    })
    const wrapper = mountPage()
    await byTestId(wrapper, 'verify-resend').trigger('click')
    await flushPromises()
    expect(byTestId(wrapper, 'verify-error').text()).toBe('Too many tries. Wait a few minutes.')
  })
})
