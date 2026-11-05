<template>
  <div class="ds feed-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap feed-main">
      <!-- A logged-in student with a new match -->
      <FeedHero
        v-if="hero && matchesArrived && showItems"
        class="feed-banner"
        :hero="hero"
        :greeting="greeting(now)"
        :first-name="firstName"
        :show-all="myMatches.length > 1"
      />

      <!-- An admin's to-do list -->
      <section
        v-if="needs"
        class="feed-needs"
        aria-labelledby="needs-title"
        data-testid="feed-needs"
      >
        <h2 id="needs-title" class="feed-needs__heading">Needs you</h2>
        <p v-if="needsRows.length === 0" class="feed-needs__clear" data-testid="feed-needs-clear">
          All clear. No open disputes or reported posts right now.
        </p>
        <ul v-else class="feed-needs__list">
          <li v-for="row in needsRows" :key="row.key" class="feed-needs__row">
            <span class="feed-needs__dot" :class="`is-${row.tone}`" aria-hidden="true"></span>
            <span class="feed-needs__words">
              <span class="feed-needs__title">{{ row.title }}</span>
              <span class="feed-needs__note">{{ row.note }}</span>
            </span>
            <BaseButton to="/admin" variant="secondary" size="sm" class="feed-needs__action">
              {{ row.action }}
            </BaseButton>
          </li>
        </ul>
      </section>

      <section id="this-week" class="feed-week" aria-labelledby="week-title">
        <div class="feed-layout">
          <header class="feed-head">
            <h1 id="week-title" class="feed-title" data-testid="feed-title">
              <span class="feed-title__side" :class="`is-${filters.type}`">{{ side.word }}</span>
              on campus
              <span v-if="isAdmin" class="feed-admin-badge">Admin view</span>
            </h1>
            <p class="feed-lead" aria-live="polite" data-testid="feed-lead">{{ side.lead }}</p>
          </header>

          <!-- Found or lost, as tabs with their counts -->
          <div class="feed-types" role="group" aria-label="Found or lost">
            <button
              type="button"
              class="feed-types__option is-found"
              :aria-pressed="filters.type === 'found'"
              data-testid="feed-type-found"
              @click="setType('found')"
            >
              Found items
              <span v-if="showCounts" class="feed-types__count">{{ found.length }}</span>
            </button>
            <button
              type="button"
              class="feed-types__option is-lost"
              :aria-pressed="filters.type === 'lost'"
              data-testid="feed-type-lost"
              @click="setType('lost')"
            >
              Lost reports
              <span v-if="showCounts" class="feed-types__count">{{ lost.length }}</span>
            </button>
          </div>

          <FeedFilters
            v-model="searchText"
            :family="filters.family"
            :counts="showCounts ? counts : null"
            @family="setFamily"
          />

          <div class="feed-toolbar">
            <p class="feed-count" data-testid="feed-count">
              <template v-if="showCounts">
                <span class="feed-count__main">{{ countLine }}</span>
                <span v-if="!hasActiveFilters(filters)" class="feed-count__window"
                  >Showing past {{ WINDOW_DAYS }} days</span
                >
                <span v-if="isAtLimit" class="feed-count__window" data-testid="feed-limit"
                  >Showing the newest {{ FEED_LIMIT }}</span
                >
              </template>
              <button
                v-if="hasActiveFilters(filters)"
                type="button"
                class="feed-clear"
                data-testid="feed-clear"
                @click="clearFilters"
              >
                Clear search
              </button>
            </p>

            <div class="feed-density" role="group" aria-label="Show as">
              <button
                type="button"
                class="feed-density__option"
                :aria-pressed="density === 'comfortable'"
                aria-label="Show as a grid"
                title="Grid"
                data-testid="feed-view-tags"
                @click="pickDensity('comfortable')"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <rect x="3" y="3" width="5.5" height="5.5" rx="1" />
                  <rect x="11.5" y="3" width="5.5" height="5.5" rx="1" />
                  <rect x="3" y="11.5" width="5.5" height="5.5" rx="1" />
                  <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                class="feed-density__option"
                :aria-pressed="density === 'compact'"
                aria-label="Show as a list"
                title="List"
                data-testid="feed-view-list"
                @click="pickDensity('compact')"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M3 4.5h14M3 10h14M3 15.5h14" />
                </svg>
              </button>
            </div>
          </div>

          <div class="feed-results">
            <!-- Grey shapes the size of the real cards or rows, so nothing jumps -->
            <div v-if="!showItems" class="feed-skeleton" role="status" data-testid="feed-loading">
              <span class="visually-hidden"
                >Loading {{ filters.type === 'lost' ? 'lost reports' : 'found items' }}…</span
              >
              <ul v-if="density === 'comfortable'" class="feed-skeleton__grid" aria-hidden="true">
                <li v-for="n in PAGE_SIZE" :key="n" class="feed-skeleton__card">
                  <span class="ds-skeleton feed-skeleton__photo"></span>
                  <span class="ds-skeleton feed-skeleton__bar"></span>
                  <span class="ds-skeleton feed-skeleton__bar is-title"></span>
                  <span class="ds-skeleton feed-skeleton__bar"></span>
                </li>
              </ul>
              <ul v-else class="feed-skeleton__list" aria-hidden="true">
                <li v-for="n in PAGE_SIZE" :key="n" class="feed-skeleton__row">
                  <span class="ds-skeleton feed-skeleton__thumb"></span>
                  <span class="feed-skeleton__words">
                    <span class="ds-skeleton feed-skeleton__bar is-title"></span>
                    <span class="ds-skeleton feed-skeleton__bar"></span>
                  </span>
                </li>
              </ul>
            </div>

            <div v-else-if="errorMessage" class="feed-message" role="alert">
              <p class="feed-message__words" data-testid="feed-error">{{ errorMessage }}</p>
              <BaseButton variant="secondary" data-testid="feed-retry" @click="loadItems">
                Try again
              </BaseButton>
            </div>

            <div v-else-if="shown.length === 0" class="feed-message" data-testid="feed-empty">
              <p class="feed-message__words">
                {{
                  hasActiveFilters(filters)
                    ? 'Nothing matches your search.'
                    : filters.type === 'found'
                      ? 'No finds in the last 30 days.'
                      : 'No open lost reports.'
                }}
              </p>
              <BaseButton
                v-if="hasActiveFilters(filters)"
                variant="secondary"
                @click="clearFilters"
              >
                Clear search
              </BaseButton>
            </div>

            <template v-else>
              <!-- A sideways swipe over the items turns the page on a phone -->
              <div class="feed-swipe" @touchstart.passive="swipeStart" @touchend.passive="swipeEnd">
                <FeedGrid
                  v-if="density === 'comfortable'"
                  ref="listEl"
                  :tags="tags"
                  :type="filters.type"
                  :swap-key="swapKey"
                />
                <FeedList
                  v-else
                  ref="listEl"
                  :rows="rows"
                  :type="filters.type"
                  :swap-key="swapKey"
                />
              </div>
              <FeedPager
                v-if="pages > 1"
                :page="page"
                :pages="pages"
                :numbers="numbers"
                :type="filters.type"
                @go="setPage"
              />
            </template>
          </div>
        </div>
      </section>
    </main>

    <AppFooter />
  </div>
