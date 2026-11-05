<script setup>
// Feature 5b and 5c, the Admin page (Figma v3 V16): the dispute queue, the
// reported messages and posts, the people with a warning or suspension, and
// the action log. Only admins reach it; the server checks the role again on
// every request.
//
// The admin routes return whole lists, so this page searches, sorts and cuts
// each list into pages of 10 itself (matchesQuery and pageOf in
// utils/safeguards.js, ListPager underneath). The tab, filter, search, sort and
// page are kept in the address bar (?tab=reports&q=wallet&page=2), so the
// browser's Back button from a case lands on the same list.
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import AppFooter from '@/components/ui/AppFooter.vue'
import PageSkeleton from '@/components/ui/PageSkeleton.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import AdminFilters from '@/components/safeguards/AdminFilters.vue'
import AdminRack from '@/components/safeguards/AdminRack.vue'
import AdminTicket from '@/components/safeguards/AdminTicket.vue'
import ListPager from '@/components/safeguards/ListPager.vue'
import AdminDisputeRows from '@/components/safeguards/AdminDisputeRows.vue'
import AdminReportRows from '@/components/safeguards/AdminReportRows.vue'
import AdminPeopleRows from '@/components/safeguards/AdminPeopleRows.vue'
import AdminAppealRows from '@/components/safeguards/AdminAppealRows.vue'
import AdminLogRows from '@/components/safeguards/AdminLogRows.vue'
import {
  ACTION_LABELS,
  disputeCode,
  reportCode,
  waitingWords,
  pageOf,
  matchesQuery,
  disputeFlags,
  errorText,
  appealCode,
  initials,
} from '@/utils/safeguards'
import { mainColour } from '@/utils/design'
import '@/assets/safeguards.css'
import '@/assets/admin.css'

const route = useRoute()
const router = useRouter()

const TABS = [
  {
    name: 'disputes',
    title: 'Disputes',
    search: 'Item, No. 117, D-0141 or a name',
  },
  {
    name: 'reports',
    title: 'Reported posts',
    search: 'Item, R-0003 or a name',
  },
  {
    name: 'appeals',
    title: 'Appeals',
    search: 'Name, email or A-0003',
  },
  {
    name: 'people',
    title: 'People',
    search: 'Name or email',
  },
  {
    name: 'log',
    title: 'Action log',
    search: 'Action, name, D- or R- code',
  },
]
const tabNames = TABS.map((entry) => entry.name)

// The "Show" choices on each tab (none on the log)
const DECISION_SHOWS = [
  { value: 'open', label: 'Waiting' },
  { value: 'decided', label: 'Decided' },
  { value: 'all', label: 'All' },
]
const SHOWS = {
  disputes: DECISION_SHOWS,
  reports: DECISION_SHOWS,
  appeals: DECISION_SHOWS,
  people: [
    { value: 'all', label: 'All' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'warned', label: 'Warned' },
  ],
  log: null,
}
const SORTS = [
  { value: 'oldest', label: 'Oldest' },
  { value: 'newest', label: 'Newest' },
]

// What each list starts with: waiting cases oldest first (first come, first
// served), everything else newest first
const defaultShow = (name) => (name === 'people' ? 'all' : 'open')
const defaultSort = (name, choice) =>
  ['disputes', 'reports', 'appeals'].includes(name) && choice === 'open' ? 'oldest' : 'newest'

// The tab, filter, sort, search and page an address asks for, with the
// defaults for anything it leaves out or gets wrong
function settingsFrom(address) {
  const tabName = tabNames.includes(address.tab) ? address.tab : 'disputes'
  const showName = (SHOWS[tabName] || []).some((entry) => entry.value === address.show)
    ? address.show
    : defaultShow(tabName)
  return {
    tab: tabName,
    show: showName,
    sort: SORTS.some((entry) => entry.value === address.sort)
      ? address.sort
      : defaultSort(tabName, showName),
    query: typeof address.q === 'string' ? address.q : '',
    page: Number(address.page) || 1,
  }
}

