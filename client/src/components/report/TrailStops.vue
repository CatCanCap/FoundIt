<script setup>
// The lost report's trail step: the day and 1 to 10 stops, added by tapping a
// building on the map or picking one from the list.
//   <TrailStops v-model:date="date" v-model:stops="stops" :spots="spots" @error="..." />
import { computed, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import CampusMap from '@/components/campus/CampusMap.vue'
import { buildingLabel, buildingsFromSpots } from '@/utils/campus-layout'
import { areaLabel } from '@/utils/campus-map'
import { singaporeDate } from '@/utils/report'
import { MAX_STOPS, earliestDay, stopNumbersByBuilding } from '@/utils/trail'

const props = defineProps({
  // Campus spots from GET /api/spots
  spots: { type: Array, required: true },
  // The day, as <input type="date"> gives it: '2026-10-14'
  date: { type: String, required: true },
  // [{ key, building, spotId, start, end }], in the order the owner went
  stops: { type: Array, required: true },
  // The field the form's message is about, from trailErrorTarget() in
  // utils/trail.js: { stop: 2, field: 'end' }, { stop: 0, field: 'date' } or null
  invalid: { type: Object, default: null },
  // The id of that message, so screen readers can read it from the field
  errorId: { type: String, default: '' },
})

// update:date and update:stops send the new value back to the lost report,
// which is what v-model:date and v-model:stops listen for. error shows a message.
const emit = defineEmits(['update:date', 'update:stops', 'error'])

// No day after today in Singapore, and none more than about a year ago (the
// server's limit, see utils/trail.js). Both are worked out again when the date
// box gets focus, so a page left open past midnight still allows today.
const today = ref(singaporeDate(new Date()))
const earliest = ref(earliestDay())

function refreshDayLimits() {
  today.value = singaporeDate(new Date())
  earliest.value = earliestDay()
}
// Continue numbering from existing stops, so keys stay unique after going back
let nextKey = Math.max(0, ...props.stops.map((stop) => stop.key)) + 1

const stopNumbers = computed(() => stopNumbersByBuilding(props.stops))
const buildings = computed(() => buildingsFromSpots(props.spots))
// "Add a stop" swaps the button for a list of buildings
const addingByList = ref(false)

function spotsIn(building) {
  return props.spots.filter((spot) => spot.building === building)
}

// "Level 2 · Lift Lobby", written the same way as places on other pages
function spotLabel(spot) {
  return [spot.floor, areaLabel(spot.area)].filter(Boolean).join(' · ')
}

function addStop(building) {
  if (!building) return
  if (props.stops.length >= MAX_STOPS) {
    emit('error', `You can add up to ${MAX_STOPS} places.`)
    return
  }
  emit('error', '')
  addingByList.value = false
  // Preselect only when the building has a single spot
  const buildingSpots = spotsIn(building)
  const newStop = {
    key: nextKey++,
    building,
    spotId: buildingSpots.length === 1 ? buildingSpots[0].id : '',
    start: '',
    end: '',
  }
  emit('update:stops', [...props.stops, newStop])
}

function removeStop(index) {
  emit(
    'update:stops',
    props.stops.filter((stop, i) => i !== index),
  )
}

// Marks the field the message is about with a red edge (and for screen
// readers). which is 'date', 'spot', 'start' or 'end'; index is the stop's
// place in the list, from 0.
function fieldState(which, index = -1) {
  const target = props.invalid
  if (!target) return {}
  let marked = false
  if (which === 'date') marked = target.field === 'date'
  else if (target.stop === index + 1) {
    const stop = props.stops[index]
    marked =
      target.field === which ||
      (target.field === 'times' && (which === 'start' || which === 'end') && !stop?.[which])
  }
  return marked ? { 'aria-invalid': 'true', 'aria-errormessage': props.errorId || undefined } : {}
}

// Changes one field of one stop, e.g. updateStop(0, 'start', '09:00')
function updateStop(index, field, value) {
  emit(
    'update:stops',
    props.stops.map((stop, i) => (i === index ? { ...stop, [field]: value } : stop)),
  )
}
</script>

<template>
  <!-- The map, then the day and the list; side by side from 1024px -->
  <div class="trail-step">
    <div class="trail-map">
      <CampusMap :spots="spots" :stops="stopNumbers" clickable @select="addStop" />
      <p class="ds-small ds-muted">
        Tap a building to add it ·
        <span class="ds-num">{{ stops.length }} / {{ MAX_STOPS }}</span>
      </p>
    </div>

    <div class="trail-stops">
      <div class="trail-field">
        <label for="lost-date" class="trail-label">Which day?</label>
        <input
          id="lost-date"
          :value="date"
          type="date"
          class="trail-input"
          :min="earliest"
          :max="today"
          @input="emit('update:date', $event.target.value)"
          @focus="refreshDayLimits"
          v-bind="fieldState('date')"
          data-testid="lost-date"
        />
      </div>

      <h2 class="ds-title">Your trail</h2>
      <p v-if="stops.length === 0" class="ds-small ds-muted">
        Tap the buildings you went to, in order. One is enough if you know where you lost it.
      </p>
      <ol v-else class="trail-list" data-testid="lost-trail">
        <li v-for="(stop, index) in stops" :key="stop.key" class="trail-stop">
          <span class="trail-stop__dot ds-num" aria-hidden="true">{{ index + 1 }}</span>
          <div class="trail-stop__body">
            <div class="trail-stop__head">
              <strong>{{ buildingLabel(stop.building) }}</strong>
              <button
                type="button"
                class="ds-icon-btn trail-stop__remove"
                :aria-label="`Remove stop ${index + 1}, ${buildingLabel(stop.building)}`"
                @click="removeStop(index)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
            <div class="trail-stop__times">
              <label class="visually-hidden" :for="`stop-start-${stop.key}`">
                Stop {{ index + 1 }} from
              </label>
              <input
                :id="`stop-start-${stop.key}`"
                :value="stop.start"
                type="time"
                class="trail-input"
                required
                v-bind="fieldState('start', index)"
                :data-testid="`lost-stop-start-${index + 1}`"
                @input="updateStop(index, 'start', $event.target.value)"
              />
              <span aria-hidden="true">–</span>
              <label class="visually-hidden" :for="`stop-end-${stop.key}`">
                Stop {{ index + 1 }} until
              </label>
              <input
                :id="`stop-end-${stop.key}`"
                :value="stop.end"
                type="time"
                class="trail-input"
                required
                v-bind="fieldState('end', index)"
                :data-testid="`lost-stop-end-${index + 1}`"
                @input="updateStop(index, 'end', $event.target.value)"
              />
            </div>
            <template v-if="spotsIn(stop.building).length > 1">
              <label class="visually-hidden" :for="`stop-spot-${stop.key}`">
                Where in {{ buildingLabel(stop.building) }}
              </label>
              <BaseSelect
                :id="`stop-spot-${stop.key}`"
                :model-value="stop.spotId"
                placeholder="Where in the building?"
                v-bind="fieldState('spot', index)"
                :data-testid="`lost-stop-spot-${index + 1}`"
                @update:model-value="updateStop(index, 'spotId', Number($event))"
              >
                <option v-for="spot in spotsIn(stop.building)" :key="spot.id" :value="spot.id">
                  {{ spotLabel(spot) }}
                </option>
              </BaseSelect>
            </template>
            <p v-if="index === stops.length - 1 && stops.length > 1" class="ds-small ds-muted">
              Last place: where you noticed it was gone
            </p>
          </div>
        </li>
      </ol>

      <div v-if="addingByList" class="trail-field">
        <label for="lost-add-building" class="trail-label">Add a building</label>
        <BaseSelect
          id="lost-add-building"
          model-value=""
          placeholder="Pick one"
          data-testid="lost-add-building"
          @update:model-value="addStop"
        >
          <option v-for="building in buildings" :key="building" :value="building">
            {{ buildingLabel(building) }}
          </option>
        </BaseSelect>
      </div>
      <BaseButton
        v-else-if="stops.length < MAX_STOPS"
        variant="secondary"
        size="sm"
        data-testid="lost-add-stop"
        @click="addingByList = true"
      >
        Add a stop
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
/* Only the lost report (a rebuilt page, class="ds") uses this, so it takes
   the design system's tokens directly */
.trail-step {
  display: grid;
  gap: var(--ds-space-5);
}

.trail-map {
  display: grid;
  gap: var(--ds-space-2);
  min-width: 0;
}

.trail-stops {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ds-space-4);
  min-width: 0;
}

