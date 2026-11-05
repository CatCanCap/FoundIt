<script setup>
// Matches (WS3): your lost reports and what has turned up for each. The page
// answers "has anything turned up for what I lost, and is it mine?"
//
// The reports hang as one row of luggage tags that scrolls sideways
// (ReportRail). Picking a tag shows that report under the rail: one line of
// facts, with "Details" to unfold and edit it (ReportDetails), then its finds
// (ReportFinds): the best one large with "This is mine" and "Not mine", the
// others as rows that open on the finds page.
//
// Filters over the tags (All, Finds to check, Being returned, No finds yet)
// live in the address bar as ?show=, the search as ?q= (the box shows once
// there are 9 reports), and the report shown as ?report=.
//
// "Not mine" hides the find at once and offers Undo for a few seconds; only
// then is it saved (the store's rejectMatch), as on the finds page. Picking
// another report or leaving the page saves it straight away.
//
// Data: the reports come from stores/matches.js (GET /api/matches/mine), the
// same store the header's MATCHES badge counts, plus GET /api/spots,
// /api/categories and /api/colours. Saving the details is
// PATCH /api/items/:id, which also checks the report against every find
// again. "I found it myself" is the store's closeReport.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import api from '@/api'
import AppFooter from '@/components/ui/AppFooter.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import CloseReport from '@/components/matches/CloseReport.vue'
import ReportDetails from '@/components/matches/ReportDetails.vue'
import ReportFinds from '@/components/matches/ReportFinds.vue'
import ReportRail from '@/components/matches/ReportRail.vue'
import { useMatchesStore } from '@/stores/matches'
import {
  itemNoun,
  REPORT_FILTERS,
  REPORT_SEARCH_FROM,
  reportFilterFromQuery,
  reportKind,
  searchReports,
} from '@/utils/matches'

const route = useRoute()
const router = useRouter()
const matchesStore = useMatchesStore()
const { reports } = storeToRefs(matchesStore)

const spotsById = ref(new Map())
const categories = ref([])
const colours = ref([])
const loading = ref(true)
const errorMessage = ref('')
const busy = ref(false)

// The panel under the rail; the tags say they control it
const PANEL_ID = 'report-panel'
// How long "Not mine" can be undone
const UNDO_MS = 6000

async function load() {
  errorMessage.value = ''
  try {
    const [, spotsResponse] = await Promise.all([matchesStore.load(), api.get('/spots')])
    spotsById.value = new Map(spotsResponse.data.map((spot) => [spot.id, spot]))
  } catch (error) {
    errorMessage.value =
      error.response?.data?.error || 'Could not load your matches. Please try again.'
  } finally {
    loading.value = false
  }
  // The lists for the edit form; the page still works without them
  const [categoryResult, colourResult] = await Promise.allSettled([
    api.get('/categories'),
    api.get('/colours'),
  ])
  if (categoryResult.status === 'fulfilled' && Array.isArray(categoryResult.value.data)) {
    categories.value = categoryResult.value.data
  }
  if (colourResult.status === 'fulfilled' && Array.isArray(colourResult.value.data)) {
    colours.value = colourResult.value.data
  }
}

onMounted(load)

// ---- Back from clearing every find -----------------------------------------

// The finds page sends the owner back here with ?report=<id>&cleared=1 after
// "Not mine" on the last find, and "Not mine" here does the same. A short note
// says so above the report, until it is dismissed or another tag is picked.
// The flag leaves the address straight away, so a reload or a shared link
// doesn't show it again.
const clearedId = ref(route.query.cleared !== undefined ? Number(route.query.report) : null)
if (route.query.cleared !== undefined) {
  const query = { ...route.query }
  delete query.cleared
  router.replace({ query })
}
// Only while that report is shown and really has no finds left
const clearedReport = computed(() =>
  clearedId.value !== null &&
  current.value?.item.id === clearedId.value &&
  reportKind(current.value) === 'none'
    ? current.value
    : null,
)

// ---- Filters and search ----------------------------------------------------

