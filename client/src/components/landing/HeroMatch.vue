<script setup>
// The match card in the landing page's hero: a lost tag and a found tag slide
// together, the score counts up to 93 and the four reasons come in one by
// one. It is the example from example.js (the seeded demo data), and it shows in a
// few seconds what FoundIt does.
//
// It plays while it is on screen and starts again every CYCLE_MS. With less
// motion asked for (or no IntersectionObserver, as in tests) it simply shows
// the finished match. The counting number is hidden from screen readers,
// which read the score once from the words beside it.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import { COLOUR_HEX } from '@/utils/design'
import { FOUND, LOST, PARTS, SCORE } from './example'

const CYCLE_MS = 7000
// When the score starts counting, and how long it takes: in step with the
// line between the tags in the styles below
const COUNT_FROM_MS = 900
const COUNT_MS = 700

const card = ref(null)
const armed = ref(false)
const playing = ref(false)
const shown = ref(SCORE)

let observer = null
let cycleTimer = null
let countTimer = null
let frame = null

function countUp() {
  const start = performance.now()
  const step = (time) => {
    const done = Math.min((time - start) / COUNT_MS, 1)
    shown.value = Math.round(SCORE * done)
    if (done < 1) frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}

// Starts the match from the top: the classes come off, then back on a frame
// later so the browser plays the animations again
function play() {
  stop()
  playing.value = false
  shown.value = 0
  frame = requestAnimationFrame(() => {
    playing.value = true
    countTimer = setTimeout(countUp, COUNT_FROM_MS)
    cycleTimer = setTimeout(play, CYCLE_MS)
  })
}

function stop() {
  clearTimeout(cycleTimer)
  clearTimeout(countTimer)
  cancelAnimationFrame(frame)
}

onMounted(() => {
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (still || !('IntersectionObserver' in window)) return
  armed.value = true
  observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) play()
    else {
      stop()
      playing.value = false
      shown.value = SCORE
    }
  })
  observer.observe(card.value)
})

onBeforeUnmount(() => {
  stop()
  observer?.disconnect()
})
</script>

<template>
  <figure
    ref="card"
    class="match"
    :class="{ 'is-armed': armed, 'is-playing': playing }"
    data-testid="hero-match"
  >
    <div class="match__pair">
      <div class="match-tag match-tag--lost">
        <span class="match-tag__cap" aria-hidden="true"
          ><span class="match-tag__eyelet"></span
        ></span>
        <span class="match-tag__body">
          <span class="match-tag__picture" aria-hidden="true">
            <ItemIcon :category="LOST.category" :colour="COLOUR_HEX[LOST.colour]" :size="40" />
          </span>
          <span class="ds-caption ds-muted">Lost</span>
          <span class="match-tag__name">{{ LOST.title }}</span>
        </span>
      </div>

      <p class="match__score">
        <span class="match__number ds-num" aria-hidden="true">{{ shown }}</span>
        <span class="visually-hidden">Scored {{ SCORE }} out of 100</span>
        <span class="ds-caption ds-muted" aria-hidden="true">/ 100</span>
      </p>

      <div class="match-tag match-tag--found">
        <span class="match-tag__cap" aria-hidden="true"
          ><span class="match-tag__eyelet"></span
        ></span>
        <span class="match-tag__body">
          <span class="match-tag__picture" aria-hidden="true">
            <ItemIcon :category="FOUND.category" :colour="COLOUR_HEX[FOUND.colour]" :size="40" />
          </span>
          <span class="ds-caption ds-muted">Found</span>
          <span class="match-tag__name">{{ FOUND.title }}</span>
        </span>
      </div>
    </div>

    <ul class="match__reasons" aria-label="What agrees">
      <li v-for="(part, index) in PARTS" :key="part.label" :style="{ '--i': index }">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 7.5 5.75 10 11 4.5" />
        </svg>
        {{ part.reason }}
      </li>
    </ul>
  </figure>
</template>

<style scoped>
/* The card keeps the page's light colours, even on the navy hero */
.match {
  --u: var(--ds-dur-slow);
  position: relative;
  display: grid;
  gap: var(--ds-space-5);
  margin: 0;
  padding: var(--ds-space-5);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
  color: var(--ds-text);
  box-shadow: var(--ds-elev-2);
}

