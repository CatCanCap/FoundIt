<script setup>
// /map: where items are found (this week) or lost (30 days), by building.
// It answers one question: where on campus do things go missing or turn up?
// Rebuilt in the design system (assets/system.css, class="ds").
// Figures come from GET /api/stats/hotspots; the item list uses the feed's
// filters so "See N in the feed" matches the feed.
import { ref, computed, onMounted } from 'vue'
import api from '@/api'
import AppFooter from '@/components/ui/AppFooter.vue'
import PageSkeleton from '@/components/ui/PageSkeleton.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import MascotArt from '@/components/ui/MascotArt.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SegmentedToggle from '@/components/ui/SegmentedToggle.vue'
import CampusMap from '@/components/campus/CampusMap.vue'
import { buildingLabel, heatScale } from '@/utils/campus-layout'
import { FAMILY_LABELS, categoryFamily, itemNumber } from '@/utils/design'
import { applyFilters, buildItemParams, filtersToQuery, isThisWeek } from '@/utils/feed'
import {
  MAP_DAYS,
  categoryFamilies,
  countsByBuilding,
  formatPercent,
  formatReturnTime,
  itemsInBuilding,
  mapTip,
  rankBuildings,
} from '@/utils/hotspots'

const MODE_OPTIONS = [
  { value: 'found', label: 'Found this week' },
  { value: 'lost', label: 'Lost, 30 days' },
]

const mode = ref('found')
const family = ref('')
const spots = ref([])
const categories = ref([])
// Places and figures load separately, so each keeps its own error
const placesError = ref('')
const statsError = ref('')
const itemsError = ref('')
const loadError = computed(() => placesError.value || statsError.value || itemsError.value)

// Figures and items for each view, fetched the first time it is shown
const stats = ref({ found: null, lost: null })
const items = ref({ found: null, lost: null })
const loading = ref(false)

// The building kept in the side panel (click) and the one being peeked at (hover)
const selected = ref({ found: '', lost: '' })
const hovered = ref('')

const spotById = computed(() => new Map(spots.value.map((spot) => [spot.id, spot])))
const families = computed(() => categoryFamilies(categories.value, categoryFamily, FAMILY_LABELS))
const familyCategories = computed(
  () => families.value.find((entry) => entry.family === family.value)?.categories || [],
)
// The category chips are for the lost view only: the server keeps the figures
// for finds to all categories, so no one find can be singled out
const activeFamily = computed(() => (mode.value === 'lost' ? family.value : ''))

const current = computed(() => stats.value[mode.value])
const buildings = computed(() => current.value?.buildings || [])
const counts = computed(() => countsByBuilding(buildings.value))
const ranked = computed(() => rankBuildings(buildings.value))

const heat = computed(() => {
  const max = Math.max(0, ...buildings.value.map((entry) => entry.count))
  return Object.fromEntries(
    buildings.value.map((entry) => [entry.building, heatScale(entry.count, max)]),
  )
})

// Side panel building: hovered, else clicked, else the busiest
const focus = computed(
  () => hovered.value || selected.value[mode.value] || buildings.value[0]?.building || '',
)
const focusStats = computed(() => buildings.value.find((entry) => entry.building === focus.value))

// Items in the chosen category chip; the found view keeps this week's only
const modeItems = computed(() => {
  const list = items.value[mode.value] || []
  if (!activeFamily.value) return list
  return list.filter((item) => familyCategories.value.includes(item.category))
})
const focusItems = computed(() => {
  if (!focus.value) return []
  const inBuilding = itemsInBuilding(modeItems.value, spotById.value, focus.value)
  return mode.value === 'found' ? inBuilding.filter((item) => isThisWeek(item)) : inBuilding
})
// Finds whose place the server keeps private (see HIDDEN_PLACE in utils/feed.js)
// are in no building's list, though the figures still count them
const hasHiddenFinds = computed(
  () => mode.value === 'found' && (items.value.found || []).some((item) => item.placeHidden),
)