</template>

<script setup>
// WS2. The feed: every found and lost item from the last 30 days. Anyone can
// browse it without signing in. The filters are kept in the address bar.
//
// It answers one question: has anything that might be mine been handed in?
// From top to bottom:
//   - a banner for a student with a new match
//   - "Needs you" for an admin (open disputes and reported posts)
//   - the heading, then Found / Lost with their counts and the search. From
//     1024px they share a row (Found / Lost over the categories, the search
//     over the items) that stays at the top while the page scrolls; below
//     that only the search stays, with Found / Lost and the category chips
//     under it.
//   - the categories (down the left from 1024px), the count, the items
//     (eight to a page: two rows of 4 on a laptop) and the page buttons
// The items show as luggage tags in a grid (tap one to turn it over), or as
// a compact list for scanning: the Grid / List switch beside the count,
// remembered on this device as the row size (utils/density.js: comfortable
// is the grid, compact is the list).
//
// This page loads the data and decides what to show. The parts are
// components in components/feed/: FeedHero, FeedFilters, FeedGrid (with
// FeedTag), FeedList and FeedPager. Anything that fails to load is left out rather than shown broken.
// It uses the design system in assets/system.css (class="ds").
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useMatchesStore } from '@/stores/matches'
import AppFooter from '@/components/ui/AppFooter.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import FeedHero from '@/components/feed/FeedHero.vue'
import FeedFilters from '@/components/feed/FeedFilters.vue'
import FeedGrid from '@/components/feed/FeedGrid.vue'
import FeedList from '@/components/feed/FeedList.vue'
import FeedPager from '@/components/feed/FeedPager.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import { buildingLabel } from '@/utils/campus-layout'
import { itemTone } from '@/utils/matches'
import {
  filtersFromQuery,
  filtersToQuery,
  hasActiveFilters,
  PAGE_SIZE,
  pageFromQuery,
  pageCount,
  swipeStep,
  buildItemParams,
  applyFilters,
  isThisWeek,
  WINDOW_DAYS,
  FEED_LIMIT,
  tagPlace,
  itemState,
  tagAsk,
  rowStatus,
  familyCounts,
  greeting,
  greetingName,
  gapInWords,
  itemWord,
} from '@/utils/feed'
import { itemNumber } from '@/utils/design'
import { currentDensity, setDensity } from '@/utils/density'
import { pageNumbers } from '@/utils/pager'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const now = ref(new Date())
// Moves "now" on every minute, so "Today" and "this week" stay right in a page
// left open overnight
const clock = setInterval(() => (now.value = new Date()), 60 * 1000)
onBeforeUnmount(() => clearInterval(clock))
const spots = ref([])
const spotsById = computed(() => new Map(spots.value.map((spot) => [spot.id, spot])))

