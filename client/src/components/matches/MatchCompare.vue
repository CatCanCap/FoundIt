<script setup>
// Your lost report and the find side by side, under the find shown large on
// the finds page, with what matched marked in both: the shared words and
// brand underlined, the matching category and colours filled in. Picking a
// reason above (BestFind) lights up only its part, in both columns, and fades
// the rest back, so the reasons are shown rather than explained.
//   lost       your lost report (the item)
//   found      the find (match.item)
//   marks      [{ lead, detail, kind, terms }] from reasonMarks
//   active     the picked reason (one of marks), or null
//   spotsById  Map of campus spots
import { computed } from 'vue'
import { COLOUR_HEX } from '@/utils/design'
import { coloursOf, markText, trailStops } from '@/utils/matches'

const props = defineProps({
  lost: { type: Object, required: true },
  found: { type: Object, required: true },
  marks: { type: Array, required: true },
  active: { type: Object, default: null },
  spotsById: { type: Map, required: true },
})

const kinds = computed(() => new Set(props.marks.map((mark) => mark.kind)))
const activeKind = computed(() => props.active?.kind || null)
const activeTerms = computed(
  () => new Set((props.active?.terms || []).map((term) => term.toLowerCase())),
)

// Only the words marks: a place or a time lights up its whole line instead
const wordMarks = computed(() => props.marks.filter((mark) => mark.terms.length > 0))

// A trail longer than this shows its first stops and how many more
const STOPS_SHOWN = 3

function sideOf(item) {
  const stops = trailStops(item, props.spotsById)
  return {
    title: markText(item.title, wordMarks.value),
    description: markText(item.description, wordMarks.value),
    category: item.category || '',
    colours: coloursOf(item),
    brand: item.brand || '',
    stops: stops.slice(0, STOPS_SHOWN),
    moreStops: Math.max(0, stops.length - STOPS_SHOWN),
  }
}

const sides = computed(() => [
  { key: 'lost', label: 'Yours', ...sideOf(props.lost) },
  { key: 'found', label: 'Found', ...sideOf(props.found) },
])

// Lit: the picked reason is about this. Matched: some reason is, so it is
// marked softly while nothing is picked.
function lineState(kind) {
  return {
    'compare__cell--matched': kinds.value.has(kind),
    'compare__cell--lit': activeKind.value === kind,
  }
}

function pieceState(piece) {
  return {
    compare__hit: piece.kinds.length > 0,
    'compare__hit--lit': piece.kinds.includes(activeKind.value),
  }
}

function colourState(name) {
  const matched = wordMarks.value.some(
    (mark) =>
      mark.kind === 'colour' &&
      mark.terms.some((term) => term.toLowerCase() === name.toLowerCase()),
  )
  return {
    'compare__pill--matched': matched,
    'compare__pill--lit':
      activeKind.value === 'colour' && activeTerms.value.has(name.toLowerCase()),
  }
}

function brandState(brand) {
  const lower = brand.toLowerCase()
  const matched = wordMarks.value.some(
    (mark) =>
      ['brand', 'words'].includes(mark.kind) &&
      mark.terms.some((term) => term.toLowerCase() === lower),
  )
  return {
    'compare__pill--matched': matched,
    'compare__pill--lit': matched && activeTerms.value.has(lower),
  }
}

const categoryState = computed(() => ({
  'compare__pill--matched': kinds.value.has('category'),
  'compare__pill--lit': activeKind.value === 'category',
}))
</script>