// The feed with this view's tab, category chip and the building as the search
const feedFilters = computed(() => ({
  type: mode.value,
  family: activeFamily.value,
  q: buildingLabel(focus.value),
}))
const feedLink = computed(() => ({ path: '/feed', query: filtersToQuery(feedFilters.value) }))
// Count the feed will show at that link
const feedCount = computed(() =>
  focus.value
    ? applyFilters(items.value[mode.value] || [], feedFilters.value, spotById.value).length
    : 0,
)

// Buildings with fewer than 3 finds are left out of the figures for finds
const foundHidden = computed(() => mode.value === 'found' && Boolean(current.value?.hidden))
const tip = computed(() =>
  foundHidden.value && buildings.value.length === 0
    ? 'Where finds were handed in stays private until a building has a few.'
    : mapTip(mode.value, current.value),
)

// Only the newest request updates the page, so a slow old answer is ignored
let latestStats = 0

async function loadStats() {
  const request = ++latestStats
  const view = mode.value
  loading.value = true
  try {
    const params = { type: view, days: MAP_DAYS[view] }
    if (view === 'lost' && familyCategories.value.length) {
      params.category = familyCategories.value.join(',')
    }
    const { data } = await api.get('/stats/hotspots', { params })
    if (request !== latestStats) return
    stats.value = { ...stats.value, [view]: data }
    statsError.value = ''
  } catch {
    if (request !== latestStats) return
    statsError.value = 'We couldn’t load the map figures.'
  } finally {
    if (request === latestStats) loading.value = false
  }
}

// Same request as the feed, so the counts agree. A failed load stays null so
// "Try again" can reload it.
async function loadItems() {
  const view = mode.value
  if (items.value[view]) return
  try {
    const { data } = await api.get('/items', { params: buildItemParams(view) })
    items.value = { ...items.value, [view]: data }
    itemsError.value = ''
  } catch {
    // The figures still show; only the list of items is missing
    itemsError.value = 'We couldn’t load the items on the map.'
  }
}

function select(building) {
  selected.value = { ...selected.value, [mode.value]: building }
}

// Found this week / Lost, 30 days: show that view, loading what it still needs
function pickMode(newMode) {
  mode.value = newMode
  hovered.value = ''
  if (!stats.value[newMode]) loadStats()
  loadItems()
}

// A category chip: fetch this view's figures again. The other view's are
// cleared, so it fetches again when it is next shown.
function pickFamily(newFamily) {
  family.value = newFamily
  stats.value = { found: null, lost: null, [mode.value]: stats.value[mode.value] }
  loadStats()
}

async function loadPlaces() {
  try {
    const [spotsResponse, categoriesResponse] = await Promise.all([
      api.get('/spots'),
      api.get('/categories'),
    ])
    spots.value = spotsResponse.data
    categories.value = categoriesResponse.data
    placesError.value = ''
  } catch {
    placesError.value = 'We couldn’t load the map.'
  }
}

// "Try again" asks for whatever is missing
function retry() {
  if (spots.value.length === 0) loadPlaces()
  loadStats()
  loadItems()
}

// Load everything in parallel
onMounted(() => {
  loadStats()
  loadItems()
  loadPlaces()
})
</script>

