<script setup>
// Brings the wave wallpaper to life. The waves and the dotted gold trail
// behind a page are a still picture (assets/backdrop-wave-*.svg, through
// --fi-backdrop, which has a day and a night version), so this draws a few
// moving pieces exactly on top of it: a glint of gold that travels along the
// trail, another riding the gold thread on the middle wave, and the trail's
// last stop slowly breathing, as if something just turned up there.
//
// Made for the feed, and used on Matches, the map and Returns too. To use it,
// put it first inside the page's root and give the root
//   background: var(--fi-backdrop);
//   isolation: isolate;
// so it sits above the wallpaper and under everything else.
//
// It uses the wallpaper's own picture size and fit (1600 by 1000, kept to the
// bottom middle and cropped to fill the window, fixed while the page
// scrolls), so every piece lands on the line it belongs to at any window
// size. It is decoration, hidden from screen readers, and left out with less
// motion asked for, which leaves the still wallpaper.

// The same lines as in the wallpaper
const TRAIL = 'M 820 150 C 960 90 1060 230 1190 190 S 1400 90 1530 170'
const THREAD = 'M 0 900 C 240 868 440 800 660 742 S 1060 622 1280 602 S 1510 562 1600 526'
const LAST_STOP = { x: 1530, y: 170 }
</script>

<template>
  <svg
    class="trail-backdrop"
    viewBox="0 0 1600 1000"
    preserveAspectRatio="xMidYMax slice"
    aria-hidden="true"
    focusable="false"
  >
    <path class="trail-backdrop__glint" :d="TRAIL" pathLength="100" />
    <path
      class="trail-backdrop__glint trail-backdrop__glint--thread"
      :d="THREAD"
      pathLength="100"
    />
    <circle class="trail-backdrop__ring" :cx="LAST_STOP.x" :cy="LAST_STOP.y" r="7" />
  </svg>
</template>

<style scoped>
/* Fixed to the window like the wallpaper, behind everything on the page
   (the page isolates its layers, so this stays above the wallpaper) */
.trail-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* A short bright dash that runs the length of the line and starts again:
   the line is measured as 100 long, so a dash of 7 and a gap of 93 leave one
   glint, and moving it by 100 is once along. Timed in --ds-loop, the design
   system's cycle length. */
.trail-backdrop__glint {
  fill: none;
  stroke: var(--ds-signal);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 7 93;
  stroke-dashoffset: 7;
  opacity: 0.7;
  animation: trail-backdrop-run calc(var(--ds-loop) * 7) linear infinite;
}

/* The thread is longer and fainter, so its glint is slower and quieter,
   and starts part of the way through so the two don't move in step */
.trail-backdrop__glint--thread {
  stroke-width: 2;
  opacity: 0.45;
  animation-duration: calc(var(--ds-loop) * 12);
  animation-delay: calc(var(--ds-loop) * -4);
}

/* The last stop on the trail: a ring that grows out of it and fades */
.trail-backdrop__ring {
  fill: none;
  stroke: var(--ds-signal);
  stroke-width: 2.5;
  transform-box: fill-box;
  transform-origin: center;
  animation: trail-backdrop-breathe calc(var(--ds-loop) * 3) var(--ds-ease-out) infinite;
}

@keyframes trail-backdrop-run {
  to {
    stroke-dashoffset: -93;
  }
}

@keyframes trail-backdrop-breathe {
  0% {
    opacity: 0.8;
    transform: scale(1);
  }

  100% {
    opacity: 0;
    transform: scale(3);
  }
}

@media (prefers-reduced-motion: reduce) {
  .trail-backdrop {
    display: none;
  }
}
</style>