const start = settingsFrom(route.query)
const tab = ref(start.tab)
const show = ref(start.show)
const sort = ref(start.sort)
const query = ref(start.query)
const page = ref(start.page)

const disputes = ref([])
const reports = ref([])
const appeals = ref([])
const people = ref([])
const actions = ref([])
const errorMessage = ref('')
// True when none of the four lists loaded, so there is nothing to show
const nothingLoaded = ref(false)
const notice = ref('')
const isLoading = ref(true)
const panel = ref(null)
const tabButtons = ref([])
const now = ref(new Date())

const current = computed(() => TABS.find((entry) => entry.name === tab.value))

const openDisputes = computed(() =>
  disputes.value
    .filter((dispute) => dispute.status === 'open')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
)
const openReports = computed(() => reports.value.filter((report) => report.status === 'open'))
const openAppeals = computed(() => appeals.value.filter((appeal) => appeal.status === 'open'))

function byShow(list) {
  if (show.value === 'open') return list.filter((row) => row.status === 'open')
  if (show.value === 'decided') return list.filter((row) => row.status !== 'open')
  return list
}

// What the search box looks through on each kind of row
function searchTarget(row) {
  if (tab.value === 'disputes') {
    const { raisedBy, claimer, finder } = row.people || {}
    return {
      text: [row.item?.title, row.description, raisedBy?.name, claimer?.name, finder?.name],
      itemId: row.itemId,
      disputeId: row.id,
    }
  }
  if (tab.value === 'reports') {
    const { author, reporter } = row.people || {}
    return {
      text: [row.item?.title, row.message?.text, row.reason, author?.name, reporter?.name],
      itemId: row.item?.id,
      reportId: row.id,
    }
  }
  if (tab.value === 'appeals') {
    return {
      text: [
        row.person?.name,
        row.person?.email,
        row.message,
        row.suspensionReason,
        appealCode(row.id),
      ],
    }
  }
  if (tab.value === 'people') return { text: [row.name, row.email] }
  return {
    text: [ACTION_LABELS[row.action], row.reason, row.admin?.name, row.user?.name],
    itemId: row.itemId ?? undefined,
    disputeId: row.disputeId ?? undefined,
    reportId: row.reportId ?? undefined,
  }
}

// The date a row is sorted by: when the case was opened, or for a person,
// their latest admin action
function dateOf(row) {
  if (tab.value === 'people') return row.lastAction?.createdAt || row.suspendedAt || ''
  return row.createdAt || ''
}

// How many are in each "Show" group, for the counts you click
function countFor(value) {
  if (tab.value === 'people') {
    if (value === 'suspended') return people.value.filter((row) => row.suspendedAt).length
    if (value === 'warned') return people.value.filter((row) => row.warnings > 0).length
    return people.value.length
  }
  const list = { disputes, reports, appeals }[tab.value].value
  if (value === 'open') return list.filter((row) => row.status === 'open').length
  if (value === 'decided') return list.filter((row) => row.status !== 'open').length
  return list.length
}
const filterOptions = computed(() =>
  SHOWS[tab.value]
    ? SHOWS[tab.value].map((entry) => ({ ...entry, count: countFor(entry.value) }))
    : null,
)

// The whole list for the tab, filter, search and sort; then the page on show
const rows = computed(() => {
  let list = actions.value
  if (tab.value === 'disputes') list = byShow(disputes.value)
  if (tab.value === 'reports') list = byShow(reports.value)
  if (tab.value === 'appeals') list = byShow(appeals.value)
  if (tab.value === 'people') {
    list = people.value.filter((person) => {
      if (show.value === 'suspended') return Boolean(person.suspendedAt)
      if (show.value === 'warned') return person.warnings > 0
      return true
    })
  }
  const found = list.filter((row) => matchesQuery(query.value, searchTarget(row)))
  const direction = sort.value === 'oldest' ? 1 : -1
  return found.sort((a, b) => direction * dateOf(a).localeCompare(dateOf(b)) || a.id - b.id)
})
const shown = computed(() => pageOf(rows.value, page.value))

