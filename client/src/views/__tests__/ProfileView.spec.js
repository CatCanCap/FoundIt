import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({
  TOKEN_KEY: 'foundit_token',
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import ProfileView from '../ProfileView.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)
const alice = {
  id: 1,
  name: 'Alice Tan',
  email: 'alice.tan.2025@smu.edu.sg',
  role: 'user',
  alertsOn: true,
}

function mountPage(user = alice) {
  const auth = useAuthStore()
  auth.user = { ...user }
  auth.token = 'old-token'
  return mount(ProfileView, { global: { stubs: { RouterLink: true, AppHeader: true } } })
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
})

describe('ProfileView', () => {
  it('shows the SMU email and the kind of account', () => {
    const wrapper = mountPage()
    expect(byTestId(wrapper, 'profile-email').text()).toBe('alice.tan.2025@smu.edu.sg')
    expect(byTestId(wrapper, 'profile-role').text()).toBe('Student')
  })

  it('has one heading, the person’s name, with their initials beside it', () => {
    const wrapper = mountPage()
    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.find('h1').text()).toBe('Alice Tan')
    expect(byTestId(wrapper, 'profile-avatar').text()).toBe('AT')
    expect(wrapper.find('.fi-eyebrow').exists()).toBe(false)
  })

  it('uses the first letter of the email when there is no name', () => {
    const wrapper = mountPage({ ...alice, name: '' })
    expect(byTestId(wrapper, 'profile-avatar').text()).toBe('A')
    expect(wrapper.find('h1').text()).toBe('Your profile')
  })

  it('shows the alerts as an on/off switch', () => {
    const wrapper = mountPage()
    expect(byTestId(wrapper, 'profile-alerts').attributes('role')).toBe('switch')
  })

  it('shows the alert emails switch, on for a new account', () => {
    const wrapper = mountPage()
    expect(byTestId(wrapper, 'profile-alerts').element.checked).toBe(true)
  })

  it('turns the alert emails off', async () => {
    api.patch.mockResolvedValue({ data: { ...alice, alertsOn: false } })
    const wrapper = mountPage()
    await byTestId(wrapper, 'profile-alerts').setValue(false)
    expect(byTestId(wrapper, 'profile-details-save').attributes('disabled')).toBeUndefined()
    await byTestId(wrapper, 'profile-details-form').trigger('submit')
    await flushPromises()

    expect(api.patch).toHaveBeenCalledWith('/auth/me', { name: 'Alice Tan', alertsOn: false })
    expect(useAuthStore().user.alertsOn).toBe(false)
    expect(byTestId(wrapper, 'profile-alerts').element.checked).toBe(false)
  })

  it('has no alerts switch for an admin, who gets no alert emails', () => {
    const wrapper = mountPage({ ...alice, role: 'admin' })
    expect(byTestId(wrapper, 'profile-alerts').exists()).toBe(false)
  })

  it('saves a new name', async () => {
    api.patch.mockResolvedValue({ data: { ...alice, name: 'Alice T' } })
    const wrapper = mountPage()
    await byTestId(wrapper, 'profile-name').setValue('Alice T')
    await byTestId(wrapper, 'profile-details-form').trigger('submit')
    await flushPromises()

    expect(api.patch).toHaveBeenCalledWith('/auth/me', { name: 'Alice T', alertsOn: true })
    expect(useAuthStore().user.name).toBe('Alice T')
    expect(byTestId(wrapper, 'profile-details-notice').exists()).toBe(true)
  })

  it('says when the account is an admin', () => {
    const wrapper = mountPage({ ...alice, role: 'admin' })
    expect(byTestId(wrapper, 'profile-role').text()).toBe('Admin')
  })

  it('changes the password and keeps the new token', async () => {
    api.post.mockResolvedValue({ data: { token: 'new-token', user: alice } })
    const wrapper = mountPage()
    await byTestId(wrapper, 'profile-current-password').setValue('old-password-1')
    await byTestId(wrapper, 'profile-new-password').setValue('new-password-1')
    await byTestId(wrapper, 'profile-confirm-password').setValue('new-password-1')
    await byTestId(wrapper, 'profile-password-form').trigger('submit')
    await flushPromises()

    expect(api.post).toHaveBeenCalledWith('/auth/change-password', {
      currentPassword: 'old-password-1',
      newPassword: 'new-password-1',
    })
    expect(useAuthStore().token).toBe('new-token')
    expect(byTestId(wrapper, 'profile-password-notice').exists()).toBe(true)
    expect(byTestId(wrapper, 'profile-current-password').element.value).toBe('')
  })

  it('stops when the two new passwords differ', async () => {
    const wrapper = mountPage()
    await byTestId(wrapper, 'profile-current-password').setValue('old-password-1')
    await byTestId(wrapper, 'profile-new-password').setValue('new-password-1')
    await byTestId(wrapper, 'profile-confirm-password').setValue('new-password-2')
    await byTestId(wrapper, 'profile-password-form').trigger('submit')

    expect(api.post).not.toHaveBeenCalled()
    expect(byTestId(wrapper, 'profile-password-error').text()).toContain('do not match')
  })

  it('shows the server error for a wrong current password', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'Your current password is wrong' } } })
    const wrapper = mountPage()
    await byTestId(wrapper, 'profile-current-password').setValue('nope')
    await byTestId(wrapper, 'profile-new-password').setValue('new-password-1')
    await byTestId(wrapper, 'profile-confirm-password').setValue('new-password-1')
    await byTestId(wrapper, 'profile-password-form').trigger('submit')
    await flushPromises()

    expect(byTestId(wrapper, 'profile-password-error').text()).toBe(
      'Your current password is wrong',
    )
    expect(useAuthStore().token).toBe('old-token')
  })
})
