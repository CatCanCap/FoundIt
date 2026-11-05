import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionProblem from '../ConnectionProblem.vue'
import NotSentNote from '../NotSentNote.vue'
import OfflineBar from '../OfflineBar.vue'

describe('ConnectionProblem', () => {
  it('says FoundIt cannot be reached and asks for the page load again', async () => {
    const wrapper = mount(ConnectionProblem)
    expect(wrapper.find('h2').text()).toBe("We can't reach FoundIt right now")
    expect(wrapper.text()).toContain('Your connection may have dropped, or the server is busy.')
    await wrapper.find('[data-testid="connection-retry"]').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('shows it is working while the page loads again', () => {
    const wrapper = mount(ConnectionProblem, { props: { busy: true } })
    const button = wrapper.find('[data-testid="connection-retry"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-busy')).toBe('true')
  })

  it('takes a page’s own test id in place of its own', () => {
    const wrapper = mount(ConnectionProblem, { attrs: { 'data-testid': 'returns-error' } })
    expect(wrapper.attributes('data-testid')).toBe('returns-error')
  })
})

describe('NotSentNote', () => {
  it('says nothing was sent, keeps the words, and sends again on Try again', async () => {
    const wrapper = mount(NotSentNote)
    expect(wrapper.text()).toContain('Not sent. What you wrote is still here.')
    expect(wrapper.attributes('role')).toBe('alert')
    await wrapper.find('[data-testid="not-sent-retry"]').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('cannot be pressed twice while it is sending', () => {
    const wrapper = mount(NotSentNote, { props: { busy: true } })
    expect(wrapper.find('[data-testid="not-sent-retry"]').attributes('disabled')).toBeDefined()
  })
})

describe('OfflineBar', () => {
  let online = true

  beforeEach(() => {
    vi.useFakeTimers()
    online = true
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.documentElement.style.removeProperty('--ds-sticky-top')
    document.body.style.removeProperty('--ds-sticky-top')
  })

  function goOffline() {
    online = false
    window.dispatchEvent(new Event('offline'))
  }

  function goOnline() {
    online = true
    window.dispatchEvent(new Event('online'))
  }

  it('shows nothing while the browser is online', () => {
    const wrapper = mount(OfflineBar)
    expect(wrapper.text()).toBe('')
    wrapper.unmount()
  })

  it('shows the offline line straight away when the page opens offline', () => {
    online = false
    const wrapper = mount(OfflineBar)
    expect(wrapper.find('[data-testid="offline-bar-offline"]').text()).toContain(
      "You're offline. Reconnecting…",
    )
    wrapper.unmount()
  })

  it('says Back online for 2 seconds when the connection returns, then goes', async () => {
    const wrapper = mount(OfflineBar)
    goOffline()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="offline-bar-offline"]').exists()).toBe(true)

    goOnline()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="offline-bar-back"]').text()).toBe('Back online')

    vi.advanceTimersByTime(1999)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="offline-bar-back"]').exists()).toBe(true)

    vi.advanceTimersByTime(1)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="offline-bar-back"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('never says Back online without having been offline', async () => {
    const wrapper = mount(OfflineBar)
    goOnline()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="offline-bar-back"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('sticks under the suspended banner and adds its own height for the header', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      return this.classList.contains('offline-bar') && !online ? 28 : 0
    })
    document.documentElement.style.setProperty('--ds-sticky-top', '40px')
    const wrapper = mount(OfflineBar, { attachTo: document.body })

    goOffline()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(wrapper.attributes('style')).toContain('top: 40px')
    expect(document.body.style.getPropertyValue('--ds-sticky-top')).toBe('68px')
    // The banner's own value is left alone
    expect(document.documentElement.style.getPropertyValue('--ds-sticky-top')).toBe('40px')

    goOnline()
    vi.advanceTimersByTime(2000)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(document.body.style.getPropertyValue('--ds-sticky-top')).toBe('')
    wrapper.unmount()
  })
})
