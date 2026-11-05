import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const channel = { on: vi.fn(), subscribe: vi.fn() }
const supabase = { channel: vi.fn(() => channel), removeChannel: vi.fn() }

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => supabase) }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  channel.on.mockReturnValue(channel)
  channel.subscribe.mockReturnValue(channel)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('onNewMessage', () => {
  it('does nothing when the Supabase settings are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    const { onNewMessage } = await import('../realtime')
    const stop = onNewMessage('chat-1-abc', vi.fn())
    expect(supabase.channel).not.toHaveBeenCalled()
    expect(() => stop()).not.toThrow()
  })

  it('calls back on each ping and stops listening when asked', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    const { onNewMessage } = await import('../realtime')
    const onPing = vi.fn()

    const stop = onNewMessage('chat-1-abc', onPing)
    expect(supabase.channel).toHaveBeenCalledWith('chat-1-abc')
    expect(channel.on).toHaveBeenCalledWith(
      'broadcast',
      { event: 'new-message' },
      expect.any(Function),
    )

    channel.on.mock.calls[0][2]({ payload: {} })
    expect(onPing).toHaveBeenCalledTimes(1)

    stop()
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel)
  })
})
