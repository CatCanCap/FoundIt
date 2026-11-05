<script setup>
// Drawn (not to scale) campus map, used when Mapbox is not available
import { computed } from 'vue'
import { describeBuilding, mapTiles } from '@/utils/campus-layout'

const props = defineProps({
  // Building names to draw, usually buildingsFromSpots(spots)
  buildings: { type: Array, required: true },
  // { 'SCIS 1': 4 } -> a pill pin with the count
  badges: { type: Object, default: () => ({}) },
  // { 'LKCSB': [1], 'SCIS 1': [2, 4] } -> trail stop numbers
  stops: { type: Object, default: () => ({}) },
  // { 'SCIS 1': 0.8 } -> soft circle behind the pin, 0 (none) to 1 (biggest)
  heat: { type: Object, default: () => ({}) },
  // found (yellow pins) or lost (red pins; the top building's pin says "18 lost")
  tone: { type: String, default: 'found' },
  // The building currently picked, outlined
  selected: { type: String, default: '' },
  // When true, tiles are buttons and emit `select`
  clickable: { type: Boolean, default: false },
})

// select: building clicked. hover: building under the pointer or focus, or ''
const emit = defineEmits(['select', 'hover'])

const tiles = computed(() => mapTiles(props.buildings))

// The building with the most, which gets the big pin on the lost map
const topBuilding = computed(() => {
  let best = ''
  for (const [building, count] of Object.entries(props.badges)) {
    if (count && (!best || count > props.badges[best])) best = building
  }
  return best
})

function circleStyle(tile) {
  const scale = props.heat[tile.building] || 0
  // A share of the tile's width, so circles shrink with the map on a phone
  return { '--size': `${40 + scale * 90}%` }
}
</script>

<template>
  <div
    class="campus-map"
    :class="`tone-${tone}`"
    data-testid="campus-map"
    @pointerleave="emit('hover', '')"
  >
    <div class="park"><span>Fort Canning Park</span></div>
    <div class="road"><span>Stamford Rd</span></div>

    <div class="grid">
      <component
        :is="clickable ? 'button' : 'div'"
        v-for="tile in tiles"
        :key="tile.building"
        :type="clickable ? 'button' : undefined"
        class="tile"
        :class="{
          green: tile.green,
          'has-stop': stops[tile.building]?.length,
          picked: selected === tile.building,
          clickable,
        }"
        :style="{ gridArea: tile.area }"
        :aria-label="
          describeBuilding(tile.label, badges[tile.building], stops[tile.building], tone)
        "
        :aria-pressed="clickable ? selected === tile.building : undefined"
        :data-building="tile.building"
        :data-testid="`map-tile-${tile.building}`"
        @click="clickable && emit('select', tile.building)"
        @pointerenter="emit('hover', tile.building)"
        @focus="emit('hover', tile.building)"
        @blur="emit('hover', '')"
      >
        <span class="block">
          <span
            v-if="heat[tile.building]"
            class="heat"
            :style="circleStyle(tile)"
            aria-hidden="true"
          ></span>
          <span
            v-if="badges[tile.building]"
            class="pin"
            :class="{ big: tone === 'lost' && tile.building === topBuilding }"
            aria-hidden="true"
          >
            <template v-if="tone === 'lost' && tile.building === topBuilding">
              {{ badges[tile.building] }} lost
            </template>
            <template v-else> <span class="dot"></span>{{ badges[tile.building] }} </template>
          </span>
          <span v-if="stops[tile.building]?.length" class="stop-numbers" aria-hidden="true">
            <span v-for="number in stops[tile.building]" :key="number" class="stop-number">
              {{ number }}
            </span>
          </span>
        </span>
        <span class="label">{{ tile.label }}</span>
      </component>
    </div>

    <div class="road road-bottom">
      <span>Bras Basah Rd</span>
      <span class="note">Not to scale</span>
    </div>
  </div>
</template>

<style scoped>
.campus-map {
  --map-ground: #ece6db;
  --map-block: #ddd6ca;
  --map-block-hover: #d2cabb;
  --map-green: #d5e5cc;
  --map-park-text: #5d7a55;
  --map-road: #fffcf5;
  --map-pin: #ffffff;
  --map-pin-ink: #121a3d;
  /* Yellow for finds, red for lost reports and trail stops (assets/system.css) */
  --map-dot: var(--ds-found-fill);
  --map-heat: var(--ds-found-fill);
  position: relative;
  overflow: hidden;
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-control);
  background: var(--map-ground);
  color: var(--ds-text-muted);
}

