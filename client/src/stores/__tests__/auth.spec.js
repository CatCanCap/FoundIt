import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../../api', () => ({
  TOKEN_KEY: 'foundit_token',
  default: { post: vi.fn(), get: vi.fn() },
}))

import api from '../../api'
import { useAuthStore } from '../auth'

const alice = { id: 1, name: 'Alice Tan', email: 'alice@smu.edu.sg', alertsOn: true }

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  setActivePinia(createPinia())
})

describe('auth store', () => {
  it('starts logged out', () => {
    const auth = useAuthStore()
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.user).toBe(null)
  })

  it('stores the token and user after login', async () => {
    api.post.mockResolvedValue({ data: { token: 'abc', user: alice } })
    const auth = useAuthStore()
    await auth.login('alice@smu.edu.sg', 'password123')

    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      email: 'alice@smu.edu.sg',
      password: 'password123',
    })
    expect(auth.isLoggedIn).toBe(true)
    expect(auth.user).toEqual(alice)
    expect(localStorage.getItem('foundit_token')).toBe('abc')
  })

  it('keeps the password from a sign-in that needs the code, and forgets it once verified', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 403, data: { error: 'Enter the code' } } })
    const auth = useAuthStore()
    await expect(auth.login('alice@smu.edu.sg', 'password123')).rejects.toBeTruthy()
    expect(auth.pendingPassword).toBe('password123')

    api.post.mockResolvedValue({ data: { token: 'fresh', user: alice } })
    await auth.verifyEmail('alice@smu.edu.sg', '123456')
    expect(api.post).toHaveBeenLastCalledWith('/auth/verify-email', {
      email: 'alice@smu.edu.sg',
      code: '123456',
      password: 'password123',
    })
    expect(auth.pendingPassword).toBe('')
  })

  it('does not keep the password after a wrong one', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 401, data: { error: 'Invalid' } } })
    const auth = useAuthStore()
    await expect(auth.login('alice@smu.edu.sg', 'wrong-pass')).rejects.toBeTruthy()
    expect(auth.pendingPassword).toBe('')
  })

  it('makes the account without signing in when registering', async () => {
    api.post.mockResolvedValue({
      status: 201,
      data: { email: 'alice@smu.edu.sg', verificationSent: true },
    })
    const auth = useAuthStore()
    const sentTo = await auth.register('Alice Tan', ' alice@smu.edu.sg ', 'password123')

    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      name: 'Alice Tan',
      email: ' alice@smu.edu.sg ',
      password: 'password123',
    })
    expect(sentTo).toBe('alice@smu.edu.sg')
    expect(auth.codeSent).toBe(true)
    // Kept in memory for the code page, which sends it with the code
    expect(auth.pendingPassword).toBe('password123')
    expect(localStorage.getItem('pendingPassword')).toBe(null)
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.user).toBe(null)
    expect(localStorage.getItem('foundit_token')).toBe(null)
  })

  it('stays logged out when login fails', async () => {
    api.post.mockRejectedValue({
      response: { status: 401, data: { error: 'Invalid email or password' } },
    })
    const auth = useAuthStore()
    await expect(auth.login('alice@smu.edu.sg', 'wrong')).rejects.toBeTruthy()
    expect(auth.isLoggedIn).toBe(false)
    expect(localStorage.getItem('foundit_token')).toBe(null)
  })

  it('clears everything on logout', async () => {
    api.post.mockResolvedValue({ data: { token: 'abc', user: alice } })
    const auth = useAuthStore()
    await auth.login('alice@smu.edu.sg', 'password123')
    auth.logout()

    expect(auth.isLoggedIn).toBe(false)
    expect(auth.user).toBe(null)
    expect(localStorage.getItem('foundit_token')).toBe(null)
  })

  it('forgets the last places on logout, so the next person in this tab starts fresh', () => {
    sessionStorage.setItem('foundit-last-places', JSON.stringify(['/matches']))
    useAuthStore().logout()
    expect(sessionStorage.getItem('foundit-last-places')).toBe(null)
  })

  it('restores the user from a saved token', async () => {
    localStorage.setItem('foundit_token', 'saved')
    api.get.mockResolvedValue({ data: alice })
    const auth = useAuthStore()
    await auth.loadUser()

    expect(api.get).toHaveBeenCalledWith('/auth/me')
    expect(auth.user).toEqual(alice)
  })

  it('logs out when the saved token is no longer accepted', async () => {
    localStorage.setItem('foundit_token', 'expired')
    api.get.mockRejectedValue({ response: { status: 401 } })
    const auth = useAuthStore()
    await auth.loadUser()

    expect(auth.isLoggedIn).toBe(false)
    expect(localStorage.getItem('foundit_token')).toBe(null)
  })

  it('keeps the session when the server cannot be reached', async () => {
    localStorage.setItem('foundit_token', 'saved')
    api.get.mockRejectedValue(new Error('Network Error'))
    const auth = useAuthStore()
    await auth.loadUser()

    expect(auth.isLoggedIn).toBe(true)
  })

  it('knows whether the user is verified, an admin or suspended', () => {
    const auth = useAuthStore()
    auth.user = { ...alice, emailVerifiedAt: null, role: 'user' }
    expect(auth.isVerified).toBe(false)
    expect(auth.isAdmin).toBe(false)

    auth.user = {
      ...alice,
      emailVerifiedAt: '2026-10-15T00:00:00Z',
      role: 'admin',
      suspendedAt: null,
    }
    expect(auth.isVerified).toBe(true)
    expect(auth.isAdmin).toBe(true)
    expect(auth.isSuspended).toBe(false)
  })

  it('remembers whether the code email went out after registering', async () => {
    api.post.mockResolvedValue({ data: { email: 'alice@smu.edu.sg', verificationSent: false } })
    const auth = useAuthStore()
    expect(auth.codeSent).toBeNull()
    await auth.register('Alice Tan', 'alice@smu.edu.sg', 'password123')
    expect(auth.codeSent).toBe(false)
    auth.logout()
    expect(auth.codeSent).toBeNull()
  })

  it('signs in with the token and user the code sends back', async () => {
    const verified = { ...alice, emailVerifiedAt: '2026-10-15T00:00:00Z' }
    api.post.mockResolvedValue({ data: { token: 'fresh', user: verified } })
    const auth = useAuthStore()
    await auth.verifyEmail('alice@smu.edu.sg', '123456', 'password123')

    expect(api.post).toHaveBeenCalledWith('/auth/verify-email', {
      email: 'alice@smu.edu.sg',
      code: '123456',
      password: 'password123',
    })
    expect(auth.isLoggedIn).toBe(true)
    expect(auth.user).toEqual(verified)
    expect(auth.isVerified).toBe(true)
    expect(localStorage.getItem('foundit_token')).toBe('fresh')
  })

  it('replaces an older unverified session once the code is right', async () => {
    localStorage.setItem('foundit_token', 'old')
    const auth = useAuthStore()
    auth.user = { ...alice, emailVerifiedAt: null }
    api.post.mockResolvedValue({
      data: { token: 'fresh', user: { ...alice, emailVerifiedAt: '2026-10-15T00:00:00Z' } },
    })
    await auth.verifyEmail('alice@smu.edu.sg', '123456')
    expect(localStorage.getItem('foundit_token')).toBe('fresh')
    expect(auth.isVerified).toBe(true)
  })

  it('stays logged out when the code is wrong', async () => {
    api.post.mockRejectedValue({
      response: { status: 400, data: { error: 'That code is wrong or has expired.' } },
    })
    const auth = useAuthStore()
    await expect(auth.verifyEmail('alice@smu.edu.sg', '000000')).rejects.toBeTruthy()
    expect(auth.isLoggedIn).toBe(false)
    expect(localStorage.getItem('foundit_token')).toBe(null)
  })

  it('stays logged out when signing in before entering the code', async () => {
    api.post.mockRejectedValue({
      response: {
        status: 403,
        data: { error: 'Enter the code we emailed you to finish signing up.' },
      },
    })
    const auth = useAuthStore()
    await expect(auth.login('alice@smu.edu.sg', 'password123')).rejects.toMatchObject({
      response: { status: 403 },
    })
    expect(auth.isLoggedIn).toBe(false)
  })

  it('asks for a new code by email, without logging in, and passes on the message', async () => {
    api.post.mockResolvedValue({ data: { message: 'If that email is waiting, we sent a code.' } })
    const auth = useAuthStore()
    expect(await auth.resendCode('alice@smu.edu.sg')).toBe(
      'If that email is waiting, we sent a code.',
    )
    expect(api.post).toHaveBeenCalledWith('/auth/resend-code', { email: 'alice@smu.edu.sg' })
    expect(auth.isLoggedIn).toBe(false)
  })

  it('asks for a password reset code without logging in', async () => {
    api.post.mockResolvedValue({ data: { message: 'If an account exists…' } })
    const auth = useAuthStore()
    await auth.forgotPassword('alice@smu.edu.sg')
    expect(api.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'alice@smu.edu.sg' })
    expect(auth.isLoggedIn).toBe(false)
  })

  it('logs in after resetting the password', async () => {
    api.post.mockResolvedValue({ data: { token: 'new', user: alice } })
    const auth = useAuthStore()
    await auth.resetPassword('alice@smu.edu.sg', '048213', 'brand-new-pass')
    expect(api.post).toHaveBeenCalledWith('/auth/reset-password', {
      email: 'alice@smu.edu.sg',
      code: '048213',
      password: 'brand-new-pass',
    })
    expect(auth.user).toEqual(alice)
    expect(localStorage.getItem('foundit_token')).toBe('new')
  })

  it('stays logged out when the reset code is wrong', async () => {
    api.post.mockRejectedValue({ response: { status: 400 } })
    const auth = useAuthStore()
    await expect(
      auth.resetPassword('alice@smu.edu.sg', '000000', 'brand-new-pass'),
    ).rejects.toBeTruthy()
    expect(auth.isLoggedIn).toBe(false)
  })
})
