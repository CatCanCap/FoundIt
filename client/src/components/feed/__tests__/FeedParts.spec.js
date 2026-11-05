import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FeedFilters from '../FeedFilters.vue'
import FeedPager from '../FeedPager.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)

describe('FeedFilters', () => {
  it('sends the search text up as it is typed, and clears it', async () => {
    const wrapper = mount(FeedFilters, { props: { modelValue: 'bag', family: '' } })
    expect(byTestId(wrapper, 'feed-search').element.value).toBe('bag')
    await byTestId(wrapper, 'feed-search').setValue('bottle')
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['bottle'])
    await byTestId(wrapper, 'feed-search-clear').trigger('click')
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([''])
  })

  it('marks the picked chip and says which one was tapped', async () => {
    const wrapper = mount(FeedFilters, { props: { modelValue: '', family: 'bottles' } })
    expect(byTestId(wrapper, 'feed-family-bottles').attributes('aria-pressed')).toBe('true')
    expect(byTestId(wrapper, 'feed-family-all').attributes('aria-pressed')).toBe('false')
    await byTestId(wrapper, 'feed-family-keys').trigger('click')
    await byTestId(wrapper, 'feed-family-all').trigger('click')
    expect(wrapper.emitted('family')).toEqual([['keys'], ['']])
  })
})

describe('FeedPager', () => {
  const props = { page: 2, pages: 5, numbers: [1, 2, 3, '…', 5], type: 'found' }

  it('shows where you are and asks for the page that was tapped', async () => {
    const wrapper = mount(FeedPager, { props })
    expect(byTestId(wrapper, 'feed-page-where').text()).toBe('Page 2 of 5')
    expect(byTestId(wrapper, 'feed-page-2').attributes('aria-current')).toBe('page')
    await byTestId(wrapper, 'feed-page-next').trigger('click')
    await byTestId(wrapper, 'feed-page-prev').trigger('click')
    await byTestId(wrapper, 'feed-page-5').trigger('click')
    expect(wrapper.emitted('go')).toEqual([[3], [1], [5]])
  })

  it('turns off Previous on the first page and Next on the last', () => {
    const first = mount(FeedPager, { props: { ...props, page: 1 } })
    expect(byTestId(first, 'feed-page-prev').attributes('disabled')).toBeDefined()
    const last = mount(FeedPager, { props: { ...props, page: 5 } })
    expect(byTestId(last, 'feed-page-next').attributes('disabled')).toBeDefined()
  })
})
