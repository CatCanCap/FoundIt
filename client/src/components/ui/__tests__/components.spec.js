import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useDisputesStore } from '@/stores/disputes'
import { useHandoffsStore } from '@/stores/handoffs'
import { useMatchesStore } from '@/stores/matches'
import AppHeader from '../AppHeader.vue'
import BaseButton from '../BaseButton.vue'
import BaseSelect from '../BaseSelect.vue'
import ItemIcon from '../ItemIcon.vue'
import PageHeader from '../PageHeader.vue'
import SegmentedToggle from '../SegmentedToggle.vue'
import StatusPill from '../StatusPill.vue'
import TextField from '../TextField.vue'

// The header's matches store asks the API when it opens, so keep it off the network
vi.mock('@/api', () => ({ default: { get: vi.fn() }, TOKEN_KEY: 'foundit_token' }))

const Blank = { template: '<div />' }

function makeRouter(paths) {
  return createRouter({
    history: createMemoryHistory(),
    routes: paths.map((path) => ({ path, component: Blank })),
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  delete document.documentElement.dataset.theme
  api.get.mockReset()
  api.get.mockResolvedValue({ data: { reports: [] } })
})

describe('BaseButton', () => {
  it('is a button by default and lets type through', () => {
    const wrapper = mount(BaseButton, { attrs: { type: 'submit' }, slots: { default: 'Go' } })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('submit')
    expect(wrapper.classes()).toContain('fi-button--primary')
  })

  it('becomes a link when given a path', async () => {
    const router = makeRouter(['/', '/report'])
    const wrapper = mount(BaseButton, {
      props: { to: '/report', variant: 'secondary' },
      slots: { default: 'Report' },
      global: { plugins: [router] },
    })
    expect(wrapper.element.tagName).toBe('A')
    expect(wrapper.attributes('href')).toBe('/report')
  })
})

describe('StatusPill and ItemIcon', () => {
  it('shows the words for a state', () => {
    const wrapper = mount(StatusPill, { props: { state: 'open' } })
    expect(wrapper.text()).toBe('Waiting for its owner')
    expect(wrapper.classes()).toContain('fi-pill--brass')
  })

  it('draws the category in the item’s own colour', () => {
    const wrapper = mount(ItemIcon, { props: { category: 'Phone', colour: 'Black' } })
    expect(wrapper.attributes('data-icon')).toBe('phone')
    expect(wrapper.attributes('style')).toContain('rgb(26, 26, 26)')
    expect(wrapper.attributes('aria-label')).toBe('Phone')
  })

  it('uses one neutral colour when the item has no single colour', () => {
    for (const colour of ['', 'Clear', 'Multicolour']) {
      const wrapper = mount(ItemIcon, { props: { category: 'Phone', colour } })
      expect(wrapper.attributes('style')).toContain('var(--fi-cat-other)')
    }
  })
})

describe('PageHeader', () => {
  it('shows the eyebrow, the title with its accent, the line under it and the actions', () => {
    const wrapper = mount(PageHeader, {
      props: { eyebrow: 'Map', title: 'Where things', accent: 'go missing', lede: 'Last 30 days.' },
      slots: { actions: '<button>Report</button>' },
    })
    expect(wrapper.find('.fi-eyebrow').text()).toBe('Map')
    expect(wrapper.find('h1').text()).toBe('Where things go missing')
    expect(wrapper.find('h1 em').text()).toBe('go missing')
    expect(wrapper.text()).toContain('Last 30 days.')
    expect(wrapper.find('button').text()).toBe('Report')
  })

  it('leaves out the parts it is not given', () => {
    const wrapper = mount(PageHeader, { props: { title: 'Profile' } })
    expect(wrapper.find('.fi-eyebrow').exists()).toBe(false)
    expect(wrapper.find('h1 em').exists()).toBe(false)
    expect(wrapper.findAll('p')).toHaveLength(0)
  })
})

describe('BaseSelect', () => {
  const options = '<option value="Tablet">Tablet</option><option value="Wallet">Wallet</option>'

  it('is a real select: attributes go to it, class goes to the outer box', async () => {
    const wrapper = mount(BaseSelect, {
      props: { modelValue: '', placeholder: 'Pick one' },
      attrs: { id: 'cat', class: 'extra', required: '', 'data-testid': 'cat' },
      slots: { default: options },
    })
    const select = wrapper.find('select')
    expect(select.attributes('id')).toBe('cat')
    expect(select.attributes('data-testid')).toBe('cat')
    expect(select.attributes('required')).toBeDefined()
    expect(select.classes()).not.toContain('extra')
    expect(wrapper.classes()).toContain('extra')
    await select.setValue('Wallet')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['Wallet'])
  })

  it('shows the placeholder greyed out until something is picked', async () => {
    const wrapper = mount(BaseSelect, {
      props: { modelValue: null, placeholder: 'Pick one' },
      slots: { default: options },
    })
    const placeholder = wrapper.find('option')
    expect(placeholder.text()).toBe('Pick one')
    expect(placeholder.attributes('disabled')).toBeDefined()
    expect(wrapper.find('select').classes()).toContain('is-placeholder')
    await wrapper.setProps({ modelValue: 'Tablet' })
    expect(wrapper.find('select').classes()).not.toContain('is-placeholder')
    expect(wrapper.find('select').element.value).toBe('Tablet')
  })

  it('keeps number values and has no placeholder unless asked', async () => {
    const wrapper = mount(BaseSelect, {
      props: { modelValue: 1, size: 'lg' },
      slots: { default: '<option :value="1">One</option><option :value="2">Two</option>' },
    })
    expect(wrapper.findAll('option')).toHaveLength(2)
    expect(wrapper.classes()).toContain('ds-select--lg')
    await wrapper.find('select').setValue('2')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([2])
  })
})

