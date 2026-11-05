<script setup>
// How a lost item gets back to its owner, on the landing page: three steps,
// each shown with a real piece of the product instead of an icon. All three
// follow the one example in example.js (Alice's White AirPods Pro case, its
// three-stop trail, its best match and the handoff).
//
// Each step's card has the lion on its corner in a pose for that step: Oops
// for losing it, Watching for the match, Cheer (always gently cheering) for
// getting it back. On big screens the three cards line up in one row.
//
// The first time the section scrolls into view it plays through once: each
// step lights up in turn and its lion pops up, the trail's stops come in and
// the matching one turns gold, the score's bars fill as the number counts to
// 93, then the two handoff ticks come in, Returned is stamped on and the
// cheering lion jumps. With less motion asked for (or no
// IntersectionObserver, as in tests) the finished section simply shows.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import MascotArt from '@/components/ui/MascotArt.vue'
import { BIGGEST_PART, HANDOFF, PARTS, SCORE, TRAIL } from './example'

// When the score starts counting and how long it takes, in step with the
// bars in the styles below (10 and 4 steps of --ds-dur-slow, 320ms)
const COUNT_FROM_MS = 3200
const COUNT_MS = 1280

const root = ref(null)
const armed = ref(false)
const playing = ref(false)
const shown = ref(SCORE)

let observer = null
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

onMounted(() => {
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (still || !('IntersectionObserver' in window)) return
  armed.value = true
  shown.value = 0
  observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      playing.value = true
      countTimer = setTimeout(countUp, COUNT_FROM_MS)
    },
    { threshold: 0.35 },
  )
  observer.observe(root.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimeout(countTimer)
  cancelAnimationFrame(frame)
})
</script>

<template>
  <section
    ref="root"
    class="how"
    :class="{ 'is-armed': armed, 'is-playing': playing }"
    aria-labelledby="how-title"
    data-testid="how-it-works"
  >
    <div class="ds-wrap">
      <h2 id="how-title" class="ds-h2 how__title">How a lost item finds its way back</h2>

      <div class="how__track">
        <ol class="how__steps">
          <li class="how__step" style="--d: 0; --c: 6">
            <span class="how__num ds-num" aria-hidden="true">1</span>
            <h3 class="ds-title">Report it</h3>
            <p class="ds-muted">
              Owners list up to 10 places from their day. Finders mark the spot they picked it up.
            </p>
            <figure class="how__card">
              <p class="ds-small how__card-head">Lost: White AirPods Pro case</p>
              <ol class="how__trail">
                <li
                  v-for="(stop, index) in TRAIL"
                  :key="stop.place"
                  :class="{ 'is-hit': stop.hit }"
                  :style="{ '--i': index }"
                >
                  <span class="how__trail-dot" aria-hidden="true"></span>
                  <span class="how__trail-place">{{ stop.place }}</span>
                  <span class="ds-small ds-muted">{{ stop.detail }}</span>
                  <span class="ds-small ds-muted ds-num how__trail-time">{{ stop.time }}</span>
                </li>
              </ol>
              <span class="how__sticker how__sticker--oops" aria-hidden="true">
                <MascotArt variant="oops" :size="80" />
              </span>
            </figure>
          </li>

          <li class="how__step" style="--d: 9; --c: 15">
            <span class="how__num ds-num" aria-hidden="true">2</span>
            <h3 class="ds-title">Get matched</h3>
            <p class="ds-muted">
              Every find is scored out of 100 against your report, and you see what agrees.
            </p>
            <figure class="how__card">
              <div class="how__score">
                <p class="ds-small how__card-head">Best match: AirPods case with sticker</p>
                <p class="how__score-number ds-num">
                  <span aria-hidden="true">{{ shown }}</span
                  ><span class="visually-hidden">{{ SCORE }}</span
                  ><span class="ds-small ds-muted"> / 100</span>
                </p>
              </div>
              <ul class="how__parts">
                <li v-for="(part, index) in PARTS" :key="part.label" :style="{ '--i': index }">
                  <span class="how__part-label">{{ part.label }}</span>
                  <span class="ds-small ds-muted how__part-reason">{{ part.reason }}</span>
                  <span class="ds-small ds-num how__part-points"
                    >{{ part.earned }}/{{ part.max }}</span
                  >
                  <!-- The track's length is the part's share of the score; the gold is what this pair earned -->
                  <span
                    class="how__part-track"
                    :style="{
                      '--track': part.max / BIGGEST_PART,
                      '--fill': part.earned / part.max,
                    }"
                    aria-hidden="true"
                  ></span>
                </li>
              </ul>
              <span class="how__sticker how__sticker--watching" aria-hidden="true">
                <MascotArt variant="watching" :size="80" />
              </span>
            </figure>
          </li>

          <li class="how__step" style="--d: 18">
            <span class="how__num ds-num" aria-hidden="true">3</span>
            <h3 class="ds-title">Hand it over</h3>
            <p class="ds-muted">
              Chat in FoundIt without swapping numbers. The finder hands it over, and the owner
              confirms it’s back.
            </p>
            <figure class="how__card">
              <ol class="how__handoff">
                <li v-for="(step, index) in HANDOFF" :key="step.who" :style="{ '--i': index }">
                  <svg
                    class="how__tick"
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <circle cx="10" cy="10" r="9" />
                    <path d="M6 10.5 8.75 13 14 7.5" />
                  </svg>
                  <span class="how__handoff-who ds-small">{{ step.who }}</span>
                  <span>{{ step.did }}</span>
                </li>
              </ol>
              <p class="how__returned ds-small">Returned</p>
              <span class="how__sticker how__sticker--cheer" aria-hidden="true">
                <MascotArt variant="cheer" :size="80" />
              </span>
            </figure>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<style scoped>