<template>
  <div class="ds map-page" :class="`is-${mode}`">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap map-main" data-testid="map-page">
      <PageHeader
        :title="mode === 'lost' ? 'Where things go missing' : 'Where things turn up this week'"
      >
        <template #lede>
          <template v-if="mode === 'lost'">
            Lost reports from the last 30 days, by building. Bigger circles mean more.
          </template>
          <template v-else>
            Found items handed in this week, by building. Bigger circle, more finds.
          </template>
        </template>
        <template #actions>
          <SegmentedToggle
            :model-value="mode"
            class="map-toggle"
            :options="MODE_OPTIONS"
            label="Show on the map"
            @update:model-value="pickMode"
          />
        </template>
      </PageHeader>

      <div v-if="loadError" class="map-error" role="alert" data-testid="map-error">
        <p class="map-error__words">
          <MascotArt variant="oops" :size="48" aria-hidden="true" />
          <span>{{ loadError }} Check your connection and try again.</span>
        </p>
        <BaseButton variant="secondary" size="sm" data-testid="map-retry" @click="retry">
          Try again
        </BaseButton>
      </div>

      <div class="map-layout">
        <!-- The map -->
        <section class="map-panel map-panel--map" aria-labelledby="campus-map-title">
          <div class="map-panel__head">
            <h2 id="campus-map-title" class="ds-h3">Campus map</h2>
            <div v-if="mode === 'lost'" class="map-chips" role="group" aria-label="Category">
              <button
                type="button"
                class="map-chip"
                :class="{ 'is-on': family === '' }"
                :aria-pressed="family === ''"
                data-testid="map-family-all"
                @click="pickFamily('')"
              >
                All
              </button>
              <button
                v-for="entry in families"
                :key="entry.family"
                type="button"
                class="map-chip"
                :class="{ 'is-on': family === entry.family }"
                :aria-pressed="family === entry.family"
                :data-testid="`map-family-${entry.family}`"
                @click="pickFamily(entry.family)"
              >
                {{ entry.label }}
              </button>
            </div>
          </div>

          <div class="map-canvas" :class="{ 'is-loading': loading }">
            <CampusMap
              :spots="spots"
              :badges="counts"
              :heat="heat"
              :heat-points="current?.spots || []"
              :tone="mode"
              :selected="focus"
              clickable
              @select="select"
              @hover="hovered = $event"
            />
          </div>
          <p class="ds-small ds-muted">
            {{
              mode === 'lost'
                ? 'Pins show lost reports in the last 30 days.'
                : 'Pins show items found this week.'
            }}
            Tap or click a building to see what’s there.
          </p>
        </section>

        <!-- Side panel: found -->
        <aside v-if="mode === 'found'" class="map-panel map-side" data-testid="map-side-found">
          <!-- The one thing to take away; left out when the line below says it already -->
          <p v-if="buildings.length > 0 || foundHidden" class="map-tip" data-testid="map-tip">
            {{ tip }}
          </p>

          <!-- Nothing to rank: the lion keeps watching -->
          <div v-if="current && buildings.length === 0" class="map-empty">
            <MascotArt variant="watching" :size="72" aria-hidden="true" />
            <p v-if="foundHidden" class="ds-muted" data-testid="map-found-hidden">
              No building has 3 finds yet this week. Buildings with fewer aren’t shown, so no one
              find can be pointed out.
            </p>
            <p v-else class="ds-muted">Nothing has been handed in this week.</p>
          </div>
          <!-- --digits: how many digits the biggest count has, so every count fits on one line -->
          <ol
            v-else
            class="map-ranking"
            :style="{ '--digits': String(ranked[0]?.count ?? 0).length }"
          >
            <li v-for="entry in ranked" :key="entry.building">
              <button
                type="button"
                class="map-rank"
                :class="{ 'is-on': entry.building === focus }"
                :aria-pressed="entry.building === focus"
                :data-testid="`map-rank-${entry.building}`"
                @click="select(entry.building)"
              >
                <span class="map-rank__count ds-num">{{ entry.count }}</span>
                <span class="map-rank__body">
                  <span class="map-rank__name">{{ buildingLabel(entry.building) }}</span>
                  <span class="map-bar" aria-hidden="true">
                    <span class="map-bar__fill" :style="{ width: `${entry.share}%` }"></span>
                  </span>
                </span>
              </button>
            </li>
          </ol>
          <p
            v-if="buildings.length > 0 && foundHidden"
            class="ds-small ds-muted"
            data-testid="map-found-some-hidden"
          >
            Buildings with fewer than 3 finds aren’t shown, so no one find can be pointed out.
          </p>

          <section v-if="focus" class="map-latest" aria-live="polite">
            <h3 class="ds-title">Latest at {{ buildingLabel(focus) }}</h3>
            <PageSkeleton v-if="!items.found" kind="lines" />
            <p
              v-else-if="focusItems.length === 0 && hasHiddenFinds"
              class="ds-muted"
              data-testid="map-latest-private"
            >
              Where each find was handed in stays private, so they aren’t listed here. Report what
              you lost to be matched.
            </p>
            <p v-else-if="focusItems.length === 0" class="ds-muted">Nothing found here yet.</p>
            <ul v-else class="map-ledger" data-testid="map-latest">
              <li v-for="item in focusItems.slice(0, 3)" :key="item.id">
                <RouterLink :to="`/items/${item.id}/record`" class="map-ledger__link">
                  <span class="ds-small ds-muted ds-num">{{ itemNumber(item) }}</span>
                  <span class="map-ledger__title">{{ item.title }}</span>
                </RouterLink>
              </li>
            </ul>
            <BaseButton
              v-if="feedCount"
              variant="secondary"
              :to="feedLink"
              data-testid="map-see-all"
            >
              <!-- The feed shows 30 days, more than the map's "this week" -->
              See {{ feedCount }} from the last 30 days in the feed
            </BaseButton>
          </section>
        </aside>

        <!-- Side panel: lost -->
        <aside v-else class="map-panel map-side" data-testid="map-side-lost">
          <p v-if="buildings.length > 0" class="map-tip" data-testid="map-tip">{{ tip }}</p>

          <div v-if="current && buildings.length === 0" class="map-empty">
            <MascotArt variant="watching" :size="72" aria-hidden="true" />
            <p class="ds-muted">
              Nothing reported lost in the last 30 days{{ family ? ' in this category' : '' }}.
            </p>
          </div>
          <template v-else-if="focus">
            <div class="map-focus" aria-live="polite">
              <p class="ds-small ds-muted">Selected building</p>
              <h3 class="ds-h3">{{ buildingLabel(focus) }}</h3>
              <dl class="map-figures">
                <div class="map-figure">
                  <dt class="ds-small ds-muted">reported lost</dt>
                  <dd class="ds-num">{{ focusStats?.count ?? 0 }}</dd>
                </div>
                <div class="map-figure">
                  <dt class="ds-small ds-muted">got back</dt>
                  <dd class="ds-num">{{ formatPercent(focusStats?.resolutionRate) }}</dd>
                </div>
                <div class="map-figure">
                  <dt class="ds-small ds-muted">usually back in</dt>
                  <dd class="ds-num">{{ formatReturnTime(focusStats?.medianReturnHours) }}</dd>
                </div>
              </dl>
              <!-- "reported lost" counts every report, claimed and closed ones too;
                   the feed only shows the open ones -->
              <p v-if="items.lost" class="ds-small ds-muted" data-testid="map-still-open">
                {{ feedCount }} of {{ focusStats?.count ?? 0 }} still open
              </p>
            </div>

            <h3 class="ds-title">How many got back, at the busiest buildings</h3>
            <ul class="map-rates" data-testid="map-rates">
              <li v-for="entry in ranked" :key="entry.building">
                <button
                  type="button"
                  class="map-rate"
                  :class="{ 'is-on': entry.building === focus }"
                  :aria-pressed="entry.building === focus"
                  @click="select(entry.building)"
                >
                  <span class="map-rate__line">
                    <span class="map-rate__name">{{ buildingLabel(entry.building) }}</span>
                    <span class="ds-num">{{ formatPercent(entry.resolutionRate) }}</span>
                  </span>
                  <span class="map-bar" aria-hidden="true">
                    <span
                      class="map-bar__fill"
                      :style="{ width: `${entry.resolutionRate ?? 0}%` }"
                    ></span>
                  </span>
                </button>
              </li>
            </ul>

            <BaseButton
              v-if="feedCount"
              variant="secondary"
              :to="feedLink"
              data-testid="map-see-all"
            >
              See {{ feedCount }} open report{{ feedCount === 1 ? '' : 's' }} in the feed
            </BaseButton>
          </template>
        </aside>
      </div>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
