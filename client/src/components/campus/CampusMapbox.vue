<script setup>
// The Mapbox campus map: one marker per building with an always-visible name
// tag, and a heatmap layer of item counts. Use it through CampusMap.vue.
import { onMounted, onUnmounted, ref, watch } from 'vue'
import {
  SMU_CENTRE,
  describeBuilding,
  heatGeoJson,
  labelCentres,
  spotsAtMarkers,
} from '@/utils/campus-layout'
import { chooseNameSides } from '@/utils/name-places'
import { pixelBuilding } from './pixel-buildings'

const props = defineProps({
  token: { type: String, required: true },
  // Campus spots from GET /api/spots
  spots: { type: Array, required: true },
  // { 'SCIS 1': 4 } -> a gold count on the building's marker
  badges: { type: Object, default: () => ({}) },
  // { 'LKCSB': [1], 'SCIS 1': [2, 4] } -> navy stop numbers on the marker
  stops: { type: Object, default: () => ({}) },
  // [{ spotId, count }] from GET /api/stats/hotspots -> heatmap. null = no heatmap
  heatPoints: { type: Array, default: null },
  // found (brass counts) or lost (red counts)
  tone: { type: String, default: 'found' },
  selected: { type: String, default: '' },
  // When true, markers are buttons and emit `select`
  clickable: { type: Boolean, default: false },
})

// hover: the pointer or keyboard is on a building (its name), or on none ('')
const emit = defineEmits(['select', 'hover', 'failed'])

const container = ref(null)
// The Mapbox library, once it has downloaded (see onMounted)
let mapboxgl = null
let map = null
let loaded = false
let markers = []

const HEAT_SOURCE = 'hotspots'

// Soft green base map colours, so the buildings and the heatmap stand out
const BASE_COLOURS = {
  land: '#dcecc8',
  park: '#bcdc98',
  water: '#a9d3ec',
  building: '#e9eadf',
  road: '#b4b9c4',
  path: '#efe2bf',
}

// Marker element: building picture plus name tag (textContent only)
function markerElement({ building, label }) {
  const el = document.createElement(props.clickable ? 'button' : 'div')
  el.className = 'fi-marker'
  // Where the name sits until placeNames() picks a side
  el.dataset.side = 'below'
  el.dataset.building = building
  el.dataset.testid = `map-tile-${building}`
  if (props.clickable) {
    el.type = 'button'
    el.setAttribute('aria-pressed', String(props.selected === building))
    el.addEventListener('click', () => emit('select', building))
  }
  el.addEventListener('pointerenter', () => emit('hover', building))
  el.addEventListener('pointerleave', () => emit('hover', ''))
  el.addEventListener('focus', () => emit('hover', building))
  el.addEventListener('blur', () => emit('hover', ''))
  el.setAttribute(
    'aria-label',
    describeBuilding(label, props.badges[building], props.stops[building], props.tone),
  )
  markPicked(el)

  const art = document.createElement('span')
  art.className = 'fi-marker-art'
  art.append(pixelBuilding(building))
  el.append(art)

  const name = document.createElement('span')
  name.className = 'fi-marker-name'
  const text = document.createElement('span')
  text.textContent = label
  name.append(text)

  const count = props.badges[building]
  if (count) {
    const badge = document.createElement('span')
    badge.className = 'fi-marker-badge'
    badge.setAttribute('aria-hidden', 'true')
    badge.textContent = count
    name.append(badge)
  }

  for (const number of props.stops[building] || []) {
    const stop = document.createElement('span')
    stop.className = 'fi-marker-stop'
    stop.setAttribute('aria-hidden', 'true')
    stop.textContent = number
    name.append(stop)
  }
  el.append(name)
  return el
}

// Outline the picked building (or a trail stop) and tell screen readers
function markPicked(el) {
  const building = el.dataset.building
  if (props.clickable) el.setAttribute('aria-pressed', String(props.selected === building))
  el.classList.toggle(
    'picked',
    props.selected === building || Boolean(props.stops[building]?.length),
  )
}

