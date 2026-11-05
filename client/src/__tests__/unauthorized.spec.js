import { describe, it, expect, vi } from 'vitest'
import { installUnauthorizedHandler, watchTokenInOtherTabs } from '../unauthorized'

// A stand-in for axios: remembers the error handler it is given
function fakeApi() {
  const api = { interceptors: { response: { use: vi.fn() } } }
  api.fail = (error) => api.interceptors.response.use.mock.calls[0][1](error)
  return api
}

function httpError(status, url) {
  return { response: { status }, config: { url } }
}

describe('installUnauthorizedHandler', () => {
  it('calls the handler when a request is rejected with 401, and still rejects', async () => {
    const api = fakeApi()
    const onUnauthorized = vi.fn()
    installUnauthorizedHandler(api, onUnauthorized)

    const error = httpError(401, '/items')
    await expect(api.fail(error)).rejects.toBe(error)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('leaves a wrong password on the login form alone', async () => {
    const api = fakeApi()
    const onUnauthorized = vi.fn()
    installUnauthorizedHandler(api, onUnauthorized)

    await expect(api.fail(httpError(401, '/auth/login'))).rejects.toBeTruthy()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it.each([400, 403, 404, 500])('ignores status %s', async (status) => {
    const api = fakeApi()
    const onUnauthorized = vi.fn()
    installUnauthorizedHandler(api, onUnauthorized)

    await expect(api.fail(httpError(status, '/items'))).rejects.toBeTruthy()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('ignores a network failure that has no response', async () => {
    const api = fakeApi()
    const onUnauthorized = vi.fn()
    installUnauthorizedHandler(api, onUnauthorized)

    await expect(api.fail(new Error('Network Error'))).rejects.toBeTruthy()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe('watchTokenInOtherTabs', () => {
  function fakeWindow() {
    const target = { addEventListener: vi.fn() }
    target.fire = (key) => target.addEventListener.mock.calls[0][1]({ key })
    return target
  }

  it('reacts when another tab changes or clears the saved token', () => {
    const target = fakeWindow()
    const onChange = vi.fn()
    watchTokenInOtherTabs('foundit_token', onChange, target)

    expect(target.addEventListener).toHaveBeenCalledWith('storage', expect.any(Function))
    target.fire('foundit_token')
    target.fire(null)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('ignores other saved settings, such as the colour theme', () => {
    const target = fakeWindow()
    const onChange = vi.fn()
    watchTokenInOtherTabs('foundit_token', onChange, target)

    target.fire('foundit_theme')
    expect(onChange).not.toHaveBeenCalled()
  })
})
