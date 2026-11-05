import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import BackToTop from '../BackToTop.vue'

// Scroll the fake window and let the arrow check on the next frame
async function scrollTo(wrapper, y) {
  window.scrollY = y
  window.dispatchEvent(new Event('scroll'))
  vi.runAllTimers()
  await wrapper.vm.$nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback) => setTimeout(callback, 16))
  vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id))
  window.innerHeight = 800
  window.scrollY = 0
  window.scrollTo = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('BackToTop', () => {
  it('stays hidden near the top of the page', async () => {
    const wrapper = mount(BackToTop)
    await scrollTo(wrapper, 300)
    expect(wrapper.find('[data-testid="back-to-top"]').exists()).toBe(false)
  })

  it('appears after one screen of scrolling and hides again at the top', async () => {
    const wrapper = mount(BackToTop)
    await scrollTo(wrapper, 900)
    expect(wrapper.find('[data-testid="back-to-top"]').exists()).toBe(true)
    await scrollTo(wrapper, 0)
    expect(wrapper.find('[data-testid="back-to-top"]').exists()).toBe(false)
  })

  it('uses the offset when one is given', async () => {
    const wrapper = mount(BackToTop, { props: { offset: 200 } })
    await scrollTo(wrapper, 300)
    expect(wrapper.find('[data-testid="back-to-top"]').exists()).toBe(true)
  })

  it('scrolls smoothly to the top', async () => {
    const wrapper = mount(BackToTop)
    await scrollTo(wrapper, 2000)
    await wrapper.find('[data-testid="back-to-top"]').trigger('click')
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('jumps straight to the top when the device asks for less motion', async () => {
    window.matchMedia = vi.fn(() => ({ matches: true }))
    const wrapper = mount(BackToTop)
    await scrollTo(wrapper, 2000)
    await wrapper.find('[data-testid="back-to-top"]').trigger('click')
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
    delete window.matchMedia
  })
})
