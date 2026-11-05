<script setup>
// The map on the page-not-found screen: the real campus, with a dotted trail
// through the last two pages someone opened (utils/last-places.js) that stops
// at the page that is missing. Each place is a link back to that page.
//   view    wide (north up, for big screens) or tall (turned, for phones). The
//           page draws both and the media queries below show one
//   places  [{ to, label }], oldest first; none or one is fine
//   end     the words where the trail stops: { title, detail }
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import MascotArt from '@/components/ui/MascotArt.vue'
import { PLAN, VIEWS } from './campus-plan'

const props = defineProps({
  view: { type: String, default: 'wide' },
  places: { type: Array, default: () => [] },
  end: { type: Object, required: true },
})

const plan = computed(() => VIEWS[props.view])

const stops = computed(() => {
  // One place sits on the later spot, next to where the trail stops
  const spots = plan.value.stops.slice(-props.places.length)
  return props.places.map((place, index) => ({
    ...place,
    spot: spots[index],
    isLast: index === props.places.length - 1,
    // A space would collapse inside its own box
    letters: [...place.label].map((letter) => (letter === ' ' ? ' ' : letter)),
  }))
})

const at = ({ x, y }) => ({ left: `${x}%`, top: `${y}%` })
</script>

<template>
  <div class="trail-map" :class="`trail-map--${view}`">
    <div class="trail-map__picture" aria-hidden="true">
      <svg class="trail-map__art" :viewBox="plan.box" preserveAspectRatio="xMidYMid slice">
        <g :transform="plan.turn">
          <path class="trail-map__green" :d="PLAN.green" />
          <path class="trail-map__road trail-map__road--minor" :d="PLAN.minor" />
          <path class="trail-map__road trail-map__road--major" :d="PLAN.major" />
          <path class="trail-map__road trail-map__road--path" :d="PLAN.paths" />
          <path class="trail-map__block" :d="PLAN.blocks" />
          <path class="trail-map__campus" :d="PLAN.campus" />
          <path class="trail-map__water" :d="PLAN.water" />
        </g>
      </svg>
      <span
        v-for="label in plan.labels"
        :key="label.text"
        class="trail-map__name"
        :class="{ 'trail-map__name--road': label.road }"
        :style="{ ...at(label), rotate: `${label.turn || 0}deg` }"
        >{{ label.text }}</span
      >
    </div>

    <svg
      class="trail-map__trail"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path :d="plan.trail" />
    </svg>

    <RouterLink
      v-for="stop in stops"
      :key="stop.to"
      :to="stop.to"
      class="trail-map__stop"
      :class="{ 'trail-map__stop--above': stop.spot.side === 'above' }"
      :style="at(stop.spot)"
      :aria-label="`Back to ${stop.label}`"
      data-testid="trail-stop"
    >
      <span class="trail-map__dot" aria-hidden="true"></span>
      <span class="trail-map__plate" aria-hidden="true">
        <span v-if="stop.isLast" class="trail-map__note">Last stop</span>
        <span class="trail-map__word">
          <span
            v-for="(letter, index) in stop.letters"
            :key="index"
            class="trail-map__letter"
            :style="{ '--i': index }"
          >
            <span class="trail-map__roll" :data-letter="letter">{{ letter }}</span>
          </span>
        </span>
      </span>
    </RouterLink>

    <div
      class="trail-map__end"
      :class="`trail-map__end--${plan.end.side}`"
      :style="at(plan.end)"
      data-testid="trail-end"
    >
      <span class="trail-map__ring" aria-hidden="true"></span>
      <span class="trail-map__plate">
        <span class="trail-map__note">{{ end.title }}</span>
        <span v-if="end.detail" class="trail-map__address">{{ end.detail }}</span>
      </span>
    </div>

    <span class="trail-map__lion"><MascotArt :size="230" /></span>

    <!-- The phone's map is turned, so it says which way is north -->
    <svg
      v-if="plan.turn"
      class="trail-map__north"
      viewBox="0 0 24 34"
      role="img"
      aria-label="North is towards the top right"
    >
      <path d="M12 1l6 18-6-4-6 4z" />
      <text x="12" y="33" text-anchor="middle">N</text>
    </svg>

    <p class="trail-map__credit">
      &copy;
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener"
        >OpenStreetMap</a
      >
      contributors
    </p>
  </div>
</template>

<style scoped>
/* The map is the page's background: pinned to the bottom right of the whole
   page (views/NotFoundView.vue), so it runs on behind the header and footer.
   It stays one shape at every size, as everything on it is a percentage. */