/* The header, then the map beside the side panel from 1024px; stacked below.
   Yellow (found) or red (lost) comes from --kind, set by the view. */
.map-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  /* The feed's wave wallpaper, with its moving trail (TrailBackdrop) */
  background: var(--fi-backdrop);
  isolation: isolate;
  --kind: var(--ds-found-fill);
}

.map-page.is-lost {
  --kind: var(--ds-lost-fill);
}

.map-main {
  flex: 1 0 auto;
  display: grid;
  align-content: start;
  gap: var(--ds-space-5);
  padding-block: var(--ds-space-6) var(--ds-space-8);
}

.map-toggle :deep(.fi-toggle__legend) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.map-toggle :deep(.fi-toggle__option) {
  white-space: nowrap;
}

/* ---- Couldn't load: a quiet panel with one way on ---- */
.map-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-3);
  padding: var(--ds-space-3) var(--ds-space-4);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  color: var(--ds-text);
}

.map-error__words {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
}

/* Nothing to show yet: the watching lion over a quiet line */
.map-empty {
  display: grid;
  justify-items: center;
  gap: var(--ds-space-3);
  padding-block: var(--ds-space-5);
  text-align: center;
}

/* ---- Panels: flat, on the surface ---- */
.map-layout {
  display: grid;
  gap: var(--ds-space-5);
  align-items: start;
}