const found = ref([])
const lost = ref([])
const isLoading = ref(true)
const errorMessage = ref('')

const filters = ref(filtersFromQuery(route.query))
const searchText = ref(filters.value.q)
const requestedPage = ref(pageFromQuery(route.query))
// The list, to scroll back up to after a page change
const listEl = ref(null)

// Tags (comfortable) or the compact list, remembered on this device
const density = ref(currentDensity())
function pickDensity(value) {
  density.value = value
  setDensity(value)
}

const isAdmin = computed(() => auth.isAdmin)

// ---- Loading ---------------------------------------------------------------

// Loads the found and lost items
async function loadItems() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const [foundRes, lostRes] = await Promise.all([
      api.get('/items', { params: buildItemParams('found', now.value) }),
      api.get('/items', { params: buildItemParams('lost', now.value) }),
    ])
    found.value = foundRes.data
    lost.value = lostRes.data
  } catch (error) {
    found.value = []
    lost.value = []
    errorMessage.value = error.response?.data?.error || 'Could not load the feed. Please try again.'
  } finally {
    isLoading.value = false
  }
}

// The extras below fail quietly: the feed still works without them

// A signed-in student's matches, for the banner
const matchesStore = useMatchesStore()
const isStudent = computed(() => auth.isLoggedIn && !auth.isAdmin)

// The items wait for the matches (for 1.5 seconds at most), so the banner and
// the items appear together
const MATCHES_WAIT_MS = 1500
const matchesArrived = ref(false)
const waitedForMatches = ref(false)
const showItems = computed(
  () => !isLoading.value && (!isStudent.value || matchesArrived.value || waitedForMatches.value),
)
let matchesTimer = null
function loadMatches() {
  if (!isStudent.value) return
  matchesTimer = setTimeout(() => (waitedForMatches.value = true), MATCHES_WAIT_MS)
  matchesStore.refresh().then((worked) => {
    clearTimeout(matchesTimer)
    // If the check failed, the banner stays hidden
    if (worked) matchesArrived.value = true
    else waitedForMatches.value = true
  })
}
onBeforeUnmount(() => clearTimeout(matchesTimer))

