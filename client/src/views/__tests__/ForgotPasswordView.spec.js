import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({ TOKEN_KEY: 'foundit_token', default: { get: vi.fn(), post: vi.fn() } }))
const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query: {} }),
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}))

import api from '@/api'
import ForgotPasswordView from '../ForgotPasswordView.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)
const SENT = {
  data: { message: 'If an account exists for that email, we’ve sent a 6-digit code.' },
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
})

async function askForCode(wrapper, email = 'alice.tan.2025@smu.edu.sg') {
  api.post.mockResolvedValueOnce(SENT)
  await byTestId(wrapper, 'forgot-email').setValue(` ${email} `)
  await byTestId(wrapper, 'forgot-form').trigger('submit')
  await flushPromises()
}

async function fillReset(wrapper, { code = '048213', password = 'brand-new-pass', confirm } = {}) {
  await byTestId(wrapper, 'reset-code').setValue(code)
  await byTestId(wrapper, 'reset-password').setValue(password)
  await byTestId(wrapper, 'reset-confirm').setValue(confirm ?? password)
  await byTestId(wrapper, 'reset-form').trigger('submit')
  await flushPromises()
}

describe('ForgotPasswordView', () => {
  it('asks for the SMU email first, on the sign-in band', () => {
    const wrapper = mount(ForgotPasswordView)
    expect(wrapper.find('h1').text()).toBe('Forgot it? Passwords get lost too.')
    expect(byTestId(wrapper, 'forgot-form').exists()).toBe(true)
    expect(byTestId(wrapper, 'reset-form').exists()).toBe(false)
    expect(byTestId(wrapper, 'go-login').attributes('href')).toBe('/login')
  })

  it('sends the email and moves on without saying whether an account exists', async () => {
    const wrapper = mount(ForgotPasswordView)
    await askForCode(wrapper)
    expect(api.post).toHaveBeenCalledWith('/auth/forgot-password', {
      email: 'alice.tan.2025@smu.edu.sg',
    })
    expect(byTestId(wrapper, 'reset-form').exists()).toBe(true)
    expect(byTestId(wrapper, 'reset-sent-to').text()).toBe(
      'If an account exists for alice.tan.2025@smu.edu.sg, we’ve sent it a 6-digit code. It works for 15 minutes.',
    )
    expect(byTestId(wrapper, 'reset-code').attributes('autocomplete')).toBe('one-time-code')
    expect(byTestId(wrapper, 'reset-password').attributes('minlength')).toBe('8')
  })

  it('shows the API message for an email that is not an SMU address', async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 400, data: { error: 'Use your SMU email address' } },
    })
    const wrapper = mount(ForgotPasswordView)
    await byTestId(wrapper, 'forgot-email').setValue('bob@gmail.com')
    await byTestId(wrapper, 'forgot-form').trigger('submit')
    await flushPromises()
    expect(byTestId(wrapper, 'forgot-error').text()).toBe('Use your SMU email address')
    expect(byTestId(wrapper, 'reset-form').exists()).toBe(false)
  })

  it('resets the password, logs in and lands a student on the feed', async () => {
    const wrapper = mount(ForgotPasswordView)
    await askForCode(wrapper)
    api.post.mockResolvedValueOnce(session())
    await fillReset(wrapper, { code: ' 048213 ' })
    expect(api.post).toHaveBeenLastCalledWith('/auth/reset-password', {
      email: 'alice.tan.2025@smu.edu.sg',
      code: '048213',
      password: 'brand-new-pass',
    })
    expect(localStorage.getItem('foundit_token')).toBe('t')
    expect(push).toHaveBeenCalledWith('/feed')
  })

  it('sends an admin to the Admin page', async () => {
    const wrapper = mount(ForgotPasswordView)
    await askForCode(wrapper)
    api.post.mockResolvedValueOnce(session('admin'))
    await fillReset(wrapper)
    expect(push).toHaveBeenCalledWith('/admin')
  })

  it('checks the two passwords match before asking the server', async () => {
    const wrapper = mount(ForgotPasswordView)
    await askForCode(wrapper)
    await fillReset(wrapper, { password: 'brand-new-pass', confirm: 'brand-new-pas' })
    expect(byTestId(wrapper, 'reset-error').text()).toBe('The two passwords don’t match.')
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('shows the server’s answer for a wrong code and stays logged out', async () => {
    const wrapper = mount(ForgotPasswordView)
    await askForCode(wrapper)
    api.post.mockRejectedValueOnce({
      response: { status: 400, data: { error: 'That code is wrong or has expired.' } },
    })
    await fillReset(wrapper)
    expect(byTestId(wrapper, 'reset-error').text()).toBe('That code is wrong or has expired.')
    expect(localStorage.getItem('foundit_token')).toBeNull()
    expect(push).not.toHaveBeenCalled()
  })

  it('sends a new code to the same address', async () => {
    const wrapper = mount(ForgotPasswordView)
    await askForCode(wrapper)
    await byTestId(wrapper, 'reset-code').setValue('111111')
    api.post.mockResolvedValueOnce(SENT)
    await byTestId(wrapper, 'reset-resend').trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenLastCalledWith('/auth/forgot-password', {
      email: 'alice.tan.2025@smu.edu.sg',
    })
    expect(byTestId(wrapper, 'reset-notice').text()).toMatch(/a new code is on its way/)
    expect(byTestId(wrapper, 'reset-code').element.value).toBe('')
  })

  it('goes back to change the email', async () => {
    const wrapper = mount(ForgotPasswordView)
    await askForCode(wrapper)
    await byTestId(wrapper, 'reset-change-email').trigger('click')
    expect(byTestId(wrapper, 'forgot-form').exists()).toBe(true)
    expect(byTestId(wrapper, 'forgot-email').element.value).toBe('alice.tan.2025@smu.edu.sg')
  })
})