const filter = computed(() => reportFilterFromQuery(route.query))
const filtered = computed(() =>
  filter.value
    ? reports.value.filter((report) => reportKind(report) === filter.value)
    : reports.value,
)
// All, plus each filter that has a report in it, with how many
const filterChips = computed(() =>
  REPORT_FILTERS.map((chip) => ({
    ...chip,
    count: chip.key
      ? reports.value.filter((report) => reportKind(report) === chip.key).length
      : reports.value.length,
  })).filter((chip) => chip.key === '' || chip.count > 0),
)

function setFilter(key) {
  if (key === filter.value) return
  const query = { ...route.query }
  delete query.report
  if (key) query.show = key
  else delete query.show
  router.replace({ query })
}

// The search box only shows once there are enough reports to need it. What
// is typed filters the tags at once; the address follows.
const showSearch = computed(() => reports.value.length >= REPORT_SEARCH_FROM)
const searchText = ref(typeof route.query.q === 'string' ? route.query.q : '')
watch(searchText, (text) => {
  const query = { ...route.query }
  if (text.trim()) query.q = text
  else delete query.q
  router.replace({ query })
})

const shown = computed(() =>
  showSearch.value ? searchReports(filtered.value, searchText.value) : filtered.value,
)
const searching = computed(() => showSearch.value && searchText.value.trim() !== '')

// The report shown: ?report=<id> if it is one of the tags, else the first
const current = computed(() => {
  const wanted = Number(route.query.report)
  return shown.value.find((report) => report.item.id === wanted) || shown.value[0] || null
})

// Picking a tag replaces the address rather than adding to it, so Back leaves
// the page instead of stepping through the tags
function pickReport(report) {
  router.replace({ query: { ...route.query, report: String(report.item.id) } })
}

// ---- The report shown --------------------------------------------------------

// Whether its details are unfolded; kept from one report to the next
const detailsOpen = ref(false)
const detailsEl = ref(null)

// "Add details" beside a report with no finds opens its edit form
function addDetails() {
  detailsEl.value?.startEdit({ reveal: true })
}

async function saveReport(fields) {
  await api.patch(`/items/${current.value.item.id}`, fields)
  // The server scored the report again, so its finds may have changed
  await matchesStore.refresh()
}

async function foundItMyself(item) {
  busy.value = true
  errorMessage.value = ''
  try {
    await matchesStore.closeReport(item.id)
    // The report has left the rail, so show the first one again
    const query = { ...route.query }
    delete query.report
    router.replace({ query })
  } catch (error) {
    errorMessage.value =
      error.response?.data?.error || 'Could not close that report. Please try again.'
  } finally {
    busy.value = false
  }
}

// ---- "Not mine", with Undo -------------------------------------------------

// Finds turned down: hidden while they wait out the Undo and while they save
const hiding = ref(new Set())
// The one waiting out its Undo: { match, reportId }. A shallow ref keeps the
// entry itself (not a reactive copy), so saveHidden can tell it apart.
const undoable = shallowRef(null)
let undoTimer = 0

function forget(matchId) {
  const next = new Set(hiding.value)
  next.delete(matchId)
  hiding.value = next
}

// Off the page now, saved when the Undo goes. Turning down another find first
// saves the one before it.
function notMine(match) {
  if (undoable.value) saveHidden(undoable.value)
  errorMessage.value = ''
  hiding.value = new Set([...hiding.value, match.id])
  const entry = { match, reportId: current.value.item.id }
  undoable.value = entry
  undoTimer = setTimeout(() => saveHidden(entry), UNDO_MS)
}

function undo() {
  clearTimeout(undoTimer)
  if (undoable.value) forget(undoable.value.match.id)
  undoable.value = null
}

async function saveHidden(entry) {
  if (undoable.value === entry) {
    clearTimeout(undoTimer)
    undoable.value = null
  }
  try {
    await matchesStore.rejectMatch(entry.match.id)
    // That was the report's last find: say so, as the finds page does
    const report = reports.value.find((candidate) => candidate.item.id === entry.reportId)
    if (report && reportKind(report) === 'none') clearedId.value = entry.reportId
  } catch (error) {
    errorMessage.value =
      error.response?.data?.error || 'Could not hide that find. Please try again.'
  } finally {
    // Gone from the store by now, or back on the page if saving failed
    forget(entry.match.id)
  }
}

// The Undo belongs to the report it was offered on
const shownUndo = computed(() =>
  undoable.value && undoable.value.reportId === current.value?.item.id
    ? undoable.value.match
    : null,
)

