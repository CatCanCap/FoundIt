import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import PageTransition from '../PageTransition.vue'
import { morphing, noteCardTap, takeCardSeed } from '@/utils/item-morph'

function page(text) {
  return { template: `<main data-testid="page"><h1>${text}</h1></main>` }
}

async function mountWithRoutes() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/feed', component: page('Feed') },
      { path: '/matches', component: page('Matches') },
      { path: '/login', component: page('Login'), meta: { authBand: true } },
      { path: '/register', component: page('Register'), meta: { authBand: true } },
      {
        path: '/items/7/record',
        component: { template: '<main data-testid="page"><i data-morph-target></i>Item</main>' },
      },
    ],
  })
  router.push('/feed')
  await router.isReady()
  const wrapper = mount(PageTransition, {
    global: { plugins: [router], stubs: { transition: false } },
    attachTo: document.body,
  })
  return { wrapper, router }
}

// A stand-in for the browser's View Transition: runs the page swap, then ends
function fakeViewTransitions() {
  const transition = { finish: null }
  window.matchMedia = vi.fn(() => ({ matches: true }))
  document.startViewTransition = vi.fn((update) => {
    const done = Promise.resolve().then(update)
    const finished = new Promise((resolve) => (transition.finish = resolve))
    return { ready: done, finished }
  })
  return transition
}

function tapCard(path = '/items/7/record') {
  const picture = document.createElement('span')
  document.body.append(picture)
  noteCardTap({ button: 0 }, path, picture, {})
  return picture
}

afterEach(() => {
  delete document.startViewTransition
  delete window.matchMedia
  takeCardSeed('/items/7/record')
  morphing.value = false
})

describe('PageTransition', () => {
  it('grows a tapped card’s picture into the item page', async () => {
    const transition = fakeViewTransitions()
    const { wrapper, router } = await mountWithRoutes()
    const picture = tapCard()

    await router.push('/items/7/record')
    await flushPromises()

    expect(document.startViewTransition).toHaveBeenCalledTimes(1)
    expect(picture.style.viewTransitionName).toBe('fi-item-picture')
    expect(wrapper.find('[data-testid="page"]').text()).toBe('Item')
    expect(morphing.value).toBe(true)

    transition.finish()
    await flushPromises()
    expect(morphing.value).toBe(false)
    wrapper.unmount()
  })

  it('still changes page if the new page never says it is ready', async () => {
    fakeViewTransitions()
    const { wrapper, router } = await mountWithRoutes()
    tapCard()
    await router.push('/items/7/record')
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(router.currentRoute.value.path).toBe('/items/7/record')
    wrapper.unmount()
  })

  it('leaves ordinary page changes to the fade', async () => {
    fakeViewTransitions()
    const { wrapper, router } = await mountWithRoutes()
    await router.push('/matches')
    await flushPromises()
    expect(document.startViewTransition).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows the current page and the next one after navigating', async () => {
    const { wrapper, router } = await mountWithRoutes()
    expect(wrapper.find('[data-testid="page"]').text()).toBe('Feed')
    await router.push('/matches')
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(wrapper.find('[data-testid="page"]').text()).toBe('Matches')
  })

  it('moves the focus to the new page’s heading after a page change', async () => {
    const { wrapper, router } = await mountWithRoutes()
    await router.push('/matches')
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(document.activeElement).toBe(wrapper.find('h1').element)
    expect(wrapper.find('h1').text()).toBe('Matches')
    wrapper.unmount()
  })

  it('puts navy behind the sign-in pages and cream behind the rest', async () => {
    const { router } = await mountWithRoutes()
    expect(document.documentElement.dataset.band).toBeUndefined()
    await router.push('/login')
    expect(document.documentElement.dataset.band).toBe('night')
    await router.push('/register')
    expect(document.documentElement.dataset.band).toBe('night')
    await router.push('/feed')
    expect(document.documentElement.dataset.band).toBeUndefined()
  })
})
