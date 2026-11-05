<script setup>
// The newest finds someone could still claim, on the landing page: up to
// five tags in a row, hanging
// from a rail, that each open the find's page (FindTag). On a phone the row
// scrolls sideways. It uses the same public lists as the feed
// (GET /api/items?view=feed&type=found and GET /api/spots). While loading it
// shows grey tags the size of the real ones, so nothing jumps; when the
// server can't be reached it says so, with Try again. Each drawing is in the
// item's main colour, on a mid-tone tile so white and black items both show.
// Where and when a find was handed in are private (the
// "Private places" rule, server/lib/item-privacy.js), so a visitor mostly sees just the name, with no place or time.
// The lion standing on the card (from 768px up) bobs gently and blinks now
// and then. Point at a tag and it walks along the top of the card to stand
// over it, watching through its magnifying glass; move away and it walks
// back to its spot over the last tag. It keeps still with less motion asked
// for.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import api from '@/api'
import MascotArt from '@/components/ui/MascotArt.vue'
import FindTag from './FindTag.vue'
import { buildItemParams } from '@/utils/feed'
import { handedInAgo, newestOpen, placeLine } from '@/utils/landing'

const SHOWN = 5
// The lion blinks every few seconds, at an uneven pace so it looks alive
const BLINK_MS = 180
const BLINK_GAP_MS = [2600, 5200]

const state = ref('loading') // 'loading', 'ready' or 'error'
const items = ref([])
const spotsById = ref(new Map())
const now = ref(new Date())

const newest = computed(() => newestOpen(items.value, SHOWN))

async function load() {
  state.value = 'loading'
  try {
    const [found, spots] = await Promise.all([
      api.get('/items', { params: buildItemParams('found') }),
      api.get('/spots'),
    ])
    spotsById.value = new Map(spots.data.map((spot) => [spot.id, spot]))
    items.value = found.data
    now.value = new Date()
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}

function place(item) {
  if (item.placeHidden) return ''
  return placeLine(spotsById.value.get(item.trail[0].spotId))
}

function when(item) {
  return item.placeHidden ? '' : handedInAgo(item.createdAt, now.value)
}

// ---- The lion ----------------------------------------------------------------

const card = ref(null)
const lion = ref(null)
const watching = ref(false)
// Where the lion stands, in pixels from the card's left edge; null until the
// tags are in, when the styles keep it at the right
const lionX = ref(null)
let moves = false
let restTimer = null

// The left edge that puts the lion's middle over a tag's middle
function xOver(slot) {
  const cardBox = card.value.getBoundingClientRect()
  const slotBox = slot.getBoundingClientRect()
  const lionWidth = lion.value?.offsetWidth || 0
  return slotBox.left - cardBox.left + (slotBox.width - lionWidth) / 2
}

function slots() {
  return card.value ? [...card.value.querySelectorAll('.finds__slot')] : []
}

// Back to its spot over the last tag
function rest() {
  const last = slots().at(-1)
  watching.value = false
  if (last) lionX.value = xOver(last)
}

function walkTo(event) {
  if (!moves) return
  clearTimeout(restTimer)
  watching.value = true
  lionX.value = xOver(event.currentTarget)
}

// A short wait before walking back, so moving from tag to tag doesn't send
// the lion home in between
function walkBack() {
  if (!moves) return
  clearTimeout(restTimer)
  restTimer = setTimeout(rest, 400)
}

watch(state, async (now) => {
  if (now !== 'ready') return
  await nextTick()
  rest()
})

const eyes = ref('open')
let blinkTimer = null

function scheduleBlink() {
  const [shortest, longest] = BLINK_GAP_MS
  blinkTimer = setTimeout(
    () => {
      eyes.value = 'closed'
      blinkTimer = setTimeout(() => {
        eyes.value = 'open'
        scheduleBlink()
      }, BLINK_MS)
    },
    shortest + Math.random() * (longest - shortest),
  )
}

onMounted(() => {
  load()
  moves = Boolean(window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches)
  if (moves) scheduleBlink()
  window.addEventListener('resize', rest)
})
onBeforeUnmount(() => {
  clearTimeout(blinkTimer)
  clearTimeout(restTimer)
  window.removeEventListener('resize', rest)
})
</script>

<template>
  <section ref="card" class="finds" aria-labelledby="finds-title" data-testid="newest-finds">
    <!-- The lion looks over the top of the row, from 768px up -->
    <span
      ref="lion"
      class="finds__lion d-none d-md-block"
      :class="{ 'is-watching': watching }"
      :style="lionX === null ? null : { '--lion-x': `${lionX}px` }"
    >
      <MascotArt v-if="watching" variant="watching" :size="96" />
      <MascotArt v-else class="finds__lion-art" :size="104" :eyes="eyes" />
    </span>

    <header class="finds__head">
      <div class="finds__heading">
        <h2 id="finds-title" class="ds-title">Just handed in</h2>
      </div>
      <RouterLink
        to="/feed"
        class="ds-btn ds-btn--primary finds__all"
        data-testid="newest-finds-all"
      >
        See all finds
        <svg class="ds-btn__arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 8h9.5M8.5 4 12.5 8l-4 4" />
        </svg>
      </RouterLink>
    </header>

    <template v-if="state === 'loading'">
      <p class="visually-hidden" role="status">Loading the newest finds</p>
      <ul class="finds__row" aria-hidden="true">
        <li v-for="n in SHOWN" :key="n" class="finds__slot">
          <span class="ds-skeleton finds__ghost"></span>
        </li>
      </ul>
    </template>

    <ul v-else-if="state === 'ready' && newest.length" class="finds__row">
      <li
        v-for="(item, index) in newest"
        :key="item.id"
        class="finds__slot ds-enter"
        :style="{ '--i': index }"
        @pointerenter="walkTo"
        @pointerleave="walkBack"
        @focusin="walkTo"
        @focusout="walkBack"
      >
        <FindTag :item="item" :place="place(item)" :when="when(item)" />
      </li>
    </ul>

    <div v-else-if="state === 'ready'" class="finds__note" data-testid="newest-finds-empty">
      <p>Nothing is waiting to be claimed right now.</p>
      <RouterLink to="/report/found" class="ds-link ds-link--standalone"
        >Found something? Report it</RouterLink
      >
    </div>

    <div v-else class="finds__note" role="alert" data-testid="newest-finds-error">
      <p>Couldn’t load the newest finds.</p>
      <button
        type="button"
        class="ds-btn ds-btn--secondary"
        data-testid="newest-finds-retry"
        @click="load"
      >
        Try again
      </button>
    </div>
  </section>
</template>

<style scoped>
.finds {
  position: relative;
  display: grid;
  gap: var(--ds-space-4);
  padding: var(--ds-space-5);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

/* Standing on the top edge, as if looking over it: over the last tag at
   rest (under the match card), or over the tag being looked at. It walks
   there along the edge. */
.finds__lion {
  position: absolute;
  left: var(--lion-x, auto);
  right: var(--ds-space-7);
  bottom: 100%;
  line-height: 0;
  transition: left calc(var(--ds-dur-max) * 2) var(--ds-ease-out);
}

.finds__lion[style] {
  right: auto;
}

/* Arriving to watch: a small hop */
.finds__lion.is-watching {
  animation: lion-hop var(--ds-dur-slow) var(--ds-ease-press);
}

@keyframes lion-hop {
  50% {
    translate: 0 calc(-1 * var(--ds-space-2));
  }
}

/* A slow bob, like breathing */
.finds__lion-art {
  animation: lion-bob calc(var(--ds-loop) * 4) var(--ds-ease-out) infinite alternate;
}

@keyframes lion-bob {
  to {
    translate: 0 calc(-1 * var(--ds-space-1));
  }
}

.finds__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ds-space-2) var(--ds-space-4);
}

