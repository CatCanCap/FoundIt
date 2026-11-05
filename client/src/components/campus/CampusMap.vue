<script setup>
// Campus map for the Map page and the lost report's trail step. Uses Mapbox
// when VITE_MAPBOX_TOKEN is set, otherwise (or if Mapbox fails) the drawn map.
import { computed, ref } from 'vue'
import CampusMapbox from './CampusMapbox.vue'
import CampusSchematic from './CampusSchematic.vue'
import { buildingsFromSpots } from '@/utils/campus-layout'

const props = defineProps({
  // Campus spots from GET /api/spots
  spots: { type: Array, required: true },
  // { 'SCIS 1': 4 } -> a gold count on the building
  badges: { type: Object, default: () => ({}) },
  // { 'LKCSB': [1], 'SCIS 1': [2, 4] } -> navy stop numbers on the building
  stops: { type: Object, default: () => ({}) },
  // Hotspots for the drawn map: { 'SCIS 1': 0.8 }, 0 (none) to 1 (biggest)
  heat: { type: Object, default: () => ({}) },
  // Hotspots for Mapbox: [{ spotId, count }] from GET /api/stats/hotspots
  heatPoints: { type: Array, default: null },
  // found (brass pins) or lost (red pins)
  tone: { type: String, default: 'found' },
  selected: { type: String, default: '' },
  clickable: { type: Boolean, default: false },
})

// select: building clicked. hover: building under the pointer or focus, or ''
const emit = defineEmits(['select', 'hover'])

// Set when Mapbox fails to load; the drawn map takes over
const failed = ref(false)

const token = computed(() => import.meta.env.VITE_MAPBOX_TOKEN || '')
const useMapbox = computed(() => Boolean(token.value) && !failed.value)
const buildings = computed(() => buildingsFromSpots(props.spots))

function onMapboxFailed(error) {
  console.warn('Mapbox could not start, showing the drawn map instead', error)
  failed.value = true
}
</script>

<template>
  <CampusMapbox
    v-if="useMapbox"
    :token="token"
    :spots="spots"
    :badges="badges"
    :stops="stops"
    :heat-points="heatPoints"
    :tone="tone"
    :selected="selected"
    :clickable="clickable"
    @select="emit('select', $event)"
    @hover="emit('hover', $event)"
    @failed="onMapboxFailed"
  />
  <CampusSchematic
    v-else
    :buildings="buildings"
    :badges="badges"
    :stops="stops"
    :heat="heat"
    :tone="tone"
    :selected="selected"
    :clickable="clickable"
    @select="emit('select', $event)"
    @hover="emit('hover', $event)"
  />
</template>
