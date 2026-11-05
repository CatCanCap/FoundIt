<script setup>
// The waiting cases on the Admin page, hanging on a rail like a clothes rack.
// Each tag hangs lower the longer it has waited, its top level with day lines that stay
// still while the rack slides: swipe it, drag it with a mouse, or use the
// arrows. The tags sway as the rack moves (utils/pendulum.js) and stay still
// for people who ask their device for less motion.
//   entries  [{ id, code, title, category, colour, photoUrl, hours, wait }]
//   picked   the id of the tag that is open underneath
//   label    what the tags are, for screen readers
// The tools slot sits on the left of the rack's own controls.
// Emits pick with an id on a click, open with an id on a double click or
// double tap, and aim with where the picked tag is along the rack
// (px, or null when it is out of view), so the ticket can point at it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import { resizedPhotoUrl } from '@/services/cloudinary'
import { isAtRest, stepPendulum } from '@/utils/pendulum'

const props = defineProps({
  entries: { type: Array, required: true },
  picked: { type: [Number, String], default: null },
  label: { type: String, default: 'Waiting cases' },
})

const emit = defineEmits(['pick', 'open', 'aim'])

const LATE_HOURS = 48
const MOST_DROP_REM = 12

const rack = ref(null)
const slide = ref(null)
const range = ref('')
const atStart = ref(true)
const atEnd = ref(true)
const isDragging = ref(false)

// A very old case shrinks the scale instead of pushing the page down
const longest = computed(() => Math.max(24, ...props.entries.map((entry) => entry.hours)))
const remPerDay = computed(() => Math.min(5, MOST_DROP_REM / (longest.value / 24)))
const stringLength = (hours) => `${((hours / 24) * remPerDay.value + 0.06).toFixed(2)}rem`

const marks = computed(() => {
  const days = Math.ceil(longest.value / 24)
  const every = Math.ceil(days / 5)
  const list = []
  for (let day = 0; day <= days; day += every) {
    list.push({
      day,
      label: day === 0 ? 'Today' : `${day} ${day === 1 ? 'day' : 'days'}`,
      top: `calc(1.3rem + ${(day * remPerDay.value).toFixed(2)}rem)`,
      late: day * 24 === LATE_HOURS,
    })
  }
  return list
})

function photoOf(entry) {
  return entry.photoUrl ? resizedPhotoUrl(entry.photoUrl, 320) : ''
}

// ---- Where the rack is ----

function measure() {
  const el = slide.value
  if (!el) return
  const tags = [...el.querySelectorAll('[data-rack-tag]')]
  const box = el.getBoundingClientRect()
  const seen = tags
    .map((tag, index) => ({ rect: tag.getBoundingClientRect(), index }))
    .filter(({ rect }) => rect.right - 40 > box.left && rect.left + 40 < box.right)
  range.value = seen.length
    ? `${seen[0].index + 1}–${seen[seen.length - 1].index + 1} of ${tags.length}`
    : ''
  atStart.value = el.scrollLeft < 4
  atEnd.value = el.scrollLeft + el.clientWidth > el.scrollWidth - 4

  const pickedTag = el.querySelector('[data-rack-tag].is-picked')
  if (!pickedTag || !rack.value) return emit('aim', null)
  const rect = pickedTag.getBoundingClientRect()
  const away = rect.right < box.left + 40 || rect.left > box.right - 40
  emit('aim', away ? null : rect.left + rect.width / 2 - rack.value.getBoundingClientRect().left)
}

function slideBy(direction) {
  const el = slide.value
  const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'
  el?.scrollBy?.({ left: direction * el.clientWidth * 0.8, behavior })
}

// ---- The sway, one loop for every tag ----

const swings = new Map()
let frame = null
let lastTime = null

function canSway() {
  return window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches
}

function push(el, kick) {
  if (!el || !canSway()) return
  const state = swings.get(el) || { angle: 0, speed: 0 }
  swings.set(el, { ...state, speed: Math.max(-60, Math.min(60, state.speed + kick)) })
  if (frame === null) {
    lastTime = null
    frame = requestAnimationFrame(tick)
  }
}

function tick(time) {
  const dt = lastTime === null ? 0 : (time - lastTime) / 1000
  lastTime = time
  swings.forEach((state, el) => {
    const next = stepPendulum(state, dt)
    if (isAtRest(next)) {
      el.style.transform = ''
      swings.delete(el)
    } else {
      const angle = Math.max(-9, Math.min(9, next.angle))
      swings.set(el, { ...next, angle })
      el.style.transform = `rotate(${angle.toFixed(2)}deg)`
    }
  })
  frame = swings.size ? requestAnimationFrame(tick) : null
}