/* One column that never grows past the panel, whatever is inside it */
.map-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ds-space-4);
  min-width: 0;
  padding: var(--ds-space-4);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

.map-panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-3);
}

/* The map fades while new figures load */
.map-canvas {
  transition: opacity var(--ds-dur-base) var(--ds-ease-out);
}

.map-canvas.is-loading {
  opacity: 0.55;
}

/* ---- Category chips (lost view): navy when on, outlined when off ---- */
.map-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-2);
}

.map-chip {
  position: relative;
  min-height: 2.25rem;
  padding: 0 var(--ds-space-3);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface);
  color: var(--ds-text);
  font: inherit;
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
  cursor: pointer;
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    border-color var(--ds-dur-fast) var(--ds-ease-out),
    color var(--ds-dur-fast) var(--ds-ease-out);
}

/* A 44px tap area around the smaller chip */
.map-chip::after {
  content: '';
  position: absolute;
  inset: calc(-1 * var(--ds-space-1)) 0;
}

.map-chip:hover {
  border-color: var(--ds-action);
  background: var(--ds-action-wash);
}

.map-chip.is-on {
  border-color: var(--ds-action);
  background: var(--ds-action);
  color: var(--ds-on-action);
}

/* ---- Side panel ---- */
.map-side {
  align-content: start;
}

/* The one thing to take away, first in the panel */
.map-tip {
  font-size: var(--ds-size-lead);
  line-height: var(--ds-leading-lead);
  font-weight: var(--ds-weight-medium);
}

/* A thin bar in the view's colour: share of finds, or return rate */
.map-bar {
  display: block;
  width: 100%;
  height: var(--ds-space-1);
  overflow: hidden;
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface-sunken);
}

.map-bar__fill {
  display: block;
  min-width: var(--ds-space-2);
  height: 100%;
  border-radius: inherit;
  background: var(--kind);
}

/* Rows you can pick: the whole row is a button, washed navy when picked */
.map-ranking li + li,
.map-rates li + li {
  border-top: 1px solid var(--ds-border);
}

