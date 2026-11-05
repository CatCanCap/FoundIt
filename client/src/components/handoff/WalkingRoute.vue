<script setup>
// Walking directions for a handoff (WS5, feature 4: "a meetup or drop-off at
// the nearest collection point with walking directions"). It uses the same
// Mapbox as the campus map (VITE_MAPBOX_TOKEN in client/.env.local): the
// Directions API finds the walking route, and WalkingRouteMap.vue draws it.
//
// The walk starts from where you are now, and follows you live as you walk:
// your pin moves with every location update, and the route is worked out
// again once you have moved a little (at most every few seconds, to keep
// Mapbox requests low). If the phone will not share its location, or you pick
// "Start where it was found", the walk starts where the item was found.
// Without a token, or if Mapbox cannot start, it shows a link to walking
// directions in another map app instead.
//   from   the spot the walk starts at (where the item was found), or null
//          when the server keeps that private from you: then the walk can
//          only start where you are
//   to     the spot to walk to (the meet-up place or collection point)
//   spots  every campus spot (GET /api/spots), for the building names
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { buildingCentres, buildingLabel } from '@/utils/campus-layout'
import { areaLabel } from '@/utils/campus-map'
import { directionsUrl, lngLat, metresApart, routeSummary, walkingLink } from '@/utils/handoff'
import { spotName } from '@/utils/spots'

const props = defineProps({
  from: { type: Object, default: null },
  to: { type: Object, required: true },
  spots: { type: Array, default: () => [] },
})

const token = import.meta.env.VITE_MAPBOX_TOKEN || ''
const failed = ref(false)

// Mapbox is about 1.5 MB, so it only downloads when there is a token to use
const WalkingRouteMap = defineAsyncComponent({
  loader: () => import('./WalkingRouteMap.vue'),
  onError(error, retry, fail) {
    failed.value = true
    fail()
  },
})

// Find the route again after moving this far, but not more often than this
const REROUTE_METRES = 20
const REROUTE_EVERY_MS = 8000
// Smaller moves than this do not move the pin (GPS jitter)
const MOVE_METRES = 3

// 'live' follows the phone's location; 'found' starts where it was found
const mode = ref(typeof navigator !== 'undefined' && navigator.geolocation ? 'live' : 'found')
const myPosition = ref(null)
const locating = ref(false)
const note = ref('')
const route = ref(null)
// Where the current route starts, so small moves do not ask for a new one
const routeFrom = ref(null)
let routedAt = 0
// Whether the current route starts from your live location
let routedLive = null
let watchId = null

const live = computed(() => mode.value === 'live' && Boolean(myPosition.value))
const start = computed(() => (live.value ? myPosition.value : lngLat(props.from)))
const end = computed(() => lngLat(props.to))
const startLabel = computed(() =>
  live.value ? 'where you are' : props.from ? spotName(props.from) : 'the start',
)
// Every building but the ones the pins already name
const buildings = computed(() => {
  const pinned = new Set([props.from?.building, props.to?.building])
  return buildingCentres(props.spots).filter((centre) => !pinned.has(centre.building))
})

// "SCIS 1 · Concierge", short enough to sit beside a pin
function pinName(spot) {
  return spot ? `${buildingLabel(spot.building)} · ${areaLabel(spot.area)}` : ''
}
const startPin = computed(() => (live.value ? 'You' : pinName(props.from) || 'Start'))

const useMap = computed(() => Boolean(token) && !failed.value && Boolean(end.value))
const summary = computed(() => routeSummary(route.value))

async function findRoute() {
  if (!useMap.value || !start.value) {
    route.value = null
    return
  }
  const from = start.value
  routeFrom.value = from
  routedAt = Date.now()
  routedLive = live.value
  try {
    const response = await fetch(directionsUrl(from, end.value, token))
    if (!response.ok) throw new Error(`Directions answered ${response.status}`)
    const data = await response.json()
    route.value = data.routes?.[0] || null
    if (!route.value) note.value = 'No walking route found. The map shows both places.'
  } catch {
    route.value = null
    note.value = 'Could not load the walking route. The map shows both places.'
  }
}

// A new route when the start changes a lot: a new place, a switch between
// live and "where it was found", or walking far enough since the last one
watch([start, end], ([next], [, endBefore]) => {
  if (!next) return
  const switched = routedLive !== live.value || end.value !== endBefore || !routeFrom.value
  const moved = routeFrom.value ? metresApart(routeFrom.value, next) : Infinity
  const waited = Date.now() - routedAt >= REROUTE_EVERY_MS
  if (switched || moved >= REROUTE_METRES * (waited ? 1 : 10)) findRoute()
})

function stopWatching() {
  if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId)
  watchId = null
}