// Another report picked with an Undo still showing: save it now
watch(
  () => current.value?.item.id,
  () => {
    if (undoable.value) saveHidden(undoable.value)
  },
)

// Leaving with an Undo still showing: save it, without waiting
onBeforeUnmount(() => {
  clearTimeout(undoTimer)
  if (undoable.value) matchesStore.rejectMatch(undoable.value.match.id).catch(() => {})
})
</script>

<template>
  <div class="ds matches-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap matches">
      <div class="matches__head">
        <h1 v-if="loading" class="ds-h1">Checking your reports…</h1>
        <h1 v-else-if="!reports.length" class="ds-h1" data-testid="matches-title">
          Nothing reported lost
        </h1>
        <h1 v-else class="ds-h1" data-testid="matches-title">Your lost reports</h1>
        <!-- A phone has the header's report button for this instead -->
        <RouterLink
          v-if="!loading && reports.length"
          to="/report/lost"
          class="matches__add ds-link ds-link--standalone d-none d-sm-inline-flex"
          >Report something else</RouterLink
        >
      </div>

      <p v-if="errorMessage" class="matches__error" role="alert" data-testid="matches-error">
        {{ errorMessage }}
      </p>

      <div
        v-if="!loading && clearedReport"
        class="matches__note"
        role="status"
        data-testid="cleared-note"
      >
        <p class="matches__note-text">
          <strong>No finds left for your {{ itemNoun(clearedReport.item.category) }}.</strong>
          It’s still open, and we’ll check every new find against it.
        </p>
        <button
          type="button"
          class="matches__note-close ds-icon-btn"
          aria-label="Dismiss"
          data-testid="cleared-note-dismiss"
          @click="clearedId = null"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
        </button>
      </div>

      <!-- Grey shapes the size of the filters, the tags and the report -->
      <div v-if="loading" class="matches__loading" aria-hidden="true">
        <span class="matches__skeleton-bar ds-skeleton"></span>
        <div class="matches__skeleton-rail">
          <span v-for="n in 3" :key="n" class="matches__skeleton-tag ds-skeleton"></span>
        </div>
        <span class="matches__skeleton-line ds-skeleton"></span>
        <span class="matches__skeleton-card ds-skeleton"></span>
      </div>

      <template v-else-if="reports.length">
        <div class="matches__bar">
          <!-- On a phone the filters stay on one line and scroll sideways -->
          <div class="matches__filters" role="group" aria-label="Show">
            <button
              v-for="chip in filterChips"
              :key="chip.key || 'all'"
              type="button"
              class="matches__filter"
              :aria-pressed="chip.key === filter ? 'true' : 'false'"
              :data-testid="`filter-${chip.key || 'all'}`"
              @click="setFilter(chip.key)"
            >
              {{ chip.label }} <span class="matches__filter-count">{{ chip.count }}</span>
            </button>
          </div>

          <div v-if="showSearch" class="matches__search">
            <svg class="matches__search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M16 16l4.5 4.5" />
            </svg>
            <label for="matches-search" class="visually-hidden">Search your reports</label>
            <input
              id="matches-search"
              v-model="searchText"
              class="matches__search-input"
              type="search"
              maxlength="100"
              placeholder="Search your reports"
              data-testid="report-search"
            />
            <button
              v-if="searchText"
              type="button"
              class="matches__search-clear"
              aria-label="Clear the search"
              data-testid="report-search-clear"
              @click="searchText = ''"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
            </button>
          </div>
        </div>

        <ReportRail
          v-if="current"
          :reports="shown"
          :current-id="current.item.id"
          :panel-id="PANEL_ID"
          @select="pickReport"
        />
        <div v-else class="matches__empty" data-testid="report-search-empty">
          <template v-if="searching">
            <p>No reports match “{{ searchText.trim() }}”.</p>
            <button type="button" class="matches__empty-action ds-link" @click="searchText = ''">
              Clear the search
            </button>
          </template>
          <template v-else>
            <p>No reports here.</p>
            <button type="button" class="matches__empty-action ds-link" @click="setFilter('')">
              Show all
            </button>
          </template>
        </div>

        <section
          v-if="current"
          :id="PANEL_ID"
          class="matches__panel"
          role="tabpanel"
          :aria-labelledby="`report-tab-${current.item.id}`"
        >
          <Transition name="matches-swap" mode="out-in">
            <div :key="current.item.id" class="matches__panel-content">
              <ReportDetails
                ref="detailsEl"
                v-model:open="detailsOpen"
                :report="current.item"
                :categories="categories"
                :colours="colours"
                :spots-by-id="spotsById"
                :save="saveReport"
              />
              <ReportFinds
                :report="current"
                :spots-by-id="spotsById"
                :hiding="hiding"
                :undoable="shownUndo"
                @not-mine="notMine"
                @undo="undo"
                @add-details="addDetails"
              />
              <footer v-if="current.item.status === 'open'" class="matches__foot">
                <CloseReport
                  :key="current.item.id"
                  :busy="busy"
                  @close="foundItMyself(current.item)"
                />
              </footer>
            </div>
          </Transition>
        </section>
      </template>

      <section v-else-if="!errorMessage" class="matches__none">
        <p>When you report something lost, the finds that look like it show up here.</p>
        <BaseButton to="/report/lost">Report a lost item</BaseButton>
      </section>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.matches-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  /* The feed's wave wallpaper, with its moving trail (TrailBackdrop) */
  background: var(--fi-backdrop);
  isolation: isolate;
}

