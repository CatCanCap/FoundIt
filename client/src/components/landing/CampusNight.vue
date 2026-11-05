<script setup>
// The picture behind the landing page's hero: the real SMU campus, drawn
// faintly in the navy band's colours (the map from the page-not-found screen,
// components/not-found/campus-plan.js), with two dotted gold trails crawling
// across it. One is the owner's day from the example (SOE/SCIS 2, then the
// library, then the Concourse), the other the find on its way to the library,
// and a ring marks where they meet: the match the card beside it shows.
//
// It is decoration, hidden from screen readers. The trails stand still with
// less motion asked for, and are left out below 1024px, where the headline
// sits on top of them and the match card comes straight after it.
import { PLAN } from '@/components/not-found/campus-plan'

// The part of the map shown: the not-found page's wide view, moved east so
// the trails meet just left of the match card on big screens
const BOX = '-1000 -480 1706 960'

// In the map's own units (half a metre, middle of campus at 0,0)
const OWNER_TRAIL = 'M-287 -365C-200 -300 -90 -200 -14 -106S-150 80 -210 144'
const FIND_TRAIL = 'M-17 182C-60 120 -150 80 -120 44S-40 -60 -14 -106'
const STOPS = [
  { x: -287, y: -365 },
  { x: -210, y: 144 },
  { x: -17, y: 182 },
]
const MEET = { x: -14, y: -106 }
</script>

<template>
  <svg
    class="night"
    :viewBox="BOX"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
    focusable="false"
  >
    <path class="night__green" :d="PLAN.green" />
    <path class="night__blocks" :d="PLAN.blocks" />
    <path class="night__road night__road--minor" :d="PLAN.minor" />
    <path class="night__road" :d="PLAN.major" />
    <path class="night__campus" :d="PLAN.campus" />

    <g class="night__story">
      <path class="night__trail" :d="OWNER_TRAIL" />
      <path class="night__trail night__trail--find" :d="FIND_TRAIL" />
      <circle
        v-for="stop in STOPS"
        :key="stop.x"
        class="night__stop"
        :cx="stop.x"
        :cy="stop.y"
        r="9"
      />
      <circle class="night__meet-ring" :cx="MEET.x" :cy="MEET.y" r="22" />
      <circle class="night__stop" :cx="MEET.x" :cy="MEET.y" r="11" />
    </g>
  </svg>
</template>

<style scoped>
.night {
  --line: color-mix(in srgb, var(--ds-on-band) 16%, transparent);
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.night__green {
  fill: color-mix(in srgb, var(--ds-on-band) 4%, transparent);
}

.night__blocks {
  fill: none;
  stroke: var(--line);
  stroke-width: 1.5;
}

.night__campus {
  fill: color-mix(in srgb, var(--ds-on-band) 12%, transparent);
  stroke: color-mix(in srgb, var(--ds-on-band) 30%, transparent);
  stroke-width: 2;
}

.night__road {
  fill: none;
  stroke: var(--line);
  stroke-width: 5;
  stroke-linecap: round;
}

.night__road--minor {
  stroke-width: 2;
}

/* The trails: gold dashes crawling forward, a cycle like the spinners */
.night__trail {
  fill: none;
  stroke: var(--ds-signal);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 2 22;
  animation: night-crawl calc(var(--ds-loop) * 2) linear infinite;
}

.night__trail--find {
  animation-duration: calc(var(--ds-loop) * 2.5);
}

.night__stop {
  fill: var(--ds-signal);
}

/* Where the two trails meet: a ring that slowly breathes */
.night__meet-ring {
  fill: none;
  stroke: var(--ds-signal);
  stroke-width: 3;
  transform-box: fill-box;
  transform-origin: center;
  animation: night-breathe calc(var(--ds-loop) * 3) var(--ds-ease-out) infinite;
}

@keyframes night-crawl {
  to {
    stroke-dashoffset: -48;
  }
}

@keyframes night-breathe {
  0% {
    opacity: 0.9;
    transform: scale(0.6);
  }

  100% {
    opacity: 0;
    transform: scale(1.8);
  }
}

@media (max-width: 1023.98px) {
  .night__story {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .night__trail,
  .night__meet-ring {
    animation: none;
  }
}
</style>