.match__pair {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: var(--ds-space-3);
}

/* The dashed gold line from one tag's eyelet to the other's, behind the score */
.match__pair::before {
  content: '';
  position: absolute;
  top: 0.6rem;
  right: 25%;
  left: 25%;
  border-top: 2px dashed var(--ds-signal);
  transform-origin: left;
}

.match__score {
  position: relative;
  align-self: start;
  display: grid;
  justify-items: center;
  margin-top: var(--ds-space-5);
  padding: var(--ds-space-1) var(--ds-space-2);
  background: var(--ds-surface);
}

.match__number {
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-h2);
  line-height: 1;
  font-weight: var(--ds-weight-bold);
  color: var(--ds-signal-text);
}

/* An upright luggage tag, like the rest of the site's */
.match-tag {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.match-tag__cap {
  position: relative;
  height: 1.25rem;
  background: var(--ds-border-control);
  clip-path: polygon(16% 0, 84% 0, 100% 100%, 0 100%);
}

.match-tag__cap::before {
  content: '';
  position: absolute;
  inset: 1px 1px 0;
  background: var(--ds-surface);
  clip-path: inherit;
}

.match-tag__eyelet {
  position: absolute;
  top: 0.3rem;
  left: 50%;
  z-index: 1;
  width: 0.75rem;
  height: 0.75rem;
  border: 3px solid var(--ds-signal);
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface);
  transform: translateX(-50%);
}

.match-tag__body {
  display: grid;
  flex-grow: 1;
  align-content: start;
  gap: var(--ds-space-1);
  padding: var(--ds-space-1) var(--ds-space-3) var(--ds-space-3);
  border: 1px solid var(--ds-border-control);
  border-top: 0;
  border-radius: 0 0 var(--ds-radius-surface) var(--ds-radius-surface);
  background: var(--ds-surface);
}

.match-tag__picture {
  display: grid;
  place-items: center;
  height: 4.5rem;
  margin-bottom: var(--ds-space-1);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-tile);
}

.match-tag__name {
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
  font-weight: var(--ds-weight-bold);
}

.match__reasons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-2);
}

.match__reasons li {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  padding: var(--ds-space-1) var(--ds-space-3);
  border-radius: var(--ds-radius-round);
  background: color-mix(in srgb, var(--ds-signal) 18%, var(--ds-surface));
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
}

.match__reasons svg {
  fill: none;
  stroke: var(--ds-signal-text);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---- The match playing ----
   Armed (motion allowed, on screen soon) hides what will arrive; playing
   brings each piece in, timed in steps of --u. Without either class the card
   is simply the finished match. Arrivals use translate, so hover transforms
   elsewhere are left alone. */
.is-armed .match-tag,
.is-armed .match__pair::before,
.is-armed .match__score,
.is-armed .match__reasons li {
  opacity: 0;
}

.is-playing .match-tag--lost {
  animation: match-from-left calc(var(--u) * 2) var(--ds-ease-out) both;
}

.is-playing .match-tag--found {
  animation: match-from-right calc(var(--u) * 2) var(--ds-ease-out) both;
}

.is-playing .match__pair::before {
  animation: match-draw var(--u) var(--ds-ease-out) calc(var(--u) * 2) both;
}

.is-playing .match__score {
  animation: match-fade var(--u) var(--ds-ease-out) calc(var(--u) * 2.5) both;
}

.is-playing .match__reasons li {
  animation: match-rise var(--u) var(--ds-ease-out) both;
  animation-delay: calc(var(--u) * 5 + var(--i) * var(--u));
}

@keyframes match-from-left {
  from {
    opacity: 0;
    translate: -60% 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes match-from-right {
  from {
    opacity: 0;
    translate: 60% 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes match-draw {
  from {
    opacity: 1;
    transform: scaleX(0);
  }

  to {
    opacity: 1;
  }
}

@keyframes match-fade {
  to {
    opacity: 1;
  }
}

@keyframes match-rise {
  from {
    opacity: 0;
    translate: 0 var(--ds-space-2);
  }

  to {
    opacity: 1;
  }
}

@media (max-width: 479.98px) {
  .match {
    padding: var(--ds-space-4);
  }

  .match-tag__picture {
    height: 3.5rem;
  }
}
</style>