// Update the picked marker in place; rebuilding would lose keyboard focus
function updatePicked() {
  markers.forEach((marker) => markPicked(marker.getElement()))
}

function drawMarkers() {
  if (!map) return
  // Give keyboard focus back to the same building after rebuilding
  const focused = markers
    .map((marker) => marker.getElement())
    .find((el) => el === document.activeElement)?.dataset.building
  markers.forEach((marker) => marker.remove())
  markers = labelCentres(props.spots).map((centre) =>
    new mapboxgl.Marker({ element: markerElement(centre), anchor: 'bottom' })
      .setLngLat([centre.lng, centre.lat])
      .addTo(map),
  )
  placeNames()
  if (focused) {
    markers
      .map((marker) => marker.getElement())
      .find((el) => el.dataset.building === focused)
      ?.focus({ preventScroll: true })
  }
}

// ---- Where each name goes ----

// Place each name tag on the side where it overlaps least
function placeNames() {
  if (!map) return
  const canvas = map.getContainer()
  const items = markers.map((marker) => {
    const el = marker.getElement()
    const point = map.project(marker.getLngLat())
    const art = el.querySelector('.fi-marker-art')
    const name = el.querySelector('.fi-marker-name')
    const half = art.offsetWidth / 2
    return {
      art: {
        left: point.x - half,
        right: point.x + half,
        top: point.y - art.offsetHeight,
        bottom: point.y,
      },
      width: name.offsetWidth + 4,
      height: name.offsetHeight + 4,
      picked: el.classList.contains('picked'),
    }
  })
  const sides = chooseNameSides(items, canvas.clientWidth, canvas.clientHeight)
  markers.forEach((marker, index) => (marker.getElement().dataset.side = sides[index]))
}

function fitToCampus() {
  const centres = labelCentres(props.spots)
  if (!map || centres.length === 0) return
  const bounds = new mapboxgl.LngLatBounds()
  centres.forEach((centre) => bounds.extend([centre.lng, centre.lat]))
  // Room for markers and name tags; less side padding on phones
  const narrow = map.getContainer().clientWidth < 576
  map.fitBounds(bounds, {
    padding: narrow
      ? { top: 50, bottom: 40, left: 20, right: 20 }
      : { top: 60, bottom: 40, left: 50, right: 50 },
    maxZoom: 17.5,
    duration: 0,
  })
}

// Each spot glows where its building's picture stands
function heatData() {
  return heatGeoJson(props.heatPoints || [], spotsAtMarkers(props.spots))
}

// Recolour the base map so markers and the heatmap stand out
function paintBaseMap() {
  for (const layer of map.getStyle().layers) {
    const id = layer.id
    let colour = null
    let property = null
    if (layer.type === 'background') {
      property = 'background-color'
      colour = BASE_COLOURS.land
    } else if (layer.type === 'fill' && /water/.test(id)) {
      property = 'fill-color'
      colour = BASE_COLOURS.water
    } else if (layer.type === 'fill' && /park|landuse|pitch|grass|wood|national/.test(id)) {
      property = 'fill-color'
      colour = BASE_COLOURS.park
    } else if (layer.type === 'fill' && /building/.test(id)) {
      property = 'fill-color'
      colour = BASE_COLOURS.building
    } else if (layer.type === 'line' && /path|pedestrian|steps|footway/.test(id)) {
      property = 'line-color'
      colour = BASE_COLOURS.path
    } else if (layer.type === 'line' && /road|bridge|tunnel/.test(id)) {
      property = 'line-color'
      colour = BASE_COLOURS.road
    }
    if (!property) continue
    try {
      map.setPaintProperty(id, property, colour)
    } catch {
      // Not every layer takes every colour; leave that one as it is
    }
  }
}