.how {
  padding-block: var(--ds-space-9);
  border-top: 1px solid var(--ds-border);
  background: var(--ds-surface);
}

.how__title {
  font-size: var(--ds-size-h2);
  line-height: var(--ds-leading-h2);
  max-width: 24ch;
  margin-bottom: var(--ds-space-7);
}

/* Three columns from 1024px, joined by one line through the numbers; one
   column below that, joined by a line down the side */
.how__steps {
  display: grid;
  gap: var(--ds-space-7);
}

.how__step {
  position: relative;
  display: grid;
  align-content: start;
  gap: var(--ds-space-3);
  padding-left: calc(2rem + var(--ds-space-4));
}

.how__step > p {
  max-width: 36ch;
}

.how__num {
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border: 1.5px solid var(--ds-action);
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface);
  color: var(--ds-action);
  font-weight: var(--ds-weight-bold);
}

/* From under this step's number to just above the next one */
.how__step:not(:last-child)::after {
  content: '';
  position: absolute;
  top: calc(2rem + var(--ds-space-2));
  bottom: calc(var(--ds-space-2) - var(--ds-space-7));
  left: calc(1rem - 0.75px);
  border-left: 1.5px solid var(--ds-border-control);
}

@media (min-width: 1024px) {
  .how__steps {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--ds-space-6);
  }

  .how__step {
    padding-left: 0;
    padding-top: calc(2rem + var(--ds-space-4));
  }

  /* From right of this step's number to just before the next one */
  .how__step:not(:last-child)::after {
    top: calc(1rem - 0.75px);
    right: calc(var(--ds-space-2) - var(--ds-space-6));
    bottom: auto;
    left: calc(2rem + var(--ds-space-2));
    border-left: 0;
    border-top: 1.5px solid var(--ds-border-control);
  }
}

/* The example: a quiet sunken card, not a button */
.how__card {
  position: relative;
  display: grid;
  align-content: start;
  gap: var(--ds-space-4);
  margin-top: var(--ds-space-2);
  /* Extra room at the bottom, so the lion on the corner never covers a line */
  padding: var(--ds-space-4) var(--ds-space-4) var(--ds-space-8);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface-sunken);
}

/* The lion sits on the card's bottom corner, a little outside it */
.how__sticker {
  position: absolute;
  right: calc(-1 * var(--ds-space-3));
  bottom: calc(-1 * var(--ds-space-5));
  line-height: 0;
}

.how__card-head {
  font-weight: var(--ds-weight-medium);
}

/* 1: the trail, with the stop that matched in gold */
.how__trail {
  display: grid;
  gap: var(--ds-space-3);
}

.how__trail li {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  padding-left: var(--ds-space-5);
}

.how__trail-place {
  font-weight: var(--ds-weight-medium);
}

.how__trail li > .ds-muted:not(.how__trail-time) {
  grid-column: 1;
}