// Waiting too long, or reopened: said under the title
const needAttention = computed(
  () => disputes.value.filter((dispute) => disputeFlags(dispute, now.value).length).length,
)
const attentionText = computed(
  () => `${needAttention.value} ${needAttention.value === 1 ? 'needs' : 'need'} attention`,
)
// The rack shows what is waiting; anything else is a list
const onRack = computed(
  () => ['disputes', 'reports', 'appeals'].includes(tab.value) && show.value === 'open',
)
const rackEntries = computed(() =>
  rows.value.map((row) => {
    if (tab.value === 'appeals') {
      return {
        id: row.id,
        code: appealCode(row.id),
        title: row.person?.name || 'Someone',
        initials: initials(row.person?.name),
        hours: (now.value - new Date(row.createdAt)) / 3600000,
        wait: waitingWords(row.createdAt, now.value).text,
      }
    }
    const isDispute = tab.value === 'disputes'
    const item = row.item
    const isMessage = !isDispute && row.kind === 'message'
    return {
      id: row.id,
      code: isDispute ? disputeCode(row.id) : reportCode(row.id),
      title: isMessage ? 'Chat message' : item?.title || 'Post',
      category: item?.category,
      colour: mainColour(item),
      photoUrl: isMessage ? '' : item?.photoUrl,
      hours: (now.value - new Date(row.createdAt)) / 3600000,
      wait: waitingWords(row.createdAt, now.value).text,
    }
  }),
)
const pickedId = ref(null)
const aim = ref(null)
const pickedRow = computed(
  () => rows.value.find((row) => row.id === pickedId.value) || rows.value[0] || null,
)

// A double click on a tag goes straight to its case
function openCase(id) {
  // An appeal is decided on its ticket; there is no page to open
  if (tab.value === 'appeals') return
  router.push(tab.value === 'disputes' ? `/admin/disputes/${id}` : `/admin/reports/${id}`)
}

// What the page is about right now, in one line
const heading = computed(() => {
  if (tab.value === 'people') return 'People on record'
  if (tab.value === 'log') return 'Action log'
  const count = { disputes: openDisputes, reports: openReports, appeals: openAppeals }[tab.value]
    .value.length
  const noun = { disputes: 'dispute', reports: 'report', appeals: 'appeal' }[tab.value]
  if (count === 0) return 'Nothing is hanging'
  return `${count} ${noun}${count === 1 ? ' is' : 's are'} hanging`
})

const emptyText = computed(() => {
  if (query.value.trim()) return `Nothing matches “${query.value.trim()}”.`
  if (tab.value === 'disputes') {
    return show.value === 'open' ? 'No disputes waiting.' : 'No disputes here yet.'
  }
  if (tab.value === 'reports') {
    return show.value === 'open' ? 'No reports waiting.' : 'No reports here yet.'
  }
  if (tab.value === 'appeals') {
    return show.value === 'open' ? 'No appeals waiting.' : 'No appeals here yet.'
  }
  if (tab.value === 'people') {
    if (show.value === 'suspended') return 'Nobody is suspended.'
    if (show.value === 'warned') return 'Nobody has been warned.'
    return 'Nobody has been warned or suspended.'
  }
  return 'No admin actions yet.'
})

// Keep the list's settings in the address bar, leaving out the defaults,
// without adding a history entry each time
function syncQuery() {
  const next = {}
  if (tab.value !== 'disputes') next.tab = tab.value
  if (SHOWS[tab.value] && show.value !== defaultShow(tab.value)) next.show = show.value
  if (sort.value !== defaultSort(tab.value, show.value)) next.sort = sort.value
  if (query.value.trim()) next.q = query.value.trim()
  if (shown.value.page > 1) next.page = String(shown.value.page)
  router.replace({ query: next })
}