function drawHeat() {
  if (!map || !loaded) return
  const source = map.getSource(HEAT_SOURCE)
  if (props.heatPoints === null) {
    if (source) {
      map.removeLayer(HEAT_SOURCE)
      map.removeSource(HEAT_SOURCE)
    }
    return
  }
  if (source) {
    source.setData(heatData())
    return
  }
  map.addSource(HEAT_SOURCE, { type: 'geojson', data: heatData() })
  map.addLayer({
    id: HEAT_SOURCE,
    type: 'heatmap',
    source: HEAT_SOURCE,
    paint: {
      'heatmap-weight': ['get', 'weight'],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 15, 2, 18, 4],
      // Grows with zoom so a spot covers about its building at any zoom
      'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 15, 18, 18, 130],
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        // Yellow to purple, readable with red-green colour blindness
        0,
        'rgba(254, 217, 118, 0)',
        0.1,
        'rgba(254, 217, 118, 0.65)',
        0.35,
        'rgba(253, 141, 60, 0.78)',
        0.65,
        'rgba(222, 73, 104, 0.82)',
        1,
        'rgba(81, 18, 124, 0.88)',
      ],
    },
  })
}

let unmounted = false

onMounted(async () => {
  // Load Mapbox only when needed; emit failed so the drawn map takes over
  try {
    mapboxgl = (await import('mapbox-gl')).default
    await import('mapbox-gl/dist/mapbox-gl.css')
  } catch (error) {
    emit('failed', error)
    return
  }
  // The page may have been left while Mapbox was downloading
  if (unmounted) return

  mapboxgl.accessToken = props.token
  try {
    map = new mapboxgl.Map({
      container: container.value,
      style: 'mapbox://styles/mapbox/light-v11',
      center: SMU_CENTRE,
      zoom: 16.5,
      minZoom: 15,
      maxZoom: 19,
      // Keep the page scrollable on a phone: moving the map takes two fingers
      cooperativeGestures: true,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: true,
    })
  } catch {
    // No WebGL, or Mapbox refused to start
    emit('failed')
    return
  }
  map.touchZoomRotate.disableRotation()
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

  map.on('error', (event) => {
    // A wrong or missing token, or no internet, before the map ever loaded
    if (!loaded) emit('failed', event.error)
  })
  // Labels only move apart or together when the zoom changes
  map.on('zoomend', placeNames)
  map.on('load', () => {
    loaded = true
    paintBaseMap()
    fitToCampus()
    placeNames()
    drawHeat()
  })
  drawMarkers()
})

watch(
  () => props.spots,
  () => {
    fitToCampus()
    drawMarkers()
    drawHeat()
  },
)
watch(() => [props.badges, props.stops, props.clickable], drawMarkers, { deep: true })
watch(() => props.selected, updatePicked)
watch(() => props.heatPoints, drawHeat)

onUnmounted(() => {
  unmounted = true
  markers.forEach((marker) => marker.remove())
  if (map) map.remove()
  map = null
})
</script>

<template>
  <div class="campus-mapbox" :class="`tone-${tone}`" data-testid="campus-map">
    <div ref="container" class="map-canvas"></div>
  </div>
</template>

<style scoped>
/* Inside rebuilt pages (class="ds"), so the frame and the name tags take the
   design system's tokens. Yellow for finds, red for lost reports and trail
   stops. The base map keeps its own light colours (BASE_COLOURS above). */
.campus-mapbox {
  --kind: var(--ds-found-fill);
  position: relative;
  height: 460px;
  overflow: hidden;
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-sunken);
}

.campus-mapbox.tone-lost {
  --kind: var(--ds-lost-fill);
}

.map-canvas {
  position: absolute;
  inset: 0;
}

/* Markers are created in JS, so they need :deep() */
.campus-mapbox :deep(.fi-marker) {
  /* No position here: Mapbox positions markers absolutely and must win */
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ds-text);
  font: inherit;
  font-family: var(--ds-font-text);
  line-height: 1.2;
  white-space: nowrap;
}

