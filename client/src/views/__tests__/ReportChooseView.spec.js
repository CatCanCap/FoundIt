import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import ReportChooseView from '../ReportChooseView.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)

async function mountChooser(user = null) {
  setActivePinia(createPinia())
  if (user) useAuthStore().user = user
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/report', component: ReportChooseView },
      { path: '/report/found', component: { template: '<div />' } },
      { path: '/report/lost', component: { template: '<div />' } },
      { path: '/:rest(.*)*', component: { template: '<div />' } },
    ],
  })
  router.push('/report')
  await router.isReady()
  const wrapper = mount(ReportChooseView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('ReportChooseView', () => {
  it('asks what to report, without assuming it happened today', async () => {
    const { wrapper } = await mountChooser()
    const title = wrapper.find('h1').text()
    expect(title).toBe('What do you want to report?')
    expect(wrapper.text()).not.toMatch(/today/i)
  })

  it('makes each way a link, so one tap starts the report', async () => {
    const { wrapper } = await mountChooser()
    expect(byTestId(wrapper, 'choose-found').attributes('href')).toBe('/report/found')
    expect(byTestId(wrapper, 'choose-lost').attributes('href')).toBe('/report/lost')
    // No radio buttons and no Continue step
    expect(wrapper.find('input[type="radio"]').exists()).toBe(false)
    expect(byTestId(wrapper, 'choose-continue').exists()).toBe(false)
  })

  it('goes straight to the lost report when that card is tapped', async () => {
    const { wrapper, router } = await mountChooser()
    await byTestId(wrapper, 'choose-lost').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/report/lost')
  })

  it('tells a suspended account it cannot report, with no way into the forms', async () => {
    const { wrapper } = await mountChooser({ id: 7, suspendedAt: '2026-10-20T00:00:00Z' })
    expect(byTestId(wrapper, 'choose-suspended').text()).toContain('suspended')
    expect(byTestId(wrapper, 'choose-found').exists()).toBe(false)
    expect(byTestId(wrapper, 'choose-lost').exists()).toBe(false)
    expect(wrapper.find('a[href="/feed"]').exists()).toBe(true)
  })

  it('does not promise a photo step, which only shows once Cloudinary is set up', async () => {
    const { wrapper } = await mountChooser()
    expect(byTestId(wrapper, 'choose-found').text()).not.toMatch(/photo/i)
  })
})