.finds__heading {
  display: grid;
  gap: var(--ds-space-1);
}

.ds-btn__arrow {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* The tags hang from a rail along the top of the row. On a phone the row
   scrolls sideways with about two tags in view; from 768px all five fit. */
.finds__row {
  display: grid;
  grid-auto-columns: 42%;
  grid-auto-flow: column;
  gap: var(--ds-space-4);
  margin-inline: calc(-1 * var(--ds-space-5));
  padding: 0 var(--ds-space-5) var(--ds-space-2);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: var(--ds-space-5);
  scrollbar-width: none;
  /* The rail is the row's background, which stays put while the tags scroll,
     so it always runs the full width of the card */
  background: linear-gradient(var(--ds-border-control), var(--ds-border-control)) top / 100% 2px
    no-repeat;
}

.finds__slot {
  scroll-snap-align: start;
}

.finds__ghost {
  display: block;
  height: 13rem;
  margin-top: var(--ds-space-5);
  border-radius: var(--ds-radius-surface);
}

.finds__note {
  display: grid;
  justify-items: start;
  gap: var(--ds-space-3);
  padding-block: var(--ds-space-4);
}

@media (min-width: 768px) {
  .finds__row {
    grid-auto-columns: auto;
    grid-auto-flow: row;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    margin-inline: 0;
    padding-inline: 0;
    overflow: visible;
  }
}

@media (max-width: 479.98px) {
  .finds {
    padding: var(--ds-space-4);
  }

  .finds__row {
    margin-inline: calc(-1 * var(--ds-space-4));
    padding-inline: var(--ds-space-4);
    scroll-padding-inline: var(--ds-space-4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .finds__lion,
  .finds__lion-art {
    animation: none;
    transition: none;
  }
}
</style>