let lastLeft = 0

function onScroll() {
  const el = slide.value
  if (!el) return
  const moved = el.scrollLeft - lastLeft
  lastLeft = el.scrollLeft
  measure()
  if (Math.abs(moved) < 2) return
  const kick = Math.max(-22, Math.min(22, moved * 0.7))
  el.querySelectorAll('[data-rack-drop]').forEach((drop) => push(drop, kick))
}

// ---- Dragging with a mouse (touch scrolls by itself). A small move is
// still a click. ----

let drag = null
let justDragged = false

function dragStart(event) {
  if (event.pointerType !== 'mouse') return
  drag = { x: event.clientX, left: slide.value.scrollLeft, moved: false }
}

function dragMove(event) {
  if (!drag || !slide.value) return
  const distance = event.clientX - drag.x
  if (Math.abs(distance) > 6) {
    drag.moved = true
    isDragging.value = true
  }
  if (drag.moved) slide.value.scrollLeft = drag.left - distance
}

function dragEnd() {
  if (drag?.moved) {
    justDragged = true
    setTimeout(() => (justDragged = false))
  }
  drag = null
  isDragging.value = false
}

// event.detail counts quick clicks, for touch screens too, where a double
// tap doesn't always send a dblclick
function pick(entry, event) {
  if (justDragged) return
  if (event.detail >= 2) return emit('open', entry.id)
  emit('pick', entry.id)
  push(event.currentTarget.closest('[data-rack-drop]'), 40)
}

function brush(event) {
  push(event.currentTarget, 14)
}

let resize = null

onMounted(() => {
  measure()
  if (typeof ResizeObserver === 'function') {
    resize = new ResizeObserver(measure)
    resize.observe(slide.value)
  }
})

onBeforeUnmount(() => {
  if (frame !== null) cancelAnimationFrame(frame)
  resize?.disconnect()
})

watch(
  () => [props.entries, props.picked],
  () => nextTick(measure),
  { deep: true },
)
</script>

<template>
  <div>
    <div class="rack-tools">
      <div class="rack-tools__own"><slot name="tools" /></div>
      <div class="rack-where">
        <span aria-live="polite" data-testid="rack-range">{{ range }}</span>
        <button
          type="button"
          class="rack-nudge is-back"
          :disabled="atStart"
          aria-label="Slide the rack left"
          data-testid="rack-back"
          @click="slideBy(-1)"
        ></button>
        <button
          type="button"
          class="rack-nudge"
          :disabled="atEnd"
          aria-label="Slide the rack right"
          data-testid="rack-on"
          @click="slideBy(1)"
        ></button>
      </div>
    </div>

    <div ref="rack" class="rack">
      <div
        v-for="mark in marks"
        :key="mark.day"
        class="rack-mark"
        :class="{ 'is-late': mark.late }"
        :style="{ top: mark.top }"
      >
        <span>{{ mark.label }}</span>
      </div>
      <div class="rack-rod" aria-hidden="true"></div>
      <div
        ref="slide"
        class="rack-slide"
        :class="{ 'is-dragging': isDragging }"
        :aria-label="label"
        role="group"
        data-testid="rack"
        @scroll.passive="onScroll"
        @pointerdown="dragStart"
        @pointermove="dragMove"
        @pointerup="dragEnd"
        @pointerleave="dragEnd"
      >
        <div
          v-for="entry in entries"
          :key="entry.id"
          class="rack-drop"
          :class="{ 'is-picked': entry.id === picked }"
          data-rack-drop
          @pointerenter="brush"
        >
          <span class="a-pin" aria-hidden="true"></span>
          <span
            class="a-string"
            aria-hidden="true"
            :style="{ height: stringLength(entry.hours) }"
          ></span>
          <button
            type="button"
            class="a-tag"
            :class="{ 'is-picked': entry.id === picked }"
            :aria-pressed="entry.id === picked"
            :data-testid="`rack-tag-${entry.id}`"
            title="Double-click to open"
            data-rack-tag
            @click="pick(entry, $event)"
          >
            <span class="a-tag__cap" aria-hidden="true"><span class="a-tag__eyelet"></span></span>
            <span class="a-tag__body">
              <span class="a-tag__pic" aria-hidden="true">
                <img v-if="photoOf(entry)" :src="photoOf(entry)" alt="" loading="lazy" />
                <span v-else-if="entry.initials" class="rack-initials">{{ entry.initials }}</span>
                <ItemIcon v-else :category="entry.category" :colour="entry.colour" :size="48" />
              </span>
              <span class="a-tag__title rack-title">{{ entry.title }}</span>
              <span class="a-tag__stub">
                <span>{{ entry.code }}</span>
                <span :class="{ 'is-late': entry.hours >= LATE_HOURS }">{{ entry.wait }}</span>
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rack-tools {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--ds-space-3) var(--ds-space-4);
  padding-block: var(--ds-space-3);
}

