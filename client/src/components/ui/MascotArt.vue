<script setup>
// The lion mascot (client/public/brand/); Tagi stands in if it fails to load.
//   variant  full or head, or one of the poses: oops, watching, cheer or shy
//            (cut from the mascot sheet; no eyelids, so eyes does nothing)
//   size     height in pixels
//   eyes     '' (the picture as it is), 'open' or 'closed'. With 'open' or
//            'closed', eyelids in the face's colour are drawn over the
//            picture's two eyes, so the lion can shut them (the sign-in page
//            does this while the password is shown). Full picture only.
import { computed, ref } from 'vue'
import TagiMascot from './TagiMascot.vue'

const props = defineProps({
  variant: { type: String, default: 'full' },
  size: { type: Number, default: 96 },
  eyes: { type: String, default: '' },
})

const SOURCES = {
  full: { src: '/brand/mascot.png', ratio: 300 / 272 },
  head: { src: '/brand/mascot-head.png', ratio: 1 },
  oops: { src: '/brand/mascot-oops.png', ratio: 232 / 240 },
  watching: { src: '/brand/mascot-watching.png', ratio: 280 / 240 },
  cheer: { src: '/brand/mascot-cheer.png', ratio: 273 / 240 },
  shy: { src: '/brand/mascot-shy.png', ratio: 262 / 240 },
}

const picture = computed(() => SOURCES[props.variant] || SOURCES.full)
const missing = ref(false)
const hasLids = computed(() => Boolean(props.eyes) && props.variant === 'full')

// Where the eyes sit in mascot.png (300 × 272): the left one is inside the
// magnifying glass, so it is drawn bigger
const LIDS = [
  { cx: 106.5, cy: 144.5, rx: 10, ry: 15, line: 'M97 147q9.5 8 19 0' },
  { cx: 164, cy: 120, rx: 9.5, ry: 12.5, line: 'M156 122q8 7 16 0' },
]
</script>

<template>
  <span
    v-if="!missing && hasLids"
    class="fi-mascot-blink"
    :class="{ 'is-closed': eyes === 'closed' }"
    data-testid="mascot"
    :data-eyes="eyes"
  >
    <img
      class="fi-mascot"
      :src="picture.src"
      alt=""
      :width="Math.round(size * picture.ratio)"
      :height="size"
      decoding="async"
      @error="missing = true"
    />
    <svg class="fi-mascot-blink__lids" viewBox="0 0 300 272" aria-hidden="true">
      <g v-for="lid in LIDS" :key="lid.cx">
        <ellipse
          class="fi-mascot-blink__cover"
          :cx="lid.cx"
          :cy="lid.cy"
          :rx="lid.rx"
          :ry="lid.ry"
          fill="#fdead2"
        />
        <path
          class="fi-mascot-blink__line"
          :d="lid.line"
          fill="none"
          stroke="#1e2125"
          stroke-width="3.5"
          stroke-linecap="round"
        />
      </g>
    </svg>
  </span>
  <img
    v-else-if="!missing"
    class="fi-mascot"
    :src="picture.src"
    alt=""
    :width="Math.round(size * picture.ratio)"
    :height="size"
    decoding="async"
    @error="missing = true"
  />
  <TagiMascot v-else :size="size" :mood="eyes === 'closed' ? 'sleepy' : 'searching'" />
</template>

<style scoped>
.fi-mascot {
  display: block;
  flex-shrink: 0;
  object-fit: contain;
}

/* The eyelids sit exactly over the picture, whatever size it is drawn at */
.fi-mascot-blink {
  position: relative;
  display: inline-block;
  line-height: 0;
}

.fi-mascot-blink__lids {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* Open: the lids are rolled up out of sight. Closed: they come down from the
   top of each eye, then the closed-eye line shows. */
.fi-mascot-blink__cover {
  transform: scaleY(0);
  transform-box: fill-box;
  transform-origin: top;
  transition: transform 0.16s ease-in;
}

.fi-mascot-blink__line {
  opacity: 0;
  transition: opacity 0.08s ease;
}

.is-closed .fi-mascot-blink__cover {
  transform: scaleY(1);
}

.is-closed .fi-mascot-blink__line {
  opacity: 1;
  transition-delay: 0.1s;
}

@media (prefers-reduced-motion: reduce) {
  .fi-mascot-blink__cover,
  .fi-mascot-blink__line {
    transition: none;
  }
}
</style>
