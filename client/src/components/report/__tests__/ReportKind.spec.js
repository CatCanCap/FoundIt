import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ReportKind from '../ReportKind.vue'

describe('ReportKind', () => {
  it('labels a lost report in red', () => {
    const wrapper = mount(ReportKind, { props: { kind: 'lost' } })
    expect(wrapper.text()).toBe('Lost item report')
    expect(wrapper.classes()).toContain('report-kind--lost')
  })

  it('labels a found report in yellow', () => {
    const wrapper = mount(ReportKind, { props: { kind: 'found' } })
    expect(wrapper.text()).toBe('Found item report')
    expect(wrapper.classes()).toContain('report-kind--found')
  })
})