.how__trail-time {
  grid-column: 2;
  grid-row: 1;
}

.how__trail-dot {
  position: absolute;
  top: 0.45em;
  left: 0;
  width: 0.625rem;
  height: 0.625rem;
  border: 2px solid var(--ds-text-muted);
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface-sunken);
}

/* The line from each stop's dot down to the next stop's dot */
.how__trail li:not(:last-child)::after {
  content: '';
  position: absolute;
  top: calc(0.45em + 0.625rem + 2px);
  bottom: calc(2px - var(--ds-space-3) - 0.45em);
  left: calc(0.3125rem - 1px);
  border-left: 2px solid var(--ds-border-control);
}

.how__trail li.is-hit .how__trail-dot {
  border-color: var(--ds-signal);
  background: var(--ds-signal);
}

/* 2: the score and its four parts */
.how__score {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ds-space-3);
}

.how__score-number {
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-h2);
  line-height: 1;
  font-weight: var(--ds-weight-bold);
  white-space: nowrap;
}

.how__parts {
  display: grid;
  gap: var(--ds-space-3);
}

.how__parts li {
  display: grid;
  grid-template-columns: 5rem minmax(0, 1fr) auto;
  align-items: baseline;
  column-gap: var(--ds-space-3);
  row-gap: var(--ds-space-1);
}

.how__part-label {
  font-weight: var(--ds-weight-medium);
}

