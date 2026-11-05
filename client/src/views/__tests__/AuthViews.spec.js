import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({ TOKEN_KEY: 'foundit_token', default: { get: vi.fn(), post: vi.fn() } }))
const push = vi.fn()
const routeQuery = { value: {} }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query: routeQuery.value }),
  RouterLink: {
    props: ['to'],
    computed: {
      // A string, or { path, query } turned into "/register?redirect=%2Freport"
      href() {
        if (typeof this.to === 'string') return this.to
        const query = new URLSearchParams(this.to.query || {}).toString()
        return query ? `${this.to.path}?${query}` : this.to.path
      },
    },
    template: '<a :href="href"><slot /></a>',
  },
}))

import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import LoginView from '../LoginView.vue'
import RegisterView from '../RegisterView.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)

// The public finds the ticker shows, newest first once sorted
function serveFinds() {
  const find = (id, title, createdAt, status = 'open') => ({
    id,
    title,
    status,
    category: 'Wallet',
    colours: ['Black'],
    createdAt,
    trail: [{ spotId: 1, from: createdAt, to: createdAt }],
  })
  api.get.mockImplementation((url) =>
    Promise.resolve({
      data:
        url === '/spots'
          ? [{ id: 1, building: 'Administration Building', floor: 'Level 1', area: 'lobby' }]
          : [
              find(1, 'Old umbrella', '2026-10-20T02:00:00Z'),
              find(2, 'Black Coach wallet', '2026-10-26T07:00:00Z'),
              find(3, 'Claimed phone', '2026-10-27T07:00:00Z', 'matched'),
            ],
    }),
  )
}
const session = (role = 'user') => ({
  data: {
    token: 't',
    user: { id: 1, name: 'Alice', role, emailVerifiedAt: '2026-10-15T00:00:00Z' },
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setActivePinia(createPinia())
  routeQuery.value = {}
})

describe('LoginView', () => {
  async function signIn(wrapper) {
    await byTestId(wrapper, 'login-email').setValue('alice.tan.2025@smu.edu.sg')
    await byTestId(wrapper, 'login-password').setValue('secret-123')
    await byTestId(wrapper, 'login-form').trigger('submit')
    await flushPromises()
  }

  it('shows the V01 words and reads only the public finds until you sign in', async () => {
    const wrapper = mount(LoginView)
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('Lost it? It’s probably been found.')
    // No line explaining what FoundIt does under the headline
    expect(wrapper.find('.fi-auth__lede').exists()).toBe(false)
    expect(api.get.mock.calls.map(([url]) => url).sort()).toEqual(['/items', '/spots'])
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows the latest find under the headline, and nothing when there is none', async () => {
    serveFinds()
    const wrapper = mount(LoginView)
    await flushPromises()
    const ticker = byTestId(wrapper, 'just-found')
    // The newest open find first, with its building
    expect(ticker.text()).toContain('Black Coach wallet')
    expect(ticker.text()).toContain('Admin Bldg')
    expect(ticker.attributes('href')).toBe('/feed')

    api.get.mockResolvedValue({ data: [] })
    const empty = mount(LoginView)
    await flushPromises()
    expect(byTestId(empty, 'just-found').exists()).toBe(false)
  })

  it('shows only the name of a find whose place the server left out', async () => {
    api.get.mockImplementation((url) =>
      Promise.resolve({
        data:
          url === '/spots'
            ? [{ id: 1, building: 'Administration Building', floor: 'Level 1', area: 'lobby' }]
            : [
                {
                  id: 1,
                  title: 'Black Coach wallet',
                  status: 'open',
                  category: 'Wallet',
                  colours: ['Black'],
                  createdAt: '2026-10-26T07:00:00Z',
                  placeHidden: true,
                  trail: [{ spotId: null, roomId: null, from: null, to: null }],
                },
              ],
      }),
    )
    const wrapper = mount(LoginView)
    await flushPromises()
    const ticker = byTestId(wrapper, 'just-found')
    expect(ticker.text()).toContain('Black Coach wallet')
    expect(ticker.text()).not.toContain('Place hidden')
    expect(ticker.find('.fi-ticker__where').exists()).toBe(false)
  })

  it('finishes an SMU address from a chip once "@" is typed, and ticks a whole one', async () => {
    const wrapper = mount(LoginView)
    const email = byTestId(wrapper, 'login-email')
    expect(email.attributes('placeholder')).toBe('you@smu.edu.sg')
    await email.setValue('alice.tan.2025@sc')
    const chips = wrapper.findAll('[data-testid="email-suggestion"]')
    expect(chips.map((chip) => chip.text())).toEqual(['@scis.smu.edu.sg'])
    await chips[0].trigger('click')
    expect(email.element.value).toBe('alice.tan.2025@scis.smu.edu.sg')
    expect(wrapper.find('[data-testid="email-suggestion"]').exists()).toBe(false)
    expect(wrapper.find('.fi-smu-email').classes()).toContain('is-valid')
  })

  it('ducks the lion while a hidden password is typed, and brings it back when shown', async () => {
    const wrapper = mount(LoginView)
    const lion = () => byTestId(wrapper, 'auth-lion').classes()
    expect(lion()).toContain('fi-auth__lion--idle')
    await byTestId(wrapper, 'login-email').trigger('focus')
    expect(lion()).toContain('fi-auth__lion--watching')
    await byTestId(wrapper, 'login-password').trigger('focus')
    expect(lion()).toContain('fi-auth__lion--shy')
    await byTestId(wrapper, 'password-toggle').trigger('click')
    expect(lion()).toContain('fi-auth__lion--watching')
    await byTestId(wrapper, 'login-password').trigger('blur')
    expect(lion()).toContain('fi-auth__lion--idle')
  })

  it('shows a Caps Lock sign in the password box while Caps Lock is on', async () => {
    const wrapper = mount(LoginView)
    const password = byTestId(wrapper, 'login-password')
    const press = (on) => {
      const event = new KeyboardEvent('keydown', { key: 'A' })
      event.getModifierState = (key) => key === 'CapsLock' && on
      password.element.dispatchEvent(event)
    }
    press(true)
    await flushPromises()
    expect(byTestId(wrapper, 'password-caps').exists()).toBe(true)
    press(false)
    await flushPromises()
    expect(byTestId(wrapper, 'password-caps').exists()).toBe(false)
  })

  it('says why when a page sent you here, and nothing when you came yourself', () => {
    routeQuery.value = { redirect: '/matches' }
    expect(byTestId(mount(LoginView), 'login-reason').text()).toBe('Sign in to see your matches.')
    routeQuery.value = {}
    expect(byTestId(mount(LoginView), 'login-reason').exists()).toBe(false)
  })

  it('passes the page you were going to on to "Create an account"', () => {
    routeQuery.value = { redirect: '/report' }
    const wrapper = mount(LoginView)
    expect(byTestId(wrapper, 'go-register').attributes('href')).toBe('/register?redirect=%2Freport')
    routeQuery.value = { redirect: '//evil.example.com' }
    expect(byTestId(mount(LoginView), 'go-register').attributes('href')).toBe('/register')
  })

  it('shows and hides the password', async () => {
    const wrapper = mount(LoginView)
    const field = byTestId(wrapper, 'login-password')
    expect(field.attributes('type')).toBe('password')
    expect(byTestId(wrapper, 'password-toggle').attributes('aria-label')).toBe('Show password')
    await byTestId(wrapper, 'password-toggle').trigger('click')
    expect(field.attributes('type')).toBe('text')
    expect(byTestId(wrapper, 'password-toggle').attributes('aria-label')).toBe('Hide password')
    expect(byTestId(wrapper, 'password-toggle').attributes('aria-pressed')).toBe('true')
  })

  it('has the lion shut its eyes while the password is shown', async () => {
    const wrapper = mount(LoginView)
    expect(byTestId(wrapper, 'mascot').attributes('data-eyes')).toBe('open')
    await byTestId(wrapper, 'password-toggle').trigger('click')
    expect(byTestId(wrapper, 'mascot').attributes('data-eyes')).toBe('closed')
    expect(byTestId(wrapper, 'mascot').classes()).toContain('is-closed')
    await byTestId(wrapper, 'password-toggle').trigger('click')
    expect(byTestId(wrapper, 'mascot').attributes('data-eyes')).toBe('open')
  })

  it('signs in and follows a redirect inside the app', async () => {
    routeQuery.value = { redirect: '/report' }
    api.post.mockResolvedValue(session())
    const wrapper = mount(LoginView)
    await signIn(wrapper)
    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      email: 'alice.tan.2025@smu.edu.sg',
      password: 'secret-123',
    })
    expect(push).toHaveBeenCalledWith('/report')
  })

  it('lands a student on the feed', async () => {
    api.post.mockResolvedValue(session())
    const wrapper = mount(LoginView)
    await signIn(wrapper)
    expect(push).toHaveBeenCalledWith('/feed')
  })

  it('treats a redirect to home as no redirect', async () => {
    routeQuery.value = { redirect: '/' }
    api.post.mockResolvedValue(session())
    const wrapper = mount(LoginView)
    await signIn(wrapper)
    expect(push).toHaveBeenCalledWith('/feed')
  })

  it('never redirects to another site', async () => {
    routeQuery.value = { redirect: '//evil.example.com' }
    api.post.mockResolvedValue(session())
    const wrapper = mount(LoginView)
    await signIn(wrapper)
    expect(push).toHaveBeenCalledWith('/feed')
  })

  it('has one form for students and admins, with no Student or Admin switch', async () => {
    const wrapper = mount(LoginView)
    expect(wrapper.find('[role="radiogroup"], fieldset').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Sign in as')
  })

  it('signs an admin in on the same form and sends them to the Admin page', async () => {
    api.post.mockResolvedValue(session('admin'))
    const wrapper = mount(LoginView)
    await signIn(wrapper)
    const body = api.post.mock.calls[0][1]
    expect(body).not.toHaveProperty('role')
    expect(push).toHaveBeenCalledWith('/admin')
  })

  it('links to the forgot-password page, for students and admins alike', () => {
    const wrapper = mount(LoginView)
    expect(byTestId(wrapper, 'go-forgot-password').attributes('href')).toBe('/forgot-password')
    expect(byTestId(wrapper, 'go-forgot-password').text()).toBe('Forgot password?')
  })

  it('sends an account that has not entered its email code on to the code page', async () => {
    routeQuery.value = { redirect: '/report' }
    api.post.mockRejectedValue({
      response: {
        status: 403,
        data: { error: 'Enter the code we emailed you to finish signing up.' },
      },
    })
    const wrapper = mount(LoginView)
    await signIn(wrapper)
    expect(push).toHaveBeenCalledWith({
      path: '/verify-email',
      query: { email: 'alice.tan.2025@smu.edu.sg', from: 'sign-in', redirect: '/report' },
    })
    // Not shown as a sign-in error
    expect(byTestId(wrapper, 'login-error').exists()).toBe(false)
  })

  it('shows the API message when sign-in fails, and shakes the form', async () => {
    vi.useFakeTimers()
    try {
      api.post.mockRejectedValue({ response: { data: { error: 'Wrong email or password' } } })
      const wrapper = mount(LoginView)
      await signIn(wrapper)
      expect(byTestId(wrapper, 'login-error').text()).toBe('Wrong email or password')
      expect(push).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(50)
      expect(byTestId(wrapper, 'login-form').classes()).toContain('fi-auth-form--shake')
      expect(byTestId(wrapper, 'auth-lion').classes()).toContain('fi-auth__lion--oops')
      await vi.advanceTimersByTimeAsync(700)
      expect(byTestId(wrapper, 'login-form').classes()).not.toContain('fi-auth-form--shake')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('LoginView, no answer from FoundIt', () => {
  it('keeps what was typed and signs in on Try again', async () => {
    api.post.mockRejectedValueOnce(new Error('Network Error'))
    const wrapper = mount(LoginView)
    await byTestId(wrapper, 'login-email').setValue('alice.tan.2025@smu.edu.sg')
    await byTestId(wrapper, 'login-password').setValue('secret-123')
    await byTestId(wrapper, 'login-form').trigger('submit')
    await flushPromises()
    expect(byTestId(wrapper, 'not-sent').text()).toContain('Not sent.')
    expect(byTestId(wrapper, 'login-error').exists()).toBe(false)
    expect(byTestId(wrapper, 'login-form').classes()).not.toContain('fi-auth-form--shake')

    api.post.mockResolvedValueOnce(session())
    await byTestId(wrapper, 'not-sent-retry').trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenCalledTimes(2)
    expect(push).toHaveBeenCalledWith('/feed')
    expect(byTestId(wrapper, 'not-sent').exists()).toBe(false)
  })
})

describe('RegisterView', () => {
  const made = { data: { email: 'alice.tan.2025@smu.edu.sg', verificationSent: true } }

  it('shows the rules instead of spelling them out', async () => {
    const wrapper = mount(RegisterView)
    expect(wrapper.find('.fi-auth__lede').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('We’ll email you a 6-digit code')
    expect(wrapper.text()).not.toContain('At least 8 characters')
    // One dot per character the password needs, filling as you type
    const meter = () => byTestId(wrapper, 'password-meter')
    expect(meter().findAll('li')).toHaveLength(8)
    await byTestId(wrapper, 'register-password').setValue('secr')
    expect(meter().findAll('.is-filled')).toHaveLength(4)
    expect(meter().classes()).not.toContain('is-long-enough')
    await byTestId(wrapper, 'register-password').setValue('secret-123')
    expect(meter().findAll('.is-filled')).toHaveLength(8)
    expect(meter().classes()).toContain('is-long-enough')
  })

  it('creates the account and goes straight to the email code, still signed out', async () => {
    api.post.mockResolvedValue(made)
    const wrapper = mount(RegisterView)
    await byTestId(wrapper, 'register-name').setValue('Alice Tan')
    await byTestId(wrapper, 'register-email').setValue('alice.tan.2025@smu.edu.sg')
    await byTestId(wrapper, 'register-password').setValue('secret-123')
    await byTestId(wrapper, 'register-confirm').setValue('secret-123')
    expect(byTestId(wrapper, 'register-password').attributes('minlength')).toBe('8')
    await byTestId(wrapper, 'register-form').trigger('submit')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      name: 'Alice Tan',
      email: 'alice.tan.2025@smu.edu.sg',
      password: 'secret-123',
    })
    expect(push).toHaveBeenCalledWith({
      path: '/verify-email',
      query: { email: 'alice.tan.2025@smu.edu.sg' },
    })
    expect(useAuthStore().isLoggedIn).toBe(false)
    expect(localStorage.getItem('foundit_token')).toBe(null)
  })

  it('carries the page you were going to through to the email code', async () => {
    routeQuery.value = { redirect: '/report' }
    api.post.mockResolvedValue(made)
    const wrapper = mount(RegisterView)
    await byTestId(wrapper, 'register-name').setValue('Alice Tan')
    await byTestId(wrapper, 'register-email').setValue('alice.tan.2025@smu.edu.sg')
    await byTestId(wrapper, 'register-password').setValue('secret-123')
    await byTestId(wrapper, 'register-confirm').setValue('secret-123')
    await byTestId(wrapper, 'register-form').trigger('submit')
    await flushPromises()
    expect(push).toHaveBeenCalledWith({
      path: '/verify-email',
      query: { email: 'alice.tan.2025@smu.edu.sg', redirect: '/report' },
    })
    expect(byTestId(wrapper, 'go-login').attributes('href')).toBe('/login?redirect=%2Freport')
  })

  it('checks the email and password as soon as you leave each field', async () => {
    const wrapper = mount(RegisterView)
    const email = byTestId(wrapper, 'register-email')
    await email.setValue('alice@gmail.com')
    await email.trigger('blur')
    expect(wrapper.text()).toContain('Use your SMU email, ending in smu.edu.sg.')
    expect(email.attributes('aria-invalid')).toBe('true')

    const password = byTestId(wrapper, 'register-password')
    await password.setValue('abc')
    await password.trigger('blur')
    expect(wrapper.text()).toContain('Use at least 8 characters.')

    // Fixing it clears the message as you type
    await email.setValue('alice.tan.2025@smu.edu.sg')
    expect(wrapper.text()).not.toContain('Use your SMU email')
  })

  it('does not send the form while the email or password is wrong', async () => {
    const wrapper = mount(RegisterView)
    await byTestId(wrapper, 'register-name').setValue('Alice Tan')
    await byTestId(wrapper, 'register-email').setValue('alice@gmail.com')
    await byTestId(wrapper, 'register-password').setValue('secret-123')
    await byTestId(wrapper, 'register-confirm').setValue('secret-123')
    await byTestId(wrapper, 'register-form').trigger('submit')
    await flushPromises()
    expect(api.post).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Use your SMU email, ending in smu.edu.sg.')
  })

  it('does not send the form until the password is typed the same twice', async () => {
    api.post.mockResolvedValue(made)
    const wrapper = mount(RegisterView)
    await byTestId(wrapper, 'register-name').setValue('Alice Tan')
    await byTestId(wrapper, 'register-email').setValue('alice.tan.2025@smu.edu.sg')
    await byTestId(wrapper, 'register-password').setValue('secret-123')
    const confirm = byTestId(wrapper, 'register-confirm')
    await confirm.setValue('secret-124')
    await confirm.trigger('blur')
    expect(wrapper.text()).toContain('The two passwords don’t match.')
    await byTestId(wrapper, 'register-form').trigger('submit')
    await flushPromises()
    expect(api.post).not.toHaveBeenCalled()

    // Fixing either box clears the message as you type
    await byTestId(wrapper, 'register-password').setValue('secret-124')
    expect(wrapper.text()).not.toContain('don’t match')
    await byTestId(wrapper, 'register-form').trigger('submit')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      name: 'Alice Tan',
      email: 'alice.tan.2025@smu.edu.sg',
      password: 'secret-124',
    })
  })

  it('shows the API message when the email is not an SMU address', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'Use your SMU email address' } } })
    const wrapper = mount(RegisterView)
    await byTestId(wrapper, 'register-form').trigger('submit')
    await flushPromises()
    expect(byTestId(wrapper, 'register-error').text()).toBe('Use your SMU email address')
  })
})