.trail-map {
  --fade-top: linear-gradient(to bottom, transparent, black var(--ds-space-8));
  --fade-left: linear-gradient(black, black);
  --fade-bottom: linear-gradient(black, black);
  position: absolute;
  right: 0;
  bottom: 0;
  display: none;
  max-width: none;
  aspect-ratio: 16 / 9;
}

/* From a big phone up to a small laptop the map sits under the words, keeping
   campus (its right side) in view and letting the park run off the left */
@media (min-width: 640px) {
  .trail-map--wide {
    display: block;
    width: max(100vw, 60rem);
  }
}

/* On a big screen it covers the window, with the words over the park. The
   limit keeps the lion sharp on a very large screen; the map fades out there */
@media (min-width: 1200px) {
  .trail-map--wide {
    --fade-top: linear-gradient(to bottom, transparent, black var(--ds-space-9));
    --fade-left: linear-gradient(to right, transparent, black 12%);
    width: min(max(100vw, 100vh * 16 / 9), 120rem);
  }
}

/* The phone's map stands taller, so the footer has room on top of it. It dims
   there so the footer can be read. */
@media (max-width: 639.98px) {
  .trail-map--tall {
    --fade-bottom: linear-gradient(to bottom, black 78%, rgb(0 0 0 / 40%));
    display: block;
    width: 100vw;
    aspect-ratio: 375 / 602;
  }
}