.how__part-reason {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.how__part-track {
  grid-column: 1 / -1;
  position: relative;
  width: calc(var(--track) * 100%);
  height: 0.375rem;
  border-radius: var(--ds-radius-round);
  background: var(--ds-border);
  overflow: hidden;
}

.how__part-track::after {
  content: '';
  position: absolute;
  inset: 0;
  width: calc(var(--fill) * 100%);
  border-radius: inherit;
  background: var(--ds-signal);
}

/* 3: the two-step handoff */
.how__handoff {
  display: grid;
  gap: var(--ds-space-3);
}

.how__handoff li {
  display: grid;
  grid-template-columns: 1.25rem minmax(0, 1fr);
  column-gap: var(--ds-space-3);
}

.how__tick {
  grid-row: 1 / span 2;
  margin-top: 0.15em;
  fill: none;
  stroke: var(--ds-success);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.how__handoff-who {
  color: var(--ds-text-muted);
  font-weight: var(--ds-weight-medium);
}

.how__returned {
  justify-self: start;
  padding: var(--ds-space-1) var(--ds-space-3);
  border-radius: var(--ds-radius-round);
  background: color-mix(in srgb, var(--ds-success) 14%, transparent);
  color: var(--ds-success);
  font-weight: var(--ds-weight-bold);
}

/* ---- Playing through, the first time it is seen ----
   Armed (motion allowed, not yet seen) holds everything at its start; playing
   brings it in, in steps of --u. Each step has its start (--d) and, for the
   first two, when the line on to the next one draws (--c), both in steps.
   Without either class the section is simply finished. */
.how {
  --u: var(--ds-dur-slow);
}

.how__track {
  position: relative;
}

.is-armed .how__step {
  opacity: 0.4;
}

.is-playing .how__step {
  animation: how-on var(--u) var(--ds-ease-out) calc(var(--d) * var(--u)) both;
}

.is-playing .how__num {
  animation: how-num-on var(--u) var(--ds-ease-out) calc(var(--d) * var(--u)) both;
}

.is-armed .how__step:not(:last-child)::after {
  transform: scaleY(0);
  transform-origin: top;
}

.is-playing .how__step:not(:last-child)::after {
  animation: how-draw-down calc(var(--u) * 3) var(--ds-ease-out) calc(var(--c) * var(--u)) both;
}

/* 1: the stops come in one by one, then the one that matched turns gold */
.is-armed .how__trail li {
  opacity: 0;
}

.is-playing .how__trail li {
  animation: how-rise var(--u) var(--ds-ease-out) both;
  animation-delay: calc((1 + var(--i) * 1.5) * var(--u));
}

.is-armed .how__trail li.is-hit .how__trail-dot {
  border-color: var(--ds-text-muted);
  background: var(--ds-surface-sunken);
}

.is-playing .how__trail li.is-hit .how__trail-dot {
  animation: how-gold var(--u) var(--ds-ease-out) calc(var(--u) * 5.5) forwards;
}

/* 2: the bars fill while the number counts */
.is-armed .how__part-track::after {
  transform: scaleX(0);
  transform-origin: left;
}

.is-playing .how__part-track::after {
  animation: how-fill calc(var(--u) * 2) var(--ds-ease-out) both;
  animation-delay: calc((10 + var(--i) * 0.6) * var(--u));
}

/* 3: the two ticks, then Returned is stamped on */
.is-armed .how__handoff li,
.is-armed .how__returned {
  opacity: 0;
}

.is-playing .how__handoff li {
  animation: how-rise var(--u) var(--ds-ease-out) both;
  animation-delay: calc((19 + var(--i) * 2) * var(--u));
}

.is-playing .how__returned {
  animation: how-stamp calc(var(--u) * 1.5) var(--ds-ease-press) calc(var(--u) * 23) both;
}

/* The lion on each card's bottom corner pops up as its step lights */
.is-armed .how__sticker {
  opacity: 0;
}

.is-playing .how__sticker {
  animation: how-pop calc(var(--u) * 1.5) var(--ds-ease-press) both;
  animation-delay: calc((var(--d) + 1) * var(--u));
}

/* Getting it back: the lion keeps cheering, and jumps when Returned lands */
.how__sticker--cheer :deep(img) {
  transform-origin: 50% 100%;
  animation: how-cheer calc(var(--u) * 3) var(--ds-ease-out) infinite alternate;
}

.is-playing .how__sticker--cheer {
  animation:
    how-pop calc(var(--u) * 1.5) var(--ds-ease-press) calc(19 * var(--u)) both,
    how-hop calc(var(--u) * 1.5) var(--ds-ease-press) calc(24 * var(--u)) 3;
}

@keyframes how-on {
  from {
    opacity: 0.4;
  }

  to {
    opacity: 1;
  }
}

@keyframes how-num-on {
  to {
    background: var(--ds-action);
    color: var(--ds-on-action);
  }
}

@keyframes how-draw-down {
  from {
    transform: scaleY(0);
  }

  to {
    transform: none;
  }
}

@keyframes how-draw-across {
  from {
    transform: scaleX(0);
  }

  to {
    transform: none;
  }
}

@keyframes how-rise {
  from {
    opacity: 0;
    translate: 0 var(--ds-space-2);
  }

  to {
    opacity: 1;
  }
}

@keyframes how-gold {
  to {
    border-color: var(--ds-signal);
    background: var(--ds-signal);
  }
}

@keyframes how-fill {
  from {
    transform: scaleX(0);
  }

  to {
    transform: none;
  }
}

@keyframes how-stamp {
  from {
    opacity: 0;
    scale: 1.8;
    rotate: -8deg;
  }

  to {
    opacity: 1;
  }
}

@keyframes how-pop {
  from {
    opacity: 0;
    scale: 0.6;
    translate: 0 var(--ds-space-4);
  }

  to {
    opacity: 1;
  }
}

@keyframes how-cheer {
  from {
    rotate: -4deg;
  }

  to {
    rotate: 4deg;
    translate: 0 calc(-1 * var(--ds-space-1));
  }
}

@keyframes how-hop {
  40% {
    translate: 0 calc(-1 * var(--ds-space-3));
    rotate: -6deg;
  }
}

@media (min-width: 1024px) {
  .is-armed .how__step:not(:last-child)::after {
    transform: scaleX(0);
    transform-origin: left;
  }

  .is-playing .how__step:not(:last-child)::after {
    animation-name: how-draw-across;
  }

  /* The three cards line up: every step shares the row lines of the list,
     so the descriptions and cards start level and the cards end level */
  .how__steps {
    grid-template-rows: auto auto 1fr;
    row-gap: var(--ds-space-3);
  }

  .how__step {
    grid-row: span 3;
    grid-template-rows: subgrid;
    gap: inherit;
  }
}

@media (max-width: 767.98px) {
  .how {
    padding-block: var(--ds-space-7);
  }

  /* No room past the card's edge on a phone */
  .how__sticker {
    right: 0;
  }

  .how__title {
    margin-bottom: var(--ds-space-6);
  }
}

@media (prefers-reduced-motion: reduce) {
  .how__sticker--cheer :deep(img) {
    animation: none;
  }
}
</style>