// A new tab starts from its own defaults, with an empty search
function chooseTab(name) {
  if (name === tab.value) return
  tab.value = name
  show.value = defaultShow(name)
  sort.value = defaultSort(name, show.value)
  query.value = ''
  page.value = 1
  notice.value = ''
  syncQuery()
}

// Arrow keys, Home and End move between the tabs, as in any tab list
function onTabKey(event, index) {
  const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 }
  if (!(event.key in moves)) return
  event.preventDefault()
  const next = (moves[event.key] + TABS.length) % TABS.length
  chooseTab(TABS[next].name)
  tabButtons.value[next]?.focus()
}

// True while the page is copying the settings from a new address (below), so
// the watchers that follow just leave them as the address says
let followingAddress = false

// A new filter, search or sort starts again from page 1
watch(show, (value) => {
  if (followingAddress) return
  sort.value = defaultSort(tab.value, value)
  page.value = 1
  syncQuery()
})
watch([sort, query], () => {
  if (followingAddress) return
  page.value = 1
  syncQuery()
})

// The address can change while this page stays open: the header's Admin link
// (back to /admin), Back and Forward, or a pasted /admin?tab=people. Vue
// Router keeps the same page then, so copy the new settings across. The page's
// own router.replace (syncQuery) lands here too; it already matches, so
// nothing changes. The search is compared trimmed, as syncQuery saves it, so
// a space being typed is never taken away.
const ownPath = route.path
watch(
  () => route.query,
  async (address) => {
    // Leaving for another page (e.g. a case) is not a new list to show
    if (route.path !== ownPath) return
    const wanted = settingsFrom(address || {})
    const same =
      wanted.tab === tab.value &&
      wanted.show === show.value &&
      wanted.sort === sort.value &&
      wanted.query === query.value.trim() &&
      wanted.page === shown.value.page
    if (same) return
    followingAddress = true
    if (wanted.tab !== tab.value) notice.value = ''
    tab.value = wanted.tab
    show.value = wanted.show
    sort.value = wanted.sort
    if (wanted.query !== query.value.trim()) query.value = wanted.query
    page.value = wanted.page
    // The watchers above run before this resolves, while the flag is still up
    await nextTick()
    followingAddress = false
  },
)

// A new page: bring the top of the list back into view if it scrolled away
async function changePage(number) {
  page.value = number
  syncQuery()
  await nextTick()
  if (panel.value && panel.value.getBoundingClientRect().top < 0) {
    panel.value.scrollIntoView({ block: 'start' })
  }
}

// After an appeal is decided: say so, and load the appeals, people and log again
async function onAppealDecided(message) {
  notice.value = message
  pickedId.value = null
  try {
    const [appealResponse, , actionResponse] = await Promise.all([
      api.get('/admin/appeals', { params: { status: 'all' } }),
      loadPeople(),
      api.get('/admin/actions'),
    ])
    appeals.value = appealResponse.data
    actions.value = actionResponse.data
  } catch (error) {
    errorMessage.value = errorText(error)
  }
}

async function loadPeople() {
  people.value = (await api.get('/admin/users')).data
}

// After a suspension is lifted: say so, and load the people and the log again
async function onPeopleChanged(message) {
  notice.value = message
  try {
    const [, actionResponse] = await Promise.all([loadPeople(), api.get('/admin/actions')])
    actions.value = actionResponse.data
  } catch (error) {
    errorMessage.value = errorText(error)
  }
}

