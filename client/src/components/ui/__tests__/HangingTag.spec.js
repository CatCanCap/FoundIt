import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HangingTag from '../HangingTag.vue'

// Run animation frames by hand
let frames = []
beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => vi.unstubAllGlobals())

function runFrames(count) {
  let time = 0
  for (let i = 0; i < count && frames.length; i += 1) {
    time += 16
    frames.shift()(time)
  }
}

function angleOf(wrapper) {
  const match = /rotate\((-?[\d.]+)deg\)/.exec(
    wrapper.find('[data-testid="hanging-tag"]').element.style.transform,
  )
  return match ? Number(match[1]) : 0
}

// jsdom has no PointerEvent, so send a mouse event that carries a pointerId
function pointer(target, type, pointerId) {
  const event = new MouseEvent(type, { bubbles: true, clientX: 50, clientY: 50, button: 0 })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  target.dispatchEvent(event)
}

function mountTag() {
  return mount(HangingTag, {
    props: { stamp: 'Received LKS Lib' },
    slots: { default: '<input data-testid="field" /><p class="plain">Words</p>' },
    attachTo: document.body,
  })
}

describe('HangingTag', () => {
  it('swings in when it appears, then settles straight', () => {
    const wrapper = mountTag()
    runFrames(5)
    expect(Math.abs(angleOf(wrapper))).toBeGreaterThan(1)
    runFrames(600)
    expect(angleOf(wrapper)).toBe(0)
    wrapper.unmount()
  })

  it('swings when tapped, but not when a form field is clicked', async () => {
    const wrapper = mountTag()
    runFrames(600)
    const field = wrapper.find('[data-testid="field"]').element
    const words = wrapper.find('.plain').element

    pointer(field, 'pointerdown', 1)
    pointer(field, 'pointerup', 1)
    runFrames(5)
    expect(angleOf(wrapper)).toBe(0)

    pointer(words, 'pointerdown', 2)
    pointer(words, 'pointerup', 2)
    runFrames(5)
    expect(Math.abs(angleOf(wrapper))).toBeGreaterThan(0.5)
    wrapper.unmount()
  })

  it('can be pushed by its parent', () => {
    const wrapper = mountTag()
    runFrames(600)
    wrapper.vm.nudge(60)
    runFrames(5)
    expect(angleOf(wrapper)).toBeGreaterThan(0.5)
    wrapper.unmount()
  })
})