// The counts wait for the items, so the page never shows "0" while loading
// or after an error
const showCounts = computed(() => showItems.value && !errorMessage.value)
// The student's new matches on open lost reports, best first
const myMatches = computed(() =>
  matchesStore.reports
    .filter((report) => report.item.status === 'open')
    .flatMap((report) =>
      report.matches
        .filter((match) => match.status === 'suggested')
        .map((match) => ({ ...match, lostItem: report.item })),
    )
    .sort((a, b) => b.score - a.score),
)

// For an admin: the open disputes and reported posts
const needs = ref(null)
async function loadNeeds() {
  if (!isAdmin.value) return
  try {
    const [disputes, reports] = await Promise.all([
      api.get('/admin/disputes', { params: { status: 'open' } }),
      api.get('/admin/reports', { params: { status: 'open' } }),
    ])
    needs.value = { disputes: disputes.data, reports: reports.data }
  } catch {
    needs.value = null
  }
}

onMounted(async () => {
  try {
    spots.value = (await api.get('/spots')).data
  } catch {
    // Places then show as "Unknown place"; the feed still works
  }
})
onMounted(() => {
  loadItems()
  loadMatches()
  loadNeeds()
})

// ---- Filters ---------------------------------------------------------------

// Puts the filters in the address bar. This also goes back to page 1.
function applyToAddress() {
  if (route.path !== '/feed') return
  router.replace({ query: filtersToQuery(filters.value) })
}

// The Found / Lost switch
function setType(type) {
  filters.value.type = type
  applyToAddress()
}

// A category chip
function setFamily(family) {
  filters.value.family = family
  applyToAddress()
}

// "Clear search"
function clearFilters() {
  filters.value = filtersFromQuery({ type: filters.value.type })
  searchText.value = ''
  applyToAddress()
}

// Searches 250ms after the typing stops, not on every key
let searchTimer = null
watch(searchText, (text) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    filters.value.q = text
    applyToAddress()
  }, 250)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

// Reads the filters again when the address changes (for example, the back
// button). It ignores the address of the next page while the feed fades out.
watch(
  () => route.query,
  (query) => {
    if (route.path !== '/feed') return
    filters.value = filtersFromQuery(query)
    if (searchText.value.trim() !== filters.value.q) searchText.value = filters.value.q
    requestedPage.value = pageFromQuery(query)
  },
)

// ---- What to show ----------------------------------------------------------

// The items on the chosen side, and those that fit the category and search
const pool = computed(() => (filters.value.type === 'found' ? found.value : lost.value))
const shown = computed(() => applyFilters(pool.value, filters.value, spotsById.value))
// True when the side reached the most the feed loads, so older items are left out
const isAtLimit = computed(() => pool.value.length >= FEED_LIMIT)
// How many items each category has on this side, within the search. The
// Found / Lost switch counts the same 30 days the list shows; the count line
// says how many of those came in this week.
const counts = computed(() => familyCounts(pool.value, filters.value.q, spotsById.value))

// The heading's first word and the line under it
const side = computed(() => {
  const lost = filters.value.type === 'lost'
  let lead
  if (isAdmin.value) {
    lead = lost
      ? 'Everything reported lost and still open, from the last 30 days.'
      : 'Everything handed in over the last 30 days.'
  } else {
    lead = lost
      ? 'Things people are looking for. Seen one? Report it found.'
      : 'Things people handed in. Where each was found stays private until your lost report matches it.'
  }
  return { word: lost ? 'Lost' : 'Found', lead }
})

// "29 found this week", or "3 lost reports match your search"
const countLine = computed(() => {
  const words = filters.value.type === 'found' ? 'found items' : 'lost reports'
  if (hasActiveFilters(filters.value)) {
    const one = shown.value.length === 1
    return `${shown.value.length} ${one ? words.slice(0, -1) : words} ${one ? 'matches' : 'match'} your search`
  }
  const week = shown.value.filter((item) => isThisWeek(item, now.value)).length
  return `${week} ${filters.value.type} this week`
})