.rack-tools__own {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-3) var(--ds-space-5);
}

.rack-where {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  margin-left: auto;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  font-variant-numeric: tabular-nums;
}

.rack-nudge {
  position: relative;
  width: var(--ds-control-h);
  height: var(--ds-control-h);
  padding: 0;
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-text);
  cursor: pointer;
  transition: background-color var(--ds-dur-fast) var(--ds-ease-out);
}

.rack-nudge:hover:not(:disabled) {
  background: var(--ds-action-wash);
}

.rack-nudge:disabled {
  color: var(--ds-border-control);
  cursor: not-allowed;
}

.rack-nudge::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0.55rem;
  height: 0.55rem;
  border-top: 2px solid currentColor;
  border-right: 2px solid currentColor;
  translate: -65% -50%;
  rotate: 45deg;
}

.rack-nudge.is-back::after {
  translate: -35% -50%;
  rotate: -135deg;
}

.rack {
  position: relative;
  padding-top: var(--ds-space-2);
  padding-left: 4.5rem;
}

.rack-rod {
  position: absolute;
  top: 1.15rem;
  left: 4.5rem;
  right: 0;
  height: 3px;
  border-radius: var(--ds-radius-round);
  background: var(--ds-text-muted);
}

.rack-rod::before,
.rack-rod::after {
  content: '';
  position: absolute;
  top: -0.25rem;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: var(--ds-text-muted);
}

.rack-rod::before {
  left: -0.1rem;
}

.rack-rod::after {
  right: -0.1rem;
}

.rack-mark {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px solid var(--ds-border);
}

.rack-mark span {
  position: absolute;
  left: 0;
  top: -0.7rem;
  padding-right: var(--ds-space-2);
  background: var(--ds-canvas);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
  font-variant-numeric: tabular-nums;
}

.rack-mark.is-late {
  border-top: 1.5px dashed var(--ds-warning);
}

.rack-mark.is-late span {
  color: var(--ds-warning);
  font-weight: var(--ds-weight-bold);
}

.rack-slide {
  position: relative;
  display: flex;
  gap: var(--ds-space-5);
  align-items: flex-start;
  padding: var(--ds-space-2) var(--ds-space-3) var(--ds-space-6);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;
  scrollbar-color: var(--ds-border-control) transparent;
  cursor: grab;
}

.rack-slide.is-dragging {
  cursor: grabbing;
  scroll-snap-type: none;
  user-select: none;
}

.rack-drop {
  position: relative;
  flex: 0 0 11.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  scroll-snap-align: start;
  scroll-margin-left: var(--ds-space-3);
  transform-origin: 50% 0.25rem;
}

.rack-drop.is-picked .a-string,
.rack-drop.is-picked .a-pin {
  background: var(--ds-action);
}

/* The pin sits on the rail, so the string keeps its length */
.rack-drop .a-pin {
  position: absolute;
  top: 0;
  left: 50%;
  margin-left: -0.25rem;
}

.rack-drop .a-string {
  margin-top: 0.24rem;
}

.rack-drop .a-tag {
  touch-action: manipulation;
}

/* Two lines tall, so every stub lines up within a tag */
.rack-initials {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface);
  color: var(--ds-text-muted);
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-title);
  font-weight: var(--ds-weight-bold);
}

.rack-title {
  min-height: 2.6em;
}

@media (max-width: 767.98px) {
  .rack {
    padding-left: 3.25rem;
  }

  .rack-rod {
    left: 3.25rem;
  }

  .rack-drop {
    flex-basis: 10rem;
  }

  .rack-slide {
    gap: var(--ds-space-4);
  }

  .rack-nudge {
    display: none;
  }
}
</style>