.matches {
  flex: 1;
  padding-top: var(--ds-space-5);
  /* Clear of the iPhone's home bar */
  padding-bottom: max(var(--ds-space-8), env(safe-area-inset-bottom));
}

.matches__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ds-space-2) var(--ds-space-5);
  margin-bottom: var(--ds-space-5);
}

.matches__error {
  margin-bottom: var(--ds-space-5);
  padding: var(--ds-space-3) var(--ds-space-4);
  border: 1px solid color-mix(in srgb, var(--ds-danger) 40%, transparent);
  border-radius: var(--ds-radius-surface);
  background: color-mix(in srgb, var(--ds-danger) 8%, var(--ds-surface));
  font-weight: var(--ds-weight-medium);
}

/* "No finds left for your umbrella." */
.matches__note {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-3);
  margin-bottom: var(--ds-space-5);
  padding: var(--ds-space-1) var(--ds-space-1) var(--ds-space-1) var(--ds-space-4);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
  animation: matches-in var(--ds-dur-slow) var(--ds-ease-out);
}

.matches__note-text {
  flex: 1;
  padding-block: var(--ds-space-2);
}

.matches__note-close {
  flex-shrink: 0;
  border-color: transparent;
  background: transparent;
  color: var(--ds-text-muted);
}

.matches__note-close svg,
.matches__search-clear svg {
  width: 1.125rem;
  height: 1.125rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

@keyframes matches-in {
  from {
    opacity: 0;
    translate: 0 calc(-1 * var(--ds-space-2));
  }
}

/* The filters and the search on one line, wrapping when they don't fit */
.matches__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-3) var(--ds-space-4);
}

/* One control in four parts, the chosen one raised, as on the feed */
.matches__filters {
  display: flex;
  gap: var(--ds-space-1);
  max-width: 100%;
  padding: var(--ds-space-1);
  overflow-x: auto;
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-sunken);
  scrollbar-width: none;
}

.matches__filters::-webkit-scrollbar {
  display: none;
}

.matches__filter {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--ds-space-2);
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-4);
  border: 1px solid transparent;
  border-radius: calc(var(--ds-radius-control) - 2px);
  background: transparent;
  color: var(--ds-text-muted);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    color var(--ds-dur-fast) var(--ds-ease-out);
}

.matches__filter:hover {
  color: var(--ds-text);
}

.matches__filter:focus-visible {
  outline-offset: -3px;
}

.matches__filter[aria-pressed='true'] {
  border-color: var(--ds-border-control);
  background: var(--ds-surface);
  color: var(--ds-text);
  font-weight: var(--ds-weight-bold);
}

.matches__filter-count {
  color: var(--ds-text-muted);
  font-weight: var(--ds-weight-medium);
  font-variant-numeric: tabular-nums;
}

/* The search, as on the feed, the same height as the filters */
.matches__search {
  position: relative;
  display: flex;
  flex: 1 1 15rem;
  align-items: center;
  max-width: 24rem;
}