.campus-mapbox :deep(button.fi-marker) {
  cursor: pointer;
}

.campus-mapbox :deep(.fi-marker-art) {
  position: relative;
  display: block;
  transition: translate var(--ds-dur-fast) var(--ds-ease-out);
}

.campus-mapbox :deep(.fi-sprite) {
  display: block;
}

/* Hovering or picking a building lifts its picture a little */
.campus-mapbox :deep(button.fi-marker:hover .fi-marker-art),
.campus-mapbox :deep(.fi-marker.picked .fi-marker-art) {
  translate: 0 -3px;
}

/* Name tag, placed on the side placeNames() picked: a small flat label */
.campus-mapbox :deep(.fi-marker-name) {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  padding: 0.1rem var(--ds-space-2);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  box-shadow: var(--ds-elev-1);
  color: var(--ds-text);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-medium);
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    border-color var(--ds-dur-fast) var(--ds-ease-out);
}

.campus-mapbox :deep(.fi-marker[data-side='below'] .fi-marker-name) {
  top: calc(100% + 3px);
  left: 50%;
  transform: translateX(-50%);
}

.campus-mapbox :deep(.fi-marker[data-side='right'] .fi-marker-name) {
  top: 50%;
  left: calc(100% + 3px);
  transform: translateY(-50%);
}

.campus-mapbox :deep(.fi-marker[data-side='left'] .fi-marker-name) {
  top: 50%;
  right: calc(100% + 3px);
  transform: translateY(-50%);
}

.campus-mapbox :deep(.fi-marker[data-side='above'] .fi-marker-name) {
  bottom: calc(100% + 3px);
  left: 50%;
  transform: translateX(-50%);
}

/* Hover: a navy edge. Picked: filled navy */
.campus-mapbox :deep(button.fi-marker:hover .fi-marker-name),
.campus-mapbox :deep(button.fi-marker:focus-visible .fi-marker-name) {
  border-color: var(--ds-action);
}

.campus-mapbox :deep(.fi-marker.picked .fi-marker-name) {
  border-color: var(--ds-action);
  background: var(--ds-action);
  color: var(--ds-on-action);
}

.campus-mapbox :deep(button.fi-marker:focus-visible) {
  outline: 3px solid var(--ds-focus);
  outline-offset: 2px;
}

/* Count or stop numbers in the name tag: dark digits on the bright fill */
.campus-mapbox :deep(.fi-marker-badge),
.campus-mapbox :deep(.fi-marker-stop) {
  display: inline-grid;
  place-items: center;
  min-width: 1.3rem;
  height: 1.3rem;
  padding: 0 0.3rem;
  border-radius: var(--ds-radius-round);
  color: var(--ds-band);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
}

.campus-mapbox :deep(.fi-marker-badge) {
  background: var(--kind);
}

/* Trail stops are red, as in the lost report's list */
.campus-mapbox :deep(.fi-marker-stop) {
  background: var(--ds-lost-fill);
}

@media (max-width: 575.98px) {
  .campus-mapbox {
    height: 420px;
  }

  /* Smaller pictures on a phone, so the buildings do not crowd each other */
  .campus-mapbox :deep(.fi-sprite) {
    width: auto;
    height: 22px;
  }
}

/* Touch screens: at least 32px tap targets */
@media (pointer: coarse) {
  .campus-mapbox :deep(button.fi-marker .fi-marker-art) {
    display: grid;
    place-items: end center;
    min-width: 32px;
    min-height: 32px;
  }

  .campus-mapbox :deep(button.fi-marker .fi-marker-name) {
    min-height: 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .campus-mapbox :deep(.fi-marker-art),
  .campus-mapbox :deep(.fi-marker-name) {
    transition: none;
  }

  .campus-mapbox :deep(button.fi-marker:hover .fi-marker-art),
  .campus-mapbox :deep(.fi-marker.picked .fi-marker-art) {
    translate: none;
  }
}
</style>