// The four lists load side by side. Promise.allSettled waits for all of them
// even if one fails, so a broken list never blanks the others.
onMounted(async () => {
  const results = await Promise.allSettled([
    api.get('/admin/disputes', { params: { status: 'all' } }),
    api.get('/admin/reports', { params: { status: 'all' } }),
    api.get('/admin/users'),
    api.get('/admin/actions'),
    api.get('/admin/appeals', { params: { status: 'all' } }),
  ])
  const lists = [disputes, reports, people, actions, appeals]
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') lists[index].value = result.value.data
  })
  const failed = results.find((result) => result.status === 'rejected')
  if (failed) errorMessage.value = errorText(failed.reason)
  nothingLoaded.value = results.every((result) => result.status === 'rejected')
  now.value = new Date()
  isLoading.value = false
})
</script>

<template>
  <div class="ds admin-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap admin-main">
      <div class="admin-top">
        <div>
          <h1 class="ds-h1" data-testid="admin-title">{{ heading }}</h1>
          <p v-if="tab === 'disputes' && needAttention" class="admin-attention">
            {{ attentionText }}
          </p>
        </div>
        <div class="admin-search">
          <label for="admin-search" class="visually-hidden">Search</label>
          <input
            id="admin-search"
            v-model="query"
            type="search"
            :placeholder="current.search"
            autocomplete="off"
            data-testid="admin-search"
          />
        </div>
      </div>

      <div class="admin-tabs" role="tablist" aria-label="Admin lists">
        <button
          v-for="(entry, index) in TABS"
          :id="`admin-tab-${entry.name}`"
          :key="entry.name"
          ref="tabButtons"
          type="button"
          role="tab"
          :aria-selected="tab === entry.name"
          aria-controls="admin-panel"
          :tabindex="tab === entry.name ? 0 : -1"
          :class="{ 'is-active': tab === entry.name }"
          :data-testid="`admin-tab-${entry.name}`"
          @click="chooseTab(entry.name)"
          @keydown="onTabKey($event, index)"
        >
          {{ entry.title }}
          <b v-if="entry.name === 'disputes'">{{ openDisputes.length }}</b>
          <b v-else-if="entry.name === 'reports'">{{ openReports.length }}</b>
          <b v-else-if="entry.name === 'appeals'">{{ openAppeals.length }}</b>
          <b v-else-if="entry.name === 'people'">{{ people.length }}</b>
        </button>
      </div>

      <div v-if="errorMessage" class="sg-alert" role="alert" data-testid="admin-error">
        {{ errorMessage }}
      </div>
      <PageSkeleton v-if="isLoading" kind="rows" label="Loading the queue…" />

      <section
        v-else-if="!nothingLoaded"
        id="admin-panel"
        ref="panel"
        class="admin-panel"
        role="tabpanel"
        :aria-labelledby="`admin-tab-${tab}`"
        :data-testid="`admin-${tab}`"
      >
        <div v-if="notice" class="sg-notice" role="status" data-testid="admin-notice">
          {{ notice }}
        </div>

        <template v-if="onRack && shown.total > 0">
          <AdminRack
            :entries="rackEntries"
            :picked="pickedRow?.id"
            :label="`Waiting ${current.title.toLowerCase()}, ${sort} first`"
            @pick="pickedId = $event"
            @open="openCase"
            @aim="aim = $event"
          >
            <template #tools>
              <AdminFilters v-model:show="show" v-model:sort="sort" :options="filterOptions" />
            </template>
          </AdminRack>
          <AdminTicket
            v-if="pickedRow"
            :key="pickedRow.id"
            :dispute="tab === 'disputes' ? pickedRow : null"
            :report="tab === 'reports' ? pickedRow : null"
            :appeal="tab === 'appeals' ? pickedRow : null"
            :now="now"
            :aim="aim"
            @decided="onAppealDecided"
          />
        </template>

        <template v-else>
          <div class="admin-tools">
            <AdminFilters v-model:show="show" v-model:sort="sort" :options="filterOptions" />
          </div>

          <!-- A new tab, filter or page fades the list in; typing a search
               does not, so the rows never flicker under the keyboard -->
          <Transition name="admin-swap" mode="out-in">
            <div :key="`${tab}-${show}-${sort}-${shown.page}`" class="admin-rows">
              <p v-if="shown.total === 0" class="admin-empty" data-testid="admin-empty">
                {{ emptyText }}
              </p>
              <AdminDisputeRows
                v-else-if="tab === 'disputes'"
                :rows="shown.rows"
                :show="show"
                :now="now"
              />
              <AdminReportRows
                v-else-if="tab === 'reports'"
                :rows="shown.rows"
                :show="show"
                :now="now"
              />
              <AdminAppealRows v-else-if="tab === 'appeals'" :rows="shown.rows" />
              <AdminPeopleRows
                v-else-if="tab === 'people'"
                :rows="shown.rows"
                @changed="onPeopleChanged"
              />
              <AdminLogRows v-else :rows="shown.rows" />
            </div>
          </Transition>

          <ListPager
            :page="shown.page"
            :total="shown.total"
            :noun="current.title.toLowerCase()"
            @update:page="changePage"
          />
        </template>
      </section>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  /* The wave wallpaper, with its moving trail (TrailBackdrop) */
  background: var(--fi-backdrop);
  isolation: isolate;
}