.map-rank,
.map-rate {
  display: flex;
  width: 100%;
  min-height: var(--ds-control-h);
  padding: var(--ds-space-3) var(--ds-space-2);
  border: 0;
  border-radius: var(--ds-radius-control);
  background: none;
  color: var(--ds-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--ds-dur-fast) var(--ds-ease-out);
}

.map-rank:hover,
.map-rate:hover,
.map-rank.is-on,
.map-rate.is-on {
  background: var(--ds-action-wash);
}

.map-rank {
  align-items: center;
  gap: var(--ds-space-3);
}

.map-rank__count {
  /* Wide enough for the biggest count in the list (1ch is one digit's width) */
  flex: 0 0 auto;
  width: calc(var(--digits, 1) * 1ch + var(--ds-space-1));
  color: var(--ds-text-muted);
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-h2);
  font-weight: var(--ds-weight-bold);
  line-height: 1;
  text-align: center;
}

.map-rank.is-on .map-rank__count {
  color: var(--ds-text);
}

.map-rank__body {
  display: grid;
  flex-grow: 1;
  gap: var(--ds-space-2);
  min-width: 0;
}

.map-rank__name,
.map-rate__name {
  font-weight: var(--ds-weight-medium);
}

.map-rank.is-on .map-rank__name,
.map-rate.is-on .map-rate__name {
  font-weight: var(--ds-weight-bold);
}

.map-rate {
  flex-direction: column;
  gap: var(--ds-space-2);
}

.map-rate__line {
  display: flex;
  justify-content: space-between;
  gap: var(--ds-space-2);
  width: 100%;
}

/* ---- Latest at a building (found) ---- */
.map-latest {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  justify-items: start;
  gap: var(--ds-space-3);
  padding-top: var(--ds-space-4);
  border-top: 1px solid var(--ds-border);
}

/* "See 12 from the last 30 days in the feed" wraps in a narrow panel
   instead of pushing it wider */
.map-panel.map-side :deep(.fi-button) {
  max-width: 100%;
  min-height: var(--ds-control-h);
  padding-block: var(--ds-space-2);
  line-height: var(--ds-leading-small);
  text-align: center;
  white-space: normal;
}

.map-ledger {
  display: grid;
  width: 100%;
}

.map-ledger li {
  min-width: 0;
}

.map-ledger__link {
  display: flex;
  align-items: baseline;
  gap: var(--ds-space-3);
  min-height: var(--ds-control-h);
  padding-block: var(--ds-space-2);
  color: var(--ds-text);
  text-decoration: none;
}

.map-ledger__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: underline;
  text-decoration-color: var(--ds-border-control);
  text-underline-offset: 3px;
}

.map-ledger__link:hover .map-ledger__title {
  color: var(--ds-action);
  text-decoration-color: currentColor;
  text-decoration-thickness: 2px;
}

/* ---- Selected building (lost) ---- */
.map-focus {
  display: grid;
  gap: var(--ds-space-1);
}

.map-figures {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-3) var(--ds-space-5);
  margin: var(--ds-space-3) 0 var(--ds-space-1);
}

.map-figure {
  display: flex;
  flex-direction: column-reverse;
}

.map-figure dd {
  margin: 0;
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-h3);
  line-height: var(--ds-leading-h3);
  font-weight: var(--ds-weight-bold);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .map-canvas,
  .map-chip,
  .map-rank,
  .map-rate {
    transition: none;
  }
}

@media (min-width: 768px) {
  .map-panel {
    padding: var(--ds-space-5);
  }
}

/* From 1024px the side panel sits beside the map */
@media (min-width: 1024px) {
  .map-layout {
    grid-template-columns: minmax(0, 1fr) 20rem;
  }
}

@media (min-width: 1200px) {
  .map-layout {
    grid-template-columns: minmax(0, 1fr) 22rem;
  }
}
</style>