// Follow the phone's location until the page closes
function followMe() {
  if (!navigator.geolocation) {
    mode.value = 'found'
    note.value = props.from
      ? 'This browser cannot share your location, so the walk starts where it was found.'
      : 'This browser cannot share your location, so the map shows only where to go.'
    return
  }
  stopWatching()
  mode.value = 'live'
  locating.value = true
  note.value = ''
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const here = [position.coords.longitude, position.coords.latitude]
      locating.value = false
      if (!myPosition.value || metresApart(myPosition.value, here) >= MOVE_METRES) {
        myPosition.value = here
      }
    },
    (error) => {
      locating.value = false
      // Standing still sends no updates, which some phones report as a timeout:
      // keep the last place and keep following. Only a refusal, or never finding
      // you at all, starts the walk where it was found instead.
      if (error?.code !== 1 && myPosition.value) return
      stopWatching()
      mode.value = 'found'
      note.value = props.from
        ? 'Could not get your location, so the walk starts where it was found.'
        : 'Could not get your location, so the map shows only where to go.'
    },
    { enableHighAccuracy: true, maximumAge: 5000 },
  )
}

function startWhereFound() {
  stopWatching()
  mode.value = 'found'
  note.value = ''
}

onMounted(() => {
  if (mode.value === 'live') followMe()
  findRoute()
})
onBeforeUnmount(stopWatching)

function onMapFailed(error) {
  console.warn('Mapbox could not start, showing a link instead', error)
  failed.value = true
}
</script>

<template>
  <div class="walk" data-testid="walking-route">
    <template v-if="useMap">
      <div class="walk__bar">
        <p class="walk__summary" data-testid="walking-summary">
          <span v-if="live" class="walk__live" data-testid="walking-live">
            <span class="walk__live-dot" aria-hidden="true"></span>Live
          </span>
          <strong v-if="summary">{{ summary }}</strong>
          <span v-else-if="start || locating">Finding the walking route…</span>
          <span v-else>The map shows where to go.</span>
          <span v-if="start" class="walk__from"> from {{ startLabel }}</span>
          <span v-if="locating" class="walk__from"> (finding you…)</span>
        </p>
        <button
          v-if="mode === 'live' && from"
          type="button"
          class="walk__here"
          data-testid="walking-from-found"
          @click="startWhereFound"
        >
          Start where it was found
        </button>
        <button
          v-else-if="mode !== 'live'"
          type="button"
          class="walk__here"
          data-testid="walking-from-here"
          @click="followMe"
        >
          Use my location
        </button>
      </div>
      <WalkingRouteMap
        :token="token"
        :from="start"
        :to="end"
        :line="route?.geometry?.coordinates || null"
        :from-label="startPin"
        :to-label="pinName(to)"
        :buildings="buildings"
        @failed="onMapFailed"
      />
      <p v-if="note" class="walk__note" role="status">{{ note }}</p>
    </template>

    <p v-else class="walk__note" data-testid="walking-fallback">
      The campus map is not set up here.
      <a
        v-if="walkingLink(to)"
        :href="walkingLink(to)"
        target="_blank"
        rel="noopener"
        class="ds-link walk__out"
        data-testid="walking-directions-link"
        >Open walking directions in another map
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5" /></svg
      ></a>
    </p>
  </div>
</template>

<style scoped>
/* In the design system (assets/system.css); only the handoff page uses it */
.walk {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-2);
  align-self: stretch;
}

.walk__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-2) var(--ds-space-3);
}

.walk__summary {
  margin: 0;
  font-size: var(--ds-size-small);
}

.walk__from {
  color: var(--ds-text-muted);
}

.walk__live {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  margin-right: var(--ds-space-2);
  padding: 0 var(--ds-space-2);
  border-radius: var(--ds-radius-round);
  background: color-mix(in srgb, var(--ds-success) 14%, var(--ds-surface));
  color: var(--ds-success);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-bold);
}

.walk__live-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: var(--ds-radius-round);
  background: currentColor;
  animation: walk-pulse var(--ds-loop) ease-in-out infinite;
}

@keyframes walk-pulse {
  50% {
    opacity: 0.35;
  }
}

/* "Use my location": an outlined small button */
.walk__here {
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-4);
  border: 1px solid var(--ds-action);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-action);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
  cursor: pointer;
  transition: background-color var(--ds-dur-fast) var(--ds-ease-out);
}

.walk__here:hover {
  background: var(--ds-action-wash);
}

.walk__here:focus-visible {
  outline: 2px solid var(--ds-focus);
  outline-offset: 2px;
}

.walk__note {
  margin: 0;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.walk__out svg {
  width: 0.875rem;
  height: 0.875rem;
  margin-left: var(--ds-space-1);
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  vertical-align: -0.125em;
}

@media (prefers-reduced-motion: reduce) {
  .walk__live-dot {
    animation: none;
  }
}
</style>