// The props for one row of the list
function rowFor(item) {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    photoUrl: item.photoUrl || '',
    status: rowStatus(item),
    number: itemNumber(item),
    tone: itemTone(item),
    to: `/items/${item.id}/record`,
  }
}

// The student's matches by found item id, for the backs of the tags
const matchesByFind = computed(
  () =>
    new Map(
      matchesStore.reports.flatMap((report) =>
        report.matches.filter((match) => match.item).map((match) => [match.item.id, match]),
      ),
    ),
)

// The props for one tag
function tagFor(item) {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    photoUrl: item.photoUrl || '',
    state: itemState(item),
    type: item.type,
    tone: itemTone(item),
    to: `/items/${item.id}/record`,
    // For the back of the tag
    ask: tagAsk(item, { userId: auth.user?.id ?? null, matchesByFind: matchesByFind.value }),
    description: item.description || '',
  }
}

// The page to show (never past the last page), and its items as tags or rows
const pages = computed(() => pageCount(shown.value.length))
const page = computed(() => Math.min(requestedPage.value, pages.value))
const numbers = computed(() => pageNumbers(page.value, pages.value))
const onPage = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return shown.value.slice(start, start + PAGE_SIZE)
})
const tags = computed(() => onPage.value.map(tagFor))
const rows = computed(() => onPage.value.map(rowFor))

// The rows arrive again whenever this changes
const swapKey = computed(() => `${filters.value.type}-${filters.value.family}-${page.value}`)

// Goes to another page and, if the first row is out of sight, scrolls up so it
// sits just under the header and the search, which stay stuck to the top
function setPage(to) {
  if (to < 1 || to > pages.value || to === page.value) return
  const query = { ...filtersToQuery(filters.value) }
  if (to > 1) query.page = String(to)
  router.replace({ query })
  nextTick(() => {
    const list = listEl.value?.listEl
    if (!list) return
    const top = list.getBoundingClientRect().top
    // Below the search (which is stuck to the top when the page is scrolled
    // down) and the band of page colour under it
    const search = document.querySelector('.feed-search')
    const covered = (search ? search.getBoundingClientRect().bottom : 65) + 20
    if (top >= covered) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo?.({
      top: window.scrollY + top - covered,
      behavior: still ? 'auto' : 'smooth',
    })
  })
}

// A sideways swipe over the items turns the page (swipeStep in utils/feed.js)
let swipeFrom = null
function swipeStart(event) {
  const touch = event.touches[0]
  swipeFrom =
    event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY, time: Date.now() } : null
}

function swipeEnd(event) {
  const touch = event.changedTouches[0]
  if (!swipeFrom || !touch) return
  const step = swipeStep(swipeFrom, { x: touch.clientX, y: touch.clientY, time: Date.now() })
  swipeFrom = null
  if (step) setPage(page.value + step)
}

// ---- Logged-in extras ------------------------------------------------------

const firstName = computed(() => greetingName(auth.user?.name))

// What the banner says about the best new match
const hero = computed(() => {
  const match = myMatches.value[0]
  const item = match?.item
  if (!match || !item || !item.trail?.length) return null
  const lostItem = match.lostItem
  // Where and when it was found stay out unless the server sent them
  const place = item.placeHidden ? '' : tagPlace(item, spotsById.value).building
  const lostPlaces = lostItem.trail.map((point) =>
    buildingLabel(spotsById.value.get(point.spotId)?.building || ''),
  )
  const lastLost = lostItem.trail[lostItem.trail.length - 1]
  const gap = lastLost && !item.placeHidden ? gapInWords(lastLost.to, item.trail[0].from) : ''
  const sameBuilding = Boolean(place) && lostPlaces.includes(place)
  return {
    word: itemWord(lostItem.category),
    title: item.title,
    place,
    gap,
    sameBuilding,
    photoUrl: item.photoUrl || '',
    category: item.category,
    tone: itemTone(item),
    to: `/items/${item.id}/record`,
  }
})

