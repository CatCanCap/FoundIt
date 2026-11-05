import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ListPager from '../ListPager.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)

function mountPager(props) {
  return mount(ListPager, { props: { page: 1, noun: 'disputes', ...props } })
}

describe('ListPager', () => {
  it('hides itself while everything fits on one page', () => {
    expect(byTestId(mountPager({ total: 10 }), 'list-pager').exists()).toBe(false)
    expect(byTestId(mountPager({ total: 0 }), 'list-pager').exists()).toBe(false)
  })

  it('says which rows are showing, and marks the current page', () => {
    const wrapper = mountPager({ total: 23, page: 2 })
    expect(byTestId(wrapper, 'list-pager').attributes('aria-label')).toBe('Pages of disputes')
    expect(byTestId(wrapper, 'pager-count').text()).toBe('Showing 11–20 of 23')
    expect(byTestId(wrapper, 'pager-page-2').attributes('aria-current')).toBe('page')
    expect(byTestId(wrapper, 'pager-page-1').attributes('aria-current')).toBeUndefined()
    expect(wrapper.text()).toContain('Page 2 of 3')
  })

  it('moves with Previous, Next and the numbers', async () => {
    const wrapper = mountPager({ total: 23, page: 2 })
    await byTestId(wrapper, 'pager-next').trigger('click')
    await byTestId(wrapper, 'pager-previous').trigger('click')
    await byTestId(wrapper, 'pager-page-1').trigger('click')
    expect(wrapper.emitted('update:page')).toEqual([[3], [2], [1]])
  })

  it('cannot go before the first page or past the last', () => {
    expect(byTestId(mountPager({ total: 23, page: 1 }), 'pager-previous').element.disabled).toBe(
      true,
    )
    expect(byTestId(mountPager({ total: 23, page: 3 }), 'pager-next').element.disabled).toBe(true)
  })

  it('does not announce a change when the current page is clicked', async () => {
    const wrapper = mountPager({ total: 23, page: 2 })
    await byTestId(wrapper, 'pager-page-2').trigger('click')
    expect(wrapper.emitted('update:page')).toBeUndefined()
  })

  it('shortens a long row with gaps', () => {
    const wrapper = mountPager({ total: 200, page: 10 })
    const labels = wrapper.findAll('.pager__number').map((entry) => entry.text())
    expect(labels).toEqual(['1', '…', '9', '10', '11', '…', '20'])
  })
})