.matches__search-icon {
  position: absolute;
  left: var(--ds-space-4);
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: var(--ds-text-muted);
  stroke-width: 2;
  stroke-linecap: round;
  pointer-events: none;
}

.matches__search-input {
  width: 100%;
  min-height: calc(var(--ds-control-h) + 2 * var(--ds-space-1));
  padding: 0 var(--ds-control-h) 0 var(--ds-space-7);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-text);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-body);
  transition: border-color var(--ds-dur-fast) var(--ds-ease-out);
}

.matches__search-input::placeholder {
  color: var(--ds-text-muted);
}

.matches__search-input:hover {
  border-color: var(--ds-text-muted);
}

.matches__search-input:focus {
  border-color: var(--ds-action);
  outline: 3px solid var(--ds-focus);
  outline-offset: 1px;
}

.matches__search-input::-webkit-search-cancel-button {
  display: none;
}

.matches__search-clear {
  position: absolute;
  right: var(--ds-space-1);
  display: grid;
  place-items: center;
  width: var(--ds-control-h);
  height: var(--ds-control-h);
  padding: 0;
  border: 0;
  border-radius: var(--ds-radius-control);
  background: transparent;
  color: var(--ds-text-muted);
  cursor: pointer;
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    color var(--ds-dur-fast) var(--ds-ease-out);
}

.matches__search-clear:hover {
  background: var(--ds-surface-sunken);
  color: var(--ds-text);
}

/* No tags for this search or filter: a quiet dashed panel with one way on */
.matches__empty {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-1) var(--ds-space-3);
  margin-top: var(--ds-space-4);
  padding: var(--ds-space-5);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  color: var(--ds-text-muted);
}

.matches__empty-action {
  position: relative;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

.matches__empty-action::after {
  content: '';
  position: absolute;
  inset: 50% 0 auto;
  height: var(--ds-control-h);
  translate: 0 -50%;
}

/* The report shown, under a rule */
.matches__panel {
  padding-top: var(--ds-space-5);
  border-top: 1px solid var(--ds-border);
}

.matches__panel-content {
  display: grid;
  gap: var(--ds-space-4);
}

/* Another report: the old one fades quickly, the new one settles in */
.matches-swap-enter-active {
  transition:
    opacity var(--ds-dur-base) var(--ds-ease-out),
    translate var(--ds-dur-base) var(--ds-ease-out);
}

.matches-swap-leave-active {
  transition: opacity var(--ds-dur-fast) var(--ds-ease-in);
}

.matches-swap-enter-from {
  opacity: 0;
  translate: 0 var(--ds-space-2);
}

.matches-swap-leave-to {
  opacity: 0;
}

/* Loading: shapes the size of what is coming */
.matches__loading {
  display: grid;
  gap: var(--ds-space-4);
}

.matches__skeleton-bar {
  width: min(36rem, 100%);
  height: 3.25rem;
}

.matches__skeleton-rail {
  display: flex;
  gap: var(--ds-space-4);
  padding-block: var(--ds-space-4) var(--ds-space-5);
  overflow: hidden;
}

.matches__skeleton-tag {
  flex: 0 0 13rem;
  height: 16rem;
  border-radius: var(--ds-radius-surface);
}

.matches__skeleton-line {
  width: min(24rem, 70%);
  height: 2rem;
}

.matches__skeleton-card {
  height: 14rem;
  border-radius: var(--ds-radius-surface);
}

/* Nothing reported lost: a quiet dashed panel with one way on */
.matches__none {
  display: grid;
  justify-items: start;
  gap: var(--ds-space-4);
  padding: var(--ds-space-6);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  color: var(--ds-text-muted);
}

@media (max-width: 575.98px) {
  .matches {
    padding-top: var(--ds-space-5);
  }

  .matches__head {
    margin-bottom: var(--ds-space-4);
  }

  .matches__search {
    max-width: none;
  }

  .matches__skeleton-rail {
    gap: var(--ds-space-2);
  }

  .matches__skeleton-tag {
    flex-basis: 6.75rem;
    height: 12rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .matches__note {
    animation: none;
  }

  .matches-swap-enter-active,
  .matches-swap-leave-active {
    transition: opacity var(--ds-dur-fast) linear;
  }

  .matches-swap-enter-from {
    translate: none;
  }
}
</style>