// The rows of the admin's "Needs you" list
const needsRows = computed(() => {
  if (!needs.value) return []
  const rows = []
  const disputes = needs.value.disputes
  if (disputes.length) {
    const oldest = Math.min(...disputes.map((d) => new Date(d.createdAt).getTime()))
    const days = Math.max(0, Math.floor((now.value - oldest) / 86400000))
    rows.push({
      key: 'disputes',
      title: `${disputes.length} open ${disputes.length === 1 ? 'dispute' : 'disputes'}`,
      note:
        days === 0
          ? 'Oldest waited less than a day'
          : `Oldest waited ${days} ${days === 1 ? 'day' : 'days'}`,
      action: 'Review',
      tone: 'navy',
    })
  }
  const reports = needs.value.reports
  if (reports.length) {
    rows.push({
      key: 'reports',
      title: `${reports.length} reported ${reports.length === 1 ? 'post' : 'posts'}`,
      note: 'Hidden after 3 reports',
      action: 'Check',
      tone: 'red',
    })
  }
  return rows
})
</script>

<style scoped>
.feed-page {
  --lost: #b23e27;
  --brass-soft: #fbefd6;
  --lost-soft: #f9e1da;
  /* Brass dark enough to read on its tint */
  --brass-ink: #765a17;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  /* The pale blue waves and gold trail behind the whole page, with
     TrailBackdrop's moving pieces on top of them and under everything else */
  background: var(--fi-backdrop);
  isolation: isolate;
}

.feed-main {
  display: grid;
  gap: var(--ds-space-6);
  padding-block: var(--ds-space-6) var(--ds-space-8);
}

/* The page's grid. Phones and tablets: one column, in reading order, with
   the search staying in view. From 1024px the heading runs across the top,
   then Found / Lost sit over the categories and the search over the items,
   on a row that stays in view while the page scrolls; the categories sit
   down the left beside the count and the items. FeedFilters puts its search
   and categories into the search and cats areas. */
.feed-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    'head'
    'search'
    'types'
    'cats'
    'toolbar'
    'results';
  gap: var(--ds-space-4);
}

@media (min-width: 1024px) {
  .feed-layout {
    grid-template-columns: 17rem minmax(0, 1fr);
    grid-template-rows: auto auto auto 1fr;
    grid-template-areas:
      'head head'
      'types search'
      'cats toolbar'
      'cats results';
    align-items: start;
    gap: var(--ds-space-5) var(--ds-space-7);
  }
}

/* The banner sits in the page's grid, which spaces it */
.feed-banner {
  margin: 0;
}

.feed-head {
  grid-area: head;
  display: grid;
  gap: var(--ds-space-2);
}

.feed-title {
  font-size: var(--ds-size-h1);
  line-height: var(--ds-leading-h1);
}

/* "Found" in brass, "Lost" in brick red, matching the tags */
.feed-title__side {
  transition: color var(--ds-dur-slow) var(--ds-ease-out);
}

.feed-title__side.is-found {
  color: var(--fi-brass-strong);
}

.feed-title__side.is-lost {
  color: var(--lost);
}

.feed-admin-badge {
  display: inline-block;
  margin-left: var(--ds-space-2);
  padding: 0.125rem var(--ds-space-3);
  vertical-align: middle;
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface-sunken);
  color: var(--ds-text-muted);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-bold);
  letter-spacing: 0;
}

.feed-lead {
  color: var(--ds-text-muted);
}

/* Phones: tighter, and without the line under the heading, so the first
   cards show on the first screen */
@media (max-width: 575.98px) {
  .feed-main {
    gap: var(--ds-space-5);
    padding-top: var(--ds-space-5);
  }

  .feed-layout {
    gap: var(--ds-space-3);
  }

  .feed-lead {
    display: none;
  }
}

/* Found or lost: two tabs on a line across the page, the chosen one
   underlined in navy with its count filled. Halves on a phone. */
.feed-types {
  grid-area: types;
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-top: var(--ds-space-2);
  border-bottom: 1px solid var(--ds-border);
}

@media (min-width: 768px) {
  .feed-types {
    display: flex;
    gap: var(--ds-space-6);
  }
}