.trail-map__picture,
.trail-map__art,
.trail-map__trail {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.trail-map__picture {
  overflow: hidden;
  mask-image: var(--fade-top), var(--fade-left), var(--fade-bottom);
  mask-composite: intersect;
}

.trail-map__green {
  fill: color-mix(in srgb, var(--ds-success) 30%, var(--ds-band));
}

.trail-map__water {
  fill: color-mix(in srgb, var(--ds-on-band) 22%, var(--ds-band));
}

.trail-map__block {
  fill: color-mix(in srgb, var(--ds-on-band) 9%, var(--ds-band));
}

.trail-map__campus {
  fill: color-mix(in srgb, var(--ds-on-band) 30%, var(--ds-band));
}

.trail-map__road {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.trail-map__road--major {
  stroke: color-mix(in srgb, var(--ds-on-band) 17%, var(--ds-band));
  stroke-width: var(--ds-space-2);
}

.trail-map__road--minor {
  stroke: color-mix(in srgb, var(--ds-on-band) 12%, var(--ds-band));
  stroke-width: calc(var(--ds-space-1) * 0.75);
}

.trail-map__road--path {
  stroke: color-mix(in srgb, var(--ds-on-band) 16%, var(--ds-band));
  stroke-width: 1px;
}

.trail-map__name {
  position: absolute;
  translate: -50% -50%;
  color: var(--ds-on-band);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-medium);
  line-height: 1;
  white-space: nowrap;
}

.trail-map__name--road {
  color: var(--ds-on-band-muted);
  font-weight: var(--ds-weight-regular);
}

/* White, not gold: gold means a match, and this is the opposite of one */
.trail-map__trail {
  overflow: visible;
  pointer-events: none;
}

.trail-map__trail path {
  fill: none;
  stroke: var(--ds-on-band);
  stroke-width: var(--ds-space-1);
  stroke-linecap: round;
  stroke-dasharray: 0 var(--ds-space-3);
  vector-effect: non-scaling-stroke;
}

/* A name on a plate of the band's colour, as a printed map would, so it reads
   over buildings and roads alike */
.trail-map__plate {
  display: flex;
  flex-direction: column;
  padding: var(--ds-space-1) var(--ds-space-2);
  border-radius: var(--ds-radius-control);
  background: var(--ds-band);
  color: var(--ds-on-band);
  line-height: var(--ds-leading-small);
}

.trail-map__note {
  color: var(--ds-on-band-muted);
  font-size: var(--ds-size-caption);
  line-height: var(--ds-leading-caption);
}

.trail-map__address {
  max-width: 11rem;
  overflow: hidden;
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-bold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The dot sits exactly on the trail, with the name beside it */
.trail-map__stop {
  --dot: 1.125rem;
  position: absolute;
  display: flex;
  align-items: center;
  gap: var(--ds-space-1);
  min-height: var(--ds-control-h);
  translate: calc(var(--dot) / -2) -50%;
  color: var(--ds-on-band);
  text-decoration: none;
}

.trail-map__stop:hover {
  color: var(--ds-on-band);
}

/* The name above the dot, for a trail running across the screen. The dot stays
   on the trail: the link is lifted by its own height, less half a dot. */
.trail-map__stop--above {
  flex-direction: column-reverse;
  translate: -50% calc(var(--dot) / 2 - 100%);
}

.trail-map__dot {
  flex: none;
  width: var(--dot);
  height: var(--dot);
  border: 3px solid var(--ds-on-band);
  border-radius: var(--ds-radius-round);
  background: var(--ds-band);
  transition: background-color var(--ds-dur-fast) var(--ds-ease-out);
}

.trail-map__stop:hover .trail-map__dot,
.trail-map__stop:focus-visible .trail-map__dot {
  background: var(--ds-on-band);
}

.trail-map__word {
  display: inline-flex;
  font-size: var(--ds-size-body);
  font-weight: var(--ds-weight-bold);
}

/* Each letter is a small window. A second copy of the letter waits below it
   (::after), and hovering rolls the pair up, one letter after the next, over
   and over. The end of a roll looks the same as the start, so it loops
   without a jump. */
.trail-map__letter {
  display: block;
  overflow: hidden;
}

.trail-map__roll {
  position: relative;
  display: block;
}

.trail-map__roll::after {
  position: absolute;
  top: 100%;
  left: 0;
  content: attr(data-letter);
}

@keyframes trail-letter-roll {
  from {
    transform: translateY(0);
  }

  40%,
  to {
    transform: translateY(-100%);
  }
}

@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .trail-map__stop:hover .trail-map__roll {
    animation: trail-letter-roll calc(var(--ds-loop) * 1.5) var(--ds-ease-out) infinite;
    animation-delay: calc(var(--i) * var(--ds-stagger));
  }
}

@media (prefers-reduced-motion: no-preference) {
  .trail-map__stop:focus-visible .trail-map__roll {
    animation: trail-letter-roll calc(var(--ds-loop) * 1.5) var(--ds-ease-out) infinite;
    animation-delay: calc(var(--i) * var(--ds-stagger));
  }
}

.trail-map__end {
  position: absolute;
  width: 0;
  height: 0;
}

.trail-map__ring {
  position: absolute;
  width: var(--ds-space-7);
  height: var(--ds-space-7);
  translate: -50% -50%;
  border: 2px dashed var(--ds-on-band);
  border-radius: var(--ds-radius-round);
}

.trail-map__end .trail-map__plate {
  position: absolute;
  white-space: nowrap;
}

.trail-map__end--below .trail-map__plate {
  top: calc(var(--ds-space-7) / 2 + var(--ds-space-1));
  left: 0;
  translate: -50% 0;
}

.trail-map__end--left .trail-map__plate {
  top: 0;
  right: calc(var(--ds-space-7) / 2 + var(--ds-space-1));
  translate: 0 -50%;
}

.trail-map__end--left .trail-map__address {
  max-width: 8rem;
}

/* The lion's picture is cut off at the chest, so it always rises from the
   bottom edge. Its magnifying glass points left, at the ring. */
.trail-map__lion {
  position: absolute;
  bottom: -1%;
  left: 78%;
  width: min(19.85%, 20rem);
}

.trail-map--tall .trail-map__lion {
  right: -2%;
  left: auto;
  width: 41%;
}

.trail-map__lion :deep(img) {
  width: 100%;
  height: auto;
}

.trail-map__north {
  position: absolute;
  top: var(--ds-space-3);
  right: var(--ds-space-3);
  width: var(--ds-space-5);
  height: var(--ds-space-6);
  rotate: 34deg;
  fill: var(--ds-on-band);
  font-size: var(--ds-space-3);
  font-weight: var(--ds-weight-bold);
}

/* At the top of the phone's map, where nothing else sits */
.trail-map__credit {
  position: absolute;
  top: var(--ds-space-3);
  left: var(--ds-gutter);
  color: var(--ds-on-band-muted);
  font-size: var(--ds-size-caption);
  line-height: var(--ds-leading-caption);
}

.trail-map__credit a {
  color: inherit;
}

/* The wide map hangs off the left of the window, so its left edge is worked
   out from there, to line up with the words */
.trail-map--wide .trail-map__credit {
  left: calc(100% - 100vw + max(var(--ds-gutter), (100vw - var(--ds-page-max)) / 2));
}

/* Just above the footer once the map fills the window */
@media (min-width: 1200px) {
  .trail-map--wide .trail-map__credit {
    top: auto;
    bottom: calc(var(--footer-height) + var(--ds-space-2));
  }
}
</style>
