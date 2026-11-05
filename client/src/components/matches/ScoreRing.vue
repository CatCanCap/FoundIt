<script setup>
// A match score as a ring that fills up to it, with the number in the middle
// counting up as it fills. Used for the find shown large on the finds page and
// on the feed's banner.
//   score  0 to 100 (rounded here)
//   still  true to show it full straight away (already seen once)
// People who ask their device for less motion, and the unit tests (no
// matchMedia), get the full ring and number straight away.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  score: { type: Number, required: true },
  still: { type: Boolean, default: false },
})

// The same as --ds-dur-max in assets/system.css
const DURATION_MS = 400
const RADIUS = 44
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const target = computed(() => Math.max(0, Math.min(100, Math.round(props.score))))
const shown = ref(target.value)
const offset = computed(() => CIRCUMFERENCE * (1 - shown.value / 100))

let frame = 0

function allowsMotion() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches)
  )
}

onMounted(() => {
  if (props.still || !allowsMotion()) return
  shown.value = 0
  const start = performance.now()
  const step = (now) => {
    const progress = Math.min(1, (now - start) / DURATION_MS)
    // Fast at first, settling gently on the score
    shown.value = Math.round(target.value * (1 - Math.pow(1 - progress, 3)))
    if (progress < 1) frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
})

onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <div class="ring" :class="{ 'ring--strong': target >= 75 }">
    <svg class="ring__svg" viewBox="0 0 100 100" aria-hidden="true">
      <circle class="ring__track" cx="50" cy="50" :r="RADIUS" />
      <circle
        class="ring__fill"
        cx="50"
        cy="50"
        :r="RADIUS"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="offset"
      />
    </svg>
    <p class="ring__number" data-testid="find-score">{{ shown }}%</p>
  </div>
</template>

<style scoped>
.ring {
  position: relative;
  display: grid;
  place-items: center;
  width: 5.25rem;
  aspect-ratio: 1;
  flex-shrink: 0;
}

.ring__svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* The fill starts at twelve o'clock */
  transform: rotate(-90deg);
}

.ring__track,
.ring__fill {
  fill: none;
  stroke-width: 8;
}

.ring__track {
  stroke: var(--fi-line);
}

.ring__fill {
  stroke: var(--fi-brass);
  stroke-linecap: round;
}

.ring--strong .ring__fill {
  stroke: var(--fi-success);
}

.ring__number {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

@media (min-width: 576px) {
  .ring {
    width: 6rem;
  }

  .ring__number {
    font-size: 1.55rem;
  }
}

/* Inside a rebuilt page: gold, because gold means a match */
.ds .ring__track {
  stroke: var(--ds-surface-sunken);
}

.ds .ring__fill,
.ds .ring--strong .ring__fill {
  stroke: var(--ds-signal);
}

.ds .ring__number {
  color: var(--ds-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-bold);
  letter-spacing: normal;
}
</style>