.admin-main {
  flex: 1;
  padding-bottom: var(--ds-space-7);
}

.admin-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--ds-space-5);
  padding-block: var(--ds-space-6) var(--ds-space-3);
}

.admin-search {
  flex: 0 0 20rem;
  max-width: 100%;
}

.admin-search input {
  width: 100%;
  height: var(--ds-control-h);
  padding-inline: var(--ds-space-3);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-text);
}

.admin-tabs {
  display: flex;
  gap: var(--ds-space-5);
  overflow-x: auto;
  border-bottom: 1px solid var(--ds-border);
  scrollbar-width: none;
}

.admin-tabs button {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-2);
  min-height: var(--ds-control-h);
  margin-bottom: -1px;
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--ds-text-muted);
  font-weight: var(--ds-weight-medium);
  cursor: pointer;
  transition: color var(--ds-dur-fast) var(--ds-ease-out);
}

.admin-tabs button:hover {
  color: var(--ds-text);
}

.admin-tabs button.is-active {
  border-bottom-color: var(--ds-action);
  color: var(--ds-text);
  font-weight: var(--ds-weight-bold);
}

/* The count in a small round badge, navy on the open tab, as on Returns */
.admin-tabs b {
  display: inline-block;
  min-width: 1.75rem;
  margin-inline-start: var(--ds-space-1);
  padding: 0.125rem var(--ds-space-2);
  border-radius: var(--ds-radius-round);
  background: color-mix(in srgb, var(--ds-text-muted) 20%, transparent);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
  line-height: var(--ds-leading-caption);
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.admin-tabs button.is-active b {
  background: var(--ds-action);
  color: var(--ds-on-action);
}

.admin-tools {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--ds-space-3) var(--ds-space-5);
  padding-block: var(--ds-space-3);
}

.admin-empty {
  padding: var(--ds-space-7) var(--ds-space-5);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  color: var(--ds-text-muted);
  text-align: center;
}

.admin-attention {
  margin-top: var(--ds-space-1);
  color: var(--ds-warning);
  font-weight: var(--ds-weight-bold);
}

.admin-swap-enter-active {
  transition: opacity var(--ds-dur-base) var(--ds-ease-out);
}

.admin-swap-leave-active {
  transition: opacity var(--ds-dur-fast) var(--ds-ease-in);
}

.admin-swap-enter-from,
.admin-swap-leave-to {
  opacity: 0;
}

@media (max-width: 767.98px) {
  .admin-top {
    flex-direction: column;
    align-items: stretch;
    gap: var(--ds-space-3);
    padding-top: var(--ds-space-5);
  }

  .admin-search {
    flex: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .admin-swap-enter-active,
  .admin-swap-leave-active {
    transition: none;
  }
}
</style>
