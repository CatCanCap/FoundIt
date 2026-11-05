import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PageSkeleton from '../PageSkeleton.vue'

describe('PageSkeleton', () => {
  it('tells screen readers what is loading, and hides the shapes from them', () => {
    const wrapper = mount(PageSkeleton, { props: { label: 'Loading the case…' } })
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.text()).toBe('Loading the case…')
    expect(wrapper.find('[aria-hidden="true"]').exists()).toBe(true)
  })

  it('draws one row or field for each one asked for', () => {
    const rows = mount(PageSkeleton, { props: { kind: 'rows', count: 5 } })
    expect(rows.findAll('.page-skeleton__row')).toHaveLength(5)
    const form = mount(PageSkeleton, { props: { kind: 'form', count: 2 } })
    expect(form.findAll('.page-skeleton__field')).toHaveLength(2)
  })

  it('draws a picture beside the facts for a detail page', () => {
    const wrapper = mount(PageSkeleton, { props: { kind: 'detail' } })
    expect(wrapper.find('.page-skeleton__picture').exists()).toBe(true)
    expect(wrapper.find('.page-skeleton__box').exists()).toBe(true)
  })
})