.trail-field {
  display: grid;
  gap: var(--ds-space-2);
  width: 100%;
}

.trail-label {
  color: var(--ds-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
}

.trail-input {
  width: 100%;
  min-width: 0;
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-3);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background-color: var(--ds-surface);
  color: var(--ds-text);
  font: inherit;
  transition: border-color var(--ds-dur-fast) var(--ds-ease-out);
}

.trail-input:hover {
  border-color: var(--ds-text-muted);
}

.trail-input:focus {
  border-color: var(--ds-action);
}

/* The field the form's message is about */
.trail-input[aria-invalid='true'] {
  border-color: var(--ds-danger);
}

/* ---- The stops, numbered in red like the stops on the map ---- */
.trail-list {
  width: 100%;
}

.trail-stop {
  display: flex;
  gap: var(--ds-space-3);
  padding-block: var(--ds-space-3);
  border-bottom: 1px solid var(--ds-border);
}

.trail-stop:first-child {
  padding-top: 0;
}

.trail-stop__dot {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--ds-radius-round);
  background: var(--ds-lost-fill);
  color: var(--ds-band);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-bold);
}

.trail-stop__body {
  display: grid;
  flex-grow: 1;
  gap: var(--ds-space-2);
  min-width: 0;
}

.trail-stop__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-2);
}

.trail-stop__remove {
  flex-shrink: 0;
  color: var(--ds-text-muted);
}

.trail-stop__remove:hover {
  border-color: var(--ds-danger);
  color: var(--ds-danger);
}

.trail-stop__remove svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
}

.trail-stop__times {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  color: var(--ds-text-muted);
}

@media (min-width: 1024px) {
  .trail-step {
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    align-items: start;
    gap: var(--ds-space-6);
  }
}
</style>
