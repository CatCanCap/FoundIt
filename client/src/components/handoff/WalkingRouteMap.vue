<script setup>
// The map inside WalkingRoute.vue (WS5), drawn with Mapbox GL JS in the same
// way as the campus map (components/campus/CampusMapbox.vue): a marker where
// the walk starts, a brass marker where it ends, the walking route as a line
// between them, and every campus building's short name. Use it through
// WalkingRoute.vue, which handles the token.
//   from, to     [lng, lat]
//   line         the route's coordinates from the Directions API, or null
//   fromLabel    words under the start pin ("SCIS 1 · room 2-4")
//   toLabel      words above the end pin ("SCIS 1 · concierge")
//   buildings    [{ building, label, lng, lat }] from buildingCentres() in
//                utils/campus-layout.js, for the building names
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const props = defineProps({
  token: { type: String, required: true },
  from: { type: Array, default: null },
  to: { type: Array, required: true },
  line: { type: Array, default: null },
  fromLabel: { type: String, default: 'Start' },
  toLabel: { type: String, default: 'Handoff place' },
  buildings: { type: Array, default: () => [] },
})

const emit = defineEmits(['failed'])

const container = ref(null)
let map = null
let loaded = false
let markers = []

const ROUTE = 'walking-route'

// A pin with its words: the start's under it, the end's above it, so the two
// never cover each other when both are in one building
function pin(lngLat, kind, label) {
  const element = document.createElement('span')
  element.className = `walk-map__place walk-map__place--${kind}`
  element.setAttribute('aria-label', label)
  const dot = document.createElement('span')
  dot.className = 'walk-map__pin'
  const name = document.createElement('span')
  name.className = 'walk-map__pin-label'
  name.textContent = label
  element.append(dot, name)
  return new mapboxgl.Marker({ element, anchor: 'center' }).setLngLat(lngLat).addTo(map)
}

// A building's short name, as on the campus map. Only words, not clickable.
function buildingName(centre) {
  const element = document.createElement('span')
  element.className = 'walk-map__building'
  element.textContent = centre.label
  element.setAttribute('aria-hidden', 'true')
  return new mapboxgl.Marker({ element, anchor: 'center' })
    .setLngLat([centre.lng, centre.lat])
    .addTo(map)
}

function drawMarkers() {
  if (!map) return
  markers.forEach((entry) => entry.remove())
  markers = props.buildings.map(buildingName)
  if (props.from) markers.push(pin(props.from, 'from', props.fromLabel))
  markers.push(pin(props.to, 'to', props.toLabel))
}

function drawLine() {
  if (!map || !loaded) return
  // The route starts and ends on the nearest footpath, so join it to the two
  // places, which can be inside a building
  const coordinates = props.line?.length
    ? [props.from, ...props.line, props.to].filter(Boolean)
    : []
  const data = { type: 'Feature', geometry: { type: 'LineString', coordinates } }
  const source = map.getSource(ROUTE)
  if (source) {
    source.setData(data)
    return
  }
  map.addSource(ROUTE, { type: 'geojson', data })
  map.addLayer({
    id: ROUTE,
    type: 'line',
    source: ROUTE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#d4a63a', 'line-width': 5, 'line-opacity': 0.9 },
  })
}

// Show the whole walk, or both places when there is no route yet
function fitWalk() {
  if (!map) return
  const points = props.line?.length ? props.line : [props.from, props.to].filter(Boolean)
  if (points.length < 2) {
    map.jumpTo({ center: props.to, zoom: 16.5 })
    return
  }
  const bounds = points.reduce(
    (box, point) => box.extend(point),
    new mapboxgl.LngLatBounds(points[0], points[0]),
  )
  // Room for the pin labels, and zoomed out enough to show the buildings nearby
  map.fitBounds(bounds, {
    padding: { top: 64, bottom: 56, left: 72, right: 72 },
    maxZoom: 17,
    duration: 0,
  })
}

onMounted(() => {
  mapboxgl.accessToken = props.token
  const night = document.documentElement.dataset.theme === 'night'
  try {
    map = new mapboxgl.Map({
      container: container.value,
      style: night ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
      center: props.to,
      zoom: 17,
      // Keep the page scrollable on a phone: moving the map takes two fingers
      cooperativeGestures: true,
      dragRotate: false,
      pitchWithRotate: false,
    })
  } catch {
    // No WebGL, or Mapbox refused to start
    emit('failed')
    return
  }
  map.touchZoomRotate.disableRotation()
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
  map.on('error', (event) => {
    if (!loaded) emit('failed', event.error)
  })
  map.on('load', () => {
    loaded = true
    drawLine()
    fitWalk()
  })
  drawMarkers()
})

// Your live pin moves without moving the map, so you can pan around while
// walking; a new route, place or building list fits the map again
watch(
  () => props.from,
  () => {
    drawMarkers()
    drawLine()
  },
)
watch(
  () => [props.to, props.line, props.buildings],
  () => {
    drawMarkers()
    drawLine()
    fitWalk()
  },
)

onBeforeUnmount(() => {
  markers.forEach((entry) => entry.remove())
  if (map) map.remove()
  map = null
})
</script>

<template>
  <div class="walk-map" data-testid="walking-map">
    <div ref="container" class="walk-map__canvas"></div>
  </div>
</template>

<style scoped>
.walk-map {
  overflow: hidden;
  border: 1px solid var(--fi-line);
  border-radius: var(--fi-radius);
}

.walk-map__canvas {
  width: 100%;
  height: 16rem;
}

/* The pins and names are made in script, so these styles reach them with :deep */
.walk-map :deep(.walk-map__place) {
  position: relative;
  display: grid;
  place-items: center;
}

.walk-map :deep(.walk-map__pin) {
  display: block;
  width: 1.1rem;
  height: 1.1rem;
  border: 3px solid #fff;
  border-radius: 50%;
  background: #141a3f;
  box-shadow: 0 1px 4px rgb(20 26 63 / 40%);
}

.walk-map :deep(.walk-map__place--to .walk-map__pin) {
  width: 1.4rem;
  height: 1.4rem;
  background: #d4a63a;
}

.walk-map :deep(.walk-map__pin-label) {
  position: absolute;
  left: 50%;
  padding: 0.15rem 0.5rem;
  border-radius: var(--fi-radius-pill);
  background: #141a3f;
  color: #fff;
  font-family: var(--fi-font);
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgb(20 26 63 / 30%);
  transform: translateX(-50%);
  pointer-events: none;
}

.walk-map :deep(.walk-map__place--from .walk-map__pin-label) {
  top: calc(100% + 0.3rem);
}

.walk-map :deep(.walk-map__place--to .walk-map__pin-label) {
  bottom: calc(100% + 0.3rem);
  background: #d4a63a;
  color: #141a3f;
}

/* Building names: small, with a soft outline so they read on any map */
.walk-map :deep(.walk-map__building) {
  color: #5c6282;
  font-family: var(--fi-font);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
  text-shadow:
    0 0 3px #fff,
    0 0 3px #fff,
    0 0 3px #fff;
  pointer-events: none;
}

:root[data-theme='night'] .walk-map :deep(.walk-map__building) {
  color: #c9cde3;
  text-shadow:
    0 0 3px #0a1030,
    0 0 3px #0a1030,
    0 0 3px #0a1030;
}

@media (min-width: 768px) {
  .walk-map__canvas {
    height: 18rem;
  }
}
</style>