describe('TextField and SegmentedToggle', () => {
  it('ties the label to the input and passes attributes to the input', async () => {
    const wrapper = mount(TextField, {
      props: { label: 'SMU email', help: 'Ending in smu.edu.sg.', modelValue: '' },
      attrs: { type: 'email', 'data-testid': 'email' },
    })
    const input = wrapper.find('input')
    expect(input.attributes('type')).toBe('email')
    expect(input.attributes('data-testid')).toBe('email')
    expect(wrapper.find('label').attributes('for')).toBe(input.attributes('id'))
    expect(input.attributes('aria-describedby')).toBe(
      wrapper.find('.fi-field__help').attributes('id'),
    )
    await input.setValue('a@smu.edu.sg')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['a@smu.edu.sg'])
  })

  it('works like radio buttons', async () => {
    const wrapper = mount(SegmentedToggle, {
      props: {
        modelValue: 'student',
        label: 'Sign in as',
        options: [
          { value: 'student', label: 'Student' },
          { value: 'admin', label: 'Admin' },
        ],
      },
    })
    expect(wrapper.find('legend').text()).toBe('Sign in as')
    await wrapper.find('[data-testid="toggle-admin"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['admin'])
  })
})

describe('AppHeader', () => {
  async function mountHeader(paths, props = {}, start = '/feed') {
    const router = makeRouter(paths)
    router.push(start)
    await router.isReady()
    const wrapper = mount(AppHeader, { props, global: { plugins: [router] } })
    // Let the matches check that runs on opening finish first
    await flushPromises()
    return wrapper
  }

  function signIn(user = { name: 'Wei Ling Tan', role: 'user' }) {
    const auth = useAuthStore()
    auth.token = 'abc'
    auth.user = user
  }

  it('only links to pages that exist yet', async () => {
    const wrapper = await mountHeader(['/', '/feed', '/map', '/report', '/login'])
    const labels = wrapper.findAll('.fi-header__link').map((link) => link.text())
    expect(labels).toEqual(['Feed', 'Map'])
    expect(wrapper.find('.fi-header__link.is-active').text()).toBe('Feed')
  })

  it('links to Returns for students, but not for admins', async () => {
    const paths = ['/', '/feed', '/matches', '/map', '/returns', '/report', '/admin', '/login']
    signIn()
    let wrapper = await mountHeader(paths)
    expect(wrapper.findAll('.fi-header__link').map((link) => link.text())).toEqual([
      'Feed',
      'Matches',
      'Map',
      'Returns',
    ])
    useAuthStore().user = { name: 'FoundIt Admin', role: 'admin' }
    wrapper = await mountHeader(paths)
    expect(wrapper.text()).not.toContain('Returns')
  })

  it('shows how many handoffs need you on Returns, and on the phone Menu', async () => {
    const paths = ['/', '/feed', '/matches', '/returns', '/report', '/login']
    signIn()
    const wrapper = await mountHeader(paths, { matchCount: 1 })
    // Set after mounting: a logged-out header empties the list when it opens
    const handoffs = useHandoffsStore()
    handoffs.rows = [
      { matchId: 1, role: 'finder', matchStatus: 'claimed', handoff: null, lastMessage: null },
      {
        matchId: 2,
        role: 'owner',
        matchStatus: 'claimed',
        handoff: null,
        lastMessage: { sentAt: '2026-10-14T01:24:00Z', fromMe: false },
      },
    ]
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="badge-returns"]').text()).toBe('2')
    expect(wrapper.find('[data-testid="badge-matches"]').text()).toBe('1')
    expect(wrapper.find('[data-testid="menu-badge"]').text()).toBe('3')

    handoffs.markSeen(2, '2026-10-14T01:24:00Z')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="badge-returns"]').text()).toBe('1')
    handoffs.rows = []
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="badge-returns"]').exists()).toBe(false)
  })

  it('shows the matches waiting for an answer on every page, from the shared store', async () => {
    signIn()
    const wrapper = await mountHeader(['/', '/feed', '/matches', '/report', '/login'])
    expect(wrapper.find('[data-testid="badge-matches"]').exists()).toBe(false)
    // Set after mounting: a logged-out header empties the list when it opens
    useMatchesStore().reports = [
      { item: { id: 1 }, matches: [{ status: 'suggested' }, { status: 'suggested' }] },
      { item: { id: 2 }, matches: [{ status: 'rejected' }] },
    ]
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="badge-matches"]').text()).toBe('2')
  })

  it('shows a fixed match count when one is given', async () => {
    signIn()
    const wrapper = await mountHeader(['/', '/feed', '/matches', '/report', '/login'], {
      matchCount: 2,
    })
    expect(wrapper.find('.fi-header__badge').text()).toBe('2')
  })

  it('leaves out Matches, Returns and "Report an item" when signed out, with one Sign in', async () => {
    const paths = ['/', '/feed', '/matches', '/map', '/returns', '/report', '/login']
    const wrapper = await mountHeader(paths)
    expect(wrapper.findAll('.fi-header__link').map((link) => link.text())).toEqual(['Feed', 'Map'])
    expect(wrapper.find('[data-testid="header-report"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Sign in to report')
    expect(wrapper.findAll('.fi-header__signin')).toHaveLength(1)
  })

  it('reports straight away when signed in', async () => {
    signIn()
    const wrapper = await mountHeader(['/', '/feed', '/report', '/login'])
    const report = wrapper.find('[data-testid="header-report"]')
    expect(report.text()).toContain('Report an item')
    expect(report.attributes('href')).toBe('/report')
  })

  it('shows initials when logged in, and Sign in otherwise', async () => {
    let wrapper = await mountHeader(['/', '/feed', '/report', '/login'])
    expect(wrapper.text()).toContain('Sign in')
    useAuthStore().user = { name: 'Wei Ling Tan' }
    wrapper = await mountHeader(['/', '/feed', '/report', '/login'])
    expect(wrapper.find('[data-testid="header-avatar"]').text()).toBe('WL')
  })

  it('opens an account menu from the initials that logs out', async () => {
    const auth = useAuthStore()
    auth.user = { name: 'Wei Ling Tan', email: 'weiling.tan.2025@smu.edu.sg' }
    auth.token = 't'
    const router = makeRouter(['/', '/feed', '/report', '/login', '/profile', '/disputes'])
    router.push('/feed')
    await router.isReady()
    const wrapper = mount(AppHeader, { global: { plugins: [router] }, attachTo: document.body })
    const menu = wrapper.find('[data-testid="account-menu"]')
    expect(menu.isVisible()).toBe(false)

    await wrapper.find('[data-testid="header-avatar"]').trigger('click')
    expect(menu.isVisible()).toBe(true)
    expect(menu.text()).not.toContain('weiling.tan.2025@smu.edu.sg')
    expect(menu.findAll('a').map((link) => link.attributes('href'))).toEqual([
      '/profile',
      '/disputes',
    ])

    await wrapper.find('[data-testid="header-logout"]').trigger('click')
    await flushPromises()
    expect(auth.user).toBe(null)
    expect(router.currentRoute.value.path).toBe('/login')
    wrapper.unmount()
  })

  it('keeps the account menu to Profile, My disputes and Log out', async () => {
    const auth = useAuthStore()
    auth.user = { name: 'Wei Ling Tan' }
    const paths = ['/', '/feed', '/profile', '/disputes', '/admin', '/login']
    const wrapper = await mountHeader(paths)
    const links = wrapper.findAll('[data-testid="account-menu"] a')
    expect(links.map((link) => link.text())).toEqual(['Profile', 'My disputes'])
    expect(wrapper.find('[data-testid="header-logout"]').exists()).toBe(true)
  })

  it('heads the account menu with who is signed in, apart from the links', async () => {
    const auth = useAuthStore()
    auth.user = { name: 'Wei Ling Tan' }
    const wrapper = await mountHeader(['/', '/profile', '/disputes', '/login'])
    const menu = wrapper.find('[data-testid="account-menu"]')
    expect(menu.find('.fi-header__account-label').text()).toBe('Signed in as')
    const name = menu.find('[data-testid="account-name"]')
    expect(name.text()).toBe('Wei Ling Tan')
    // The name is not a link
    expect(name.element.closest('a')).toBeNull()
  })

  it('counts the verdicts not opened yet on My disputes, with a dot on the initials', async () => {
    useAuthStore().user = { id: 7, name: 'Wei Ling Tan' }
    const disputes = useDisputesStore()
    disputes.raised = [{ id: 150, itemId: 2, status: 'upheld', decidedAt: '2026-10-25T09:00:00Z' }]
    disputes.onMyClaims = [
      { id: 151, itemId: 3, status: 'closed', decidedAt: '2026-10-24T09:00:00Z' },
      // Their own withdrawal is not news to them
      { id: 152, itemId: 4, status: 'withdrawn', decidedAt: '2026-10-24T09:00:00Z' },
    ]
    const wrapper = await mountHeader(['/', '/feed', '/disputes', '/login'])
    expect(wrapper.find('[data-testid="badge-disputes"]').text()).toBe('2')
    expect(wrapper.find('[data-testid="avatar-dot"]').exists()).toBe(true)

    disputes.markRead(150)
    disputes.markRead(151)
    await flushPromises()
    expect(wrapper.find('[data-testid="badge-disputes"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="avatar-dot"]').exists()).toBe(false)
  })

  it('gives an admin only Profile and Log out in the account menu', async () => {
    signIn({ name: 'FoundIt Admin', role: 'admin' })
    const wrapper = await mountHeader(['/', '/feed', '/profile', '/disputes', '/admin', '/login'])
    const links = wrapper.findAll('[data-testid="account-menu"] a')
    expect(links.map((link) => link.text())).toEqual(['Profile'])
    expect(wrapper.find('[data-testid="header-logout"]').exists()).toBe(true)
  })

  it('gives an admin Admin only, with no Feed, search, Report button or My disputes', async () => {
    const paths = ['/', '/feed', '/matches', '/map', '/report', '/admin', '/login']
    signIn()
    let wrapper = await mountHeader(paths)
    expect(wrapper.findAll('.fi-header__link').map((link) => link.text())).toEqual([
      'Feed',
      'Matches',
      'Map',
    ])
    expect(wrapper.find('[data-testid="header-report"]').exists()).toBe(true)

    signIn({ name: 'FoundIt Admin', role: 'admin' })
    wrapper = await mountHeader([...paths, '/disputes'])
    expect(wrapper.find('[data-testid="header-admin"]').text()).toBe('Admin')
    expect(wrapper.findAll('.fi-header__link')).toHaveLength(0)
    expect(wrapper.find('[data-testid="header-report"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="header-search"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="account-menu"]').text()).not.toContain('My disputes')
  })

  it('leaves out "+ Report an item" while you are already reporting', async () => {
    signIn()
    const paths = ['/feed', '/report', '/report/found', '/report/lost']
    for (const start of ['/report', '/report/found', '/report/lost']) {
      const wrapper = await mountHeader(paths, {}, start)
      expect(wrapper.find('[data-testid="header-report"]').exists()).toBe(false)
    }
    const onFeed = await mountHeader(paths, {}, '/feed')
    expect(onFeed.find('[data-testid="header-report"]').exists()).toBe(true)
  })

  it('leaves its search box out on the feed, which has its own', async () => {
    const paths = ['/', '/feed', '/map', '/report', '/login']
    const onFeed = await mountHeader(paths)
    expect(onFeed.find('[data-testid="header-search"]').exists()).toBe(false)
    const onMap = await mountHeader(paths, {}, '/map')
    expect(onMap.find('[data-testid="header-search"]').exists()).toBe(true)
  })

  it('switches to night mode and remembers it', async () => {
    const wrapper = await mountHeader(['/', '/feed', '/report', '/login'])
    await wrapper.find('[data-testid="theme-toggle"]').trigger('click')
    expect(document.documentElement.dataset.theme).toBe('night')
    expect(localStorage.getItem('foundit-theme')).toBe('night')
  })

  it('names the night mode button once, and says whether it is on', async () => {
    const wrapper = await mountHeader(['/', '/feed', '/report', '/login'])
    const button = wrapper.find('[data-testid="theme-toggle"]')
    expect(button.attributes('aria-label')).toBe('Night mode')
    expect(button.attributes('aria-pressed')).toBe('false')
    await button.trigger('click')
    expect(button.attributes('aria-label')).toBe('Night mode')
    expect(button.attributes('aria-pressed')).toBe('true')
  })

  it('moves the focus into the account menu, and Escape closes it and comes back', async () => {
    signIn()
    const router = makeRouter(['/', '/feed', '/report', '/login', '/profile'])
    router.push('/feed')
    await router.isReady()
    const wrapper = mount(AppHeader, { global: { plugins: [router] }, attachTo: document.body })
    const avatar = wrapper.find('[data-testid="header-avatar"]')

    // Enter or Space on the button: a click with detail 0
    avatar.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.find('[data-testid="header-profile"]').element)

    await wrapper.find('[data-testid="header-profile"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="account-menu"]').isVisible()).toBe(false)
    expect(document.activeElement).toBe(avatar.element)
    wrapper.unmount()
  })

  it('leaves the focus alone when the account menu is opened with the mouse', async () => {
    signIn()
    const router = makeRouter(['/', '/feed', '/report', '/login', '/profile'])
    router.push('/feed')
    await router.isReady()
    const wrapper = mount(AppHeader, { global: { plugins: [router] }, attachTo: document.body })

    const avatar = wrapper.find('[data-testid="header-avatar"]').element
    avatar.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    await flushPromises()
    expect(wrapper.find('[data-testid="account-menu"]').isVisible()).toBe(true)
    expect(document.activeElement).not.toBe(wrapper.find('[data-testid="header-profile"]').element)
    wrapper.unmount()
  })

  it('closes the phone Menu on Escape and puts the focus back on Menu', async () => {
    const router = makeRouter(['/', '/feed', '/map', '/login'])
    router.push('/feed')
    await router.isReady()
    const wrapper = mount(AppHeader, { global: { plugins: [router] }, attachTo: document.body })
    const menuButton = wrapper.find('.fi-header__menu')

    await menuButton.trigger('click')
    expect(wrapper.find('#fi-header-nav').classes()).toContain('show')
    await wrapper.find('.fi-header__link').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('#fi-header-nav').classes()).not.toContain('show')
    expect(document.activeElement).toBe(menuButton.element)
    wrapper.unmount()
  })

  // Safari does not focus a clicked button, so Escape starts on the page body
  it('closes the phone Menu on Escape even when nothing in the header has the focus', async () => {
    const router = makeRouter(['/', '/feed', '/map', '/login'])
    router.push('/feed')
    await router.isReady()
    const wrapper = mount(AppHeader, { global: { plugins: [router] }, attachTo: document.body })
    const menuButton = wrapper.find('.fi-header__menu')

    await menuButton.trigger('click')
    document.activeElement?.blur()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(wrapper.find('#fi-header-nav').classes()).not.toContain('show')
    expect(document.activeElement).toBe(menuButton.element)
    wrapper.unmount()
  })

  it('closes only the account menu when Escape starts on the page body', async () => {
    signIn()
    const router = makeRouter(['/', '/feed', '/report', '/login', '/profile'])
    router.push('/feed')
    await router.isReady()
    const wrapper = mount(AppHeader, { global: { plugins: [router] }, attachTo: document.body })

    await wrapper.find('.fi-header__menu').trigger('click')
    const avatar = wrapper.find('[data-testid="header-avatar"]').element
    avatar.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    await flushPromises()
    document.activeElement?.blur()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(wrapper.find('[data-testid="account-menu"]').isVisible()).toBe(false)
    expect(document.activeElement).toBe(avatar)
    // The same press leaves the phone Menu open
    expect(wrapper.find('#fi-header-nav').classes()).toContain('show')
    wrapper.unmount()
  })

  it('has a skip link that jumps to the page’s main content', async () => {
    const main = document.createElement('main')
    document.body.appendChild(main)
    const wrapper = await mountHeader(['/', '/feed', '/login'])
    await wrapper.find('[data-testid="skip-link"]').trigger('click')
    expect(document.activeElement).toBe(main)
    main.remove()
  })
})