.feed-types__option {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-2);
  min-height: var(--ds-control-h-lg);
  padding: 0 var(--ds-space-1);
  border: 0;
  background: transparent;
  color: var(--ds-text-muted);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-body);
  font-weight: var(--ds-weight-medium);
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--ds-dur-fast) var(--ds-ease-out);
}

/* The underline: grey under a tab you point at, navy under the chosen one */
.feed-types__option::after {
  content: '';
  position: absolute;
  inset: auto 0 -1px;
  height: 2px;
  background: var(--ds-border-control);
  scale: 0 1;
  transition: scale var(--ds-dur-base) var(--ds-ease-out);
}

.feed-types__option:hover {
  color: var(--ds-text);
}

.feed-types__option:hover::after {
  scale: 1;
}

/* Each side in its own colour, as on the heading and the tags: Found in
   brass, Lost in brick red */
.feed-types__option.is-found {
  --side: var(--brass-ink);
  --side-soft: var(--brass-soft);
}

.feed-types__option.is-lost {
  --side: var(--lost);
  --side-soft: var(--lost-soft);
}

.feed-types__option[aria-pressed='true'] {
  color: var(--side);
  font-weight: var(--ds-weight-bold);
}

.feed-types__option[aria-pressed='true']::after {
  background: var(--side);
  scale: 1;
}

.feed-types__count {
  min-width: 1.75rem;
  padding: 0.125rem var(--ds-space-2);
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface-sunken);
  color: var(--ds-text);
  font-size: var(--ds-size-caption);
  line-height: var(--ds-leading-caption);
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
  text-align: center;
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    color var(--ds-dur-fast) var(--ds-ease-out);
}

.feed-types__option[aria-pressed='true'] .feed-types__count {
  background: var(--side-soft);
  color: var(--side);
}

/* From 1024px Found / Lost is a box of two, the chosen one in its side's tint,
   and it stays in view with the search beside it */
@media (min-width: 1024px) {
  .feed-types {
    position: sticky;
    top: calc(var(--ds-sticky-top, 0px) + 4rem + 1px + var(--ds-space-3));
    z-index: 5;
    gap: var(--ds-space-1);
    margin-top: 0;
    padding: var(--ds-space-1);
    border: 1px solid var(--ds-border);
    border-radius: var(--ds-radius-control);
    background: var(--ds-surface-sunken);
  }

  /* The band of page background behind it, as behind the search */
  .feed-types::before {
    content: '';
    position: absolute;
    inset: calc(-1 * var(--ds-space-3) - 1px) -1px;
    z-index: -1;
    background: var(--fi-page);
  }

  .feed-types__option {
    flex: 1 1 0;
    min-height: calc(var(--ds-control-h-lg) - 2 * var(--ds-space-1) - 2px);
    padding: 0 var(--ds-space-2);
    border: 1px solid transparent;
    border-radius: var(--ds-radius-control);
    font-size: var(--ds-size-small);
  }

  .feed-types__option::after {
    display: none;
  }

  .feed-types__option[aria-pressed='true'] {
    border-color: var(--side);
    background: var(--side-soft);
  }

  .feed-types__count {
    min-width: 0;
    padding: 0;
    background: transparent;
    color: var(--ds-text-muted);
  }

  .feed-types__option[aria-pressed='true'] .feed-types__count {
    background: transparent;
    color: var(--side);
  }
}

@media (prefers-reduced-motion: reduce) {
  .feed-types__option::after {
    transition: none;
  }
}

/* The count, with the row size at its end */
.feed-toolbar {
  grid-area: toolbar;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-3);
  min-height: var(--ds-control-h);
}

.feed-count {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ds-space-1) var(--ds-space-3);
  font-size: var(--ds-size-small);
}

.feed-count__main {
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
}

.feed-count__window {
  color: var(--ds-text-muted);
}

.feed-clear {
  position: relative;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ds-action);
  font-weight: var(--ds-weight-medium);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

/* A 44px tap area around the words */
.feed-clear::after {
  content: '';
  position: absolute;
  inset: -0.75rem -0.25rem;
}