<template>
  <section
    class="compare"
    :class="{ 'compare--focus': active }"
    aria-label="Your report and the find, side by side"
    data-testid="find-compare"
  >
    <div v-for="side in sides" :key="side.key" class="compare__side" :data-side="side.key">
      <p class="compare__label">{{ side.label }}</p>

      <p class="compare__title" data-testid="compare-title">
        <template v-for="(piece, index) in side.title" :key="index">
          <mark v-if="piece.kinds.length" :class="pieceState(piece)">{{ piece.text }}</mark>
          <template v-else>{{ piece.text }}</template>
        </template>
      </p>

      <ul class="compare__pills">
        <li v-if="side.category" class="compare__pill" :class="categoryState">
          {{ side.category }}
        </li>
        <li
          v-for="name in side.colours"
          :key="name"
          class="compare__pill"
          :class="colourState(name)"
        >
          <span
            class="compare__swatch"
            :style="{ background: COLOUR_HEX[name] || 'var(--fi-mist)' }"
            aria-hidden="true"
          ></span>
          {{ name }}
        </li>
        <li v-if="side.brand" class="compare__pill" :class="brandState(side.brand)">
          {{ side.brand }}
        </li>
      </ul>

      <p v-if="side.description.length" class="compare__description">
        <template v-for="(piece, index) in side.description" :key="index">
          <mark v-if="piece.kinds.length" :class="pieceState(piece)">{{ piece.text }}</mark>
          <template v-else>{{ piece.text }}</template>
        </template>
      </p>

      <ul class="compare__stops">
        <li v-for="(stop, index) in side.stops" :key="index" class="compare__stop">
          <span class="compare__cell" :class="lineState('place')" data-kind="place">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
            <span>
              {{ stop.place }}<template v-if="stop.area"> · {{ stop.area }}</template>
            </span>
          </span>
          <span
            v-if="stop.when"
            class="compare__cell compare__cell--time"
            :class="lineState('time')"
            data-kind="time"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3 2" />
            </svg>
            <span>{{ stop.when }}</span>
          </span>
        </li>
        <li v-if="side.moreStops" class="compare__more">+{{ side.moreStops }}</li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
/* Two columns on every screen, even a phone: comparing is the point */
.compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--fi-line);
  border-radius: var(--fi-radius);
  background: var(--fi-raised);
}

.compare__side {
  display: grid;
  gap: 0.6rem;
  align-content: start;
  min-width: 0;
  padding: 0.9rem 0.8rem 1rem;
}

.compare__side + .compare__side {
  border-left: 1px dashed var(--fi-line);
}

.compare__label {
  margin: 0;
  color: var(--fi-brass-strong);
  font-family: var(--fi-font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.compare__title {
  margin: 0;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.compare__description {
  margin: 0;
  color: var(--fi-mist);
  font-size: 0.9rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

/* The words that matched: a soft underline while nothing is picked, a gold
   wash when their reason is picked, and gone quiet when another one is */
mark {
  padding: 0;
  background: transparent;
  color: inherit;
}

.compare__hit {
  border-radius: 3px;
  box-shadow: inset 0 -0.18em 0 color-mix(in srgb, var(--fi-brass) 55%, transparent);
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease,
    color 0.15s ease;
}

.compare--focus .compare__hit {
  box-shadow: none;
}

.compare--focus .compare__hit--lit {
  background: color-mix(in srgb, var(--fi-brass) 32%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--fi-brass) 32%, transparent);
  color: var(--fi-ink);
}

.compare__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.compare__pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--fi-line);
  border-radius: var(--fi-radius-pill);
  color: var(--fi-mist);
  font-size: 0.8rem;
  font-weight: 600;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}

.compare__pill--matched {
  border-color: color-mix(in srgb, var(--fi-brass) 60%, transparent);
  color: var(--fi-ink);
}

.compare--focus .compare__pill:not(.compare__pill--lit) {
  opacity: 0.45;
}

.compare--focus .compare__pill--lit {
  border-color: var(--fi-brass);
  background: color-mix(in srgb, var(--fi-brass) 26%, transparent);
  color: var(--fi-ink);
}

.compare__swatch {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgb(20 26 63 / 25%);
}

.compare__stops {
  display: grid;
  gap: 0.45rem;
  margin: 0.15rem 0 0;
  padding: 0;
  list-style: none;
}

.compare__stop {
  display: grid;
  gap: 0.15rem;
}

.compare__cell {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  margin-inline: -0.35rem;
  padding: 0.2rem 0.35rem;
  border-radius: 6px;
  color: var(--fi-mist);
  font-size: 0.82rem;
  line-height: 1.35;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}

.compare__cell svg {
  flex-shrink: 0;
  width: 0.95rem;
  height: 0.95rem;
  margin-top: 0.05rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.compare__cell--matched {
  color: var(--fi-ink);
}

.compare--focus .compare__cell:not(.compare__cell--lit) {
  opacity: 0.45;
}

.compare--focus .compare__cell--lit {
  background: color-mix(in srgb, var(--fi-brass) 26%, transparent);
  color: var(--fi-ink);
}

.compare__more {
  color: var(--fi-mist);
  font-family: var(--fi-font-mono);
  font-size: 0.8rem;
}

@media (min-width: 576px) {
  .compare__side {
    padding: 1.1rem 1.25rem 1.25rem;
  }

  .compare__title {
    font-size: 1.05rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .compare__hit,
  .compare__pill,
  .compare__cell {
    transition: none;
  }
}
</style>