.campus-map.tone-lost {
  --map-dot: var(--ds-lost-fill);
  --map-heat: var(--ds-lost-fill);
}

.park {
  display: flex;
  align-items: flex-start;
  width: 55%;
  height: 5.5rem;
  padding: 1rem 1.25rem;
  border-bottom-right-radius: 2rem;
  background: var(--map-green);
  color: var(--map-park-text);
}

.park span,
.road span {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.road {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 1rem;
  height: 1.6rem;
  margin-top: 1.25rem;
  padding: 0 1.25rem;
  background: var(--map-road);
}

.road-bottom {
  justify-content: space-between;
  margin-top: 0;
  margin-bottom: 1.5rem;
}

.note {
  font-size: 0.65rem;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: minmax(5.5rem, auto);
  gap: 0.75rem 1rem;
  padding: 1.25rem;
}

.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.3rem;
  width: 100%;
  min-height: 5.5rem;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: center;
}

.block {
  position: relative;
  display: grid;
  width: 100%;
  flex: 1;
  place-items: center;
  min-height: 3.5rem;
  border: 2px solid transparent;
  border-radius: var(--ds-radius-control);
  background: var(--map-block);
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    border-color var(--ds-dur-fast) var(--ds-ease-out);
}

.tile.green .block {
  background: var(--map-green);
}

.tile.clickable {
  cursor: pointer;
}

.tile.clickable:hover .block {
  background: var(--map-block-hover);
}

.tile.green.clickable:hover .block {
  background: color-mix(in srgb, var(--map-green) 85%, var(--ds-text));
}

.tile:focus-visible {
  outline: none;
}

.tile:focus-visible .block {
  outline: 3px solid var(--ds-focus);
  outline-offset: 2px;
}

/* The picked building gets a navy edge; a trail stop a red one */
.tile.picked .block {
  border-color: var(--ds-action);
}

.tile.has-stop .block {
  border-color: var(--ds-lost-fill);
}

.label {
  width: 100%;
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.2;
}

.tile.picked .label {
  color: var(--ds-text);
  font-weight: var(--ds-weight-bold);
}

/* The pin: a white pill with a coloured dot and the count */
.pin {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.65rem;
  border-radius: var(--ds-radius-round);
  background: var(--map-pin);
  box-shadow: var(--ds-elev-1);
  color: var(--map-pin-ink);
  font-size: 0.8rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--map-dot);
}

.pin.big {
  padding: 0.35rem 0.85rem;
  background: var(--ds-lost-fill);
  color: var(--ds-band);
  font-size: 0.95rem;
}

/* Soft circle behind the pin, so a busier building looks bigger */
.heat {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  width: var(--size);
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--map-heat) 45%, transparent),
    color-mix(in srgb, var(--map-heat) 0%, transparent) 70%
  );
  pointer-events: none;
}

.stop-numbers {
  position: relative;
  z-index: 3;
  display: flex;
  gap: 0.2rem;
}

.stop-number {
  display: inline-grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border: 2px solid var(--map-pin);
  border-radius: 50%;
  background: var(--ds-lost-fill);
  box-shadow: var(--ds-elev-1);
  color: var(--ds-band);
  font-size: 0.85rem;
  font-weight: 800;
}

@media (max-width: 575.98px) {
  .grid {
    gap: 0.5rem;
    padding: 1rem 0.6rem;
  }

  .tile {
    min-height: 4.5rem;
  }

  .label {
    font-size: 0.62rem;
  }

  .pin {
    padding: 0.15rem 0.45rem;
    font-size: 0.7rem;
  }

  .pin.big {
    padding: 0.2rem 0.5rem;
    font-size: 0.75rem;
  }

  .stop-number {
    width: 1.6rem;
    height: 1.6rem;
    font-size: 0.75rem;
  }

  .park {
    height: 4rem;
    padding: 0.75rem;
  }

  .road {
    padding: 0 0.75rem;
  }
}
</style>

<style>
/* Night mode (not scoped so it can match <html>) */
:root[data-theme='night'] .campus-map {
  --map-ground: #10173d;
  --map-block: #1f2858;
  --map-block-hover: #2a3468;
  --map-green: #1d3a35;
  --map-park-text: #8fc2a5;
  --map-road: #1a2150;
  --map-pin: #fffdf8;
}
</style>