.feed-clear:hover {
  color: var(--ds-action-hover);
  text-decoration-thickness: 2px;
}

.feed-density {
  display: inline-flex;
  flex-shrink: 0;
  gap: var(--ds-space-1);
}

.feed-density__option {
  display: grid;
  place-items: center;
  width: var(--ds-control-h);
  height: var(--ds-control-h);
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--ds-radius-control);
  background: transparent;
  color: var(--ds-text-muted);
  cursor: pointer;
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    color var(--ds-dur-fast) var(--ds-ease-out);
}

.feed-density__option:hover {
  background: var(--ds-surface-sunken);
  color: var(--ds-text);
}

.feed-density__option[aria-pressed='true'] {
  border-color: var(--ds-border-control);
  background: var(--ds-surface);
  color: var(--ds-text);
}

.feed-density__option svg {
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.feed-results {
  grid-area: results;
  min-width: 0;
}

/* Loading: grey cards or rows the size of the real ones (the grid matches
   FeedGrid's) */
.feed-skeleton__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ds-space-5) var(--ds-space-3);
}

@media (min-width: 768px) {
  .feed-skeleton__grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--ds-space-6) var(--ds-space-4);
  }
}

.feed-skeleton__card {
  display: grid;
  gap: var(--ds-space-2);
}

.feed-skeleton__photo {
  aspect-ratio: 1;
  margin-bottom: var(--ds-space-1);
  border-radius: var(--ds-radius-control);
}

.feed-skeleton__list {
  display: grid;
  border-block: 1px solid var(--ds-border);
}

.feed-skeleton__row {
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr);
  align-items: center;
  gap: var(--ds-space-4);
  padding: var(--ds-space-3) var(--ds-space-2);
}

.feed-skeleton__row + .feed-skeleton__row {
  border-top: 1px solid var(--ds-border);
}

:root[data-density='compact'] .feed-skeleton__row {
  grid-template-columns: 2.5rem minmax(0, 1fr);
  padding-block: var(--ds-space-2);
}

.feed-skeleton__thumb {
  aspect-ratio: 1;
  border-radius: var(--ds-radius-control);
}

.feed-skeleton__words {
  display: grid;
  gap: var(--ds-space-2);
}

.feed-skeleton__bar {
  width: 40%;
  height: 0.75rem;
}

.feed-skeleton__bar.is-title {
  width: 65%;
  height: 1rem;
}

/* Nothing to show, or it would not load: a quiet panel with one way on */
.feed-message {
  display: grid;
  justify-items: center;
  gap: var(--ds-space-4);
  padding: var(--ds-space-8) var(--ds-space-5);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  text-align: center;
}

.feed-message__words {
  color: var(--ds-text-muted);
}

/* An admin's to-do list */
.feed-needs {
  display: grid;
  gap: var(--ds-space-3);
  padding: var(--ds-space-4) var(--ds-space-5);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

.feed-needs__heading {
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-title);
  line-height: var(--ds-leading-title);
}

.feed-needs__clear {
  color: var(--ds-text-muted);
}

.feed-needs__list {
  display: grid;
}

.feed-needs__row {
  display: grid;
  grid-template-columns: 0.5rem minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ds-space-3);
  padding-block: var(--ds-space-2);
}

.feed-needs__row + .feed-needs__row {
  border-top: 1px solid var(--ds-border);
}

.feed-needs__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: var(--ds-radius-round);
  background: var(--ds-action);
}

.feed-needs__dot.is-red {
  background: var(--ds-danger);
}

.feed-needs__words {
  display: grid;
}

.feed-needs__title {
  font-weight: var(--ds-weight-bold);
}

.feed-needs__note {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}
</style>

<style>
/* Night mode: a lighter brick red, so "Lost" and the lost side's tags show on
   navy, and darker tints behind the chosen side. Not scoped, so it can match <html>. */
:root[data-theme='night'] .feed-page {
  --lost: #f29483;
  --brass-soft: #3a2f17;
  --lost-soft: #3a1f28;
  --brass-ink: var(--fi-brass-strong);
}
</style>
