<script setup>
// The find shown large at the top of the finds page (Figma "06 · Matches
// directions", B: calmer hierarchy): its photo on the left; on the right its
// name with the score as a ring that fills up (ScoreRing), where and when it
// turned up, every reason it matched as a chip, and "This is mine" and "Not
// mine" while it waits for an answer; once claimed, where the handoff is at.
// Under it, your report and the find side by side (MatchCompare): hovering,
// focusing or tapping a chip lights up what that reason matched in both.
// If someone else claimed it first (the page had not caught up yet), it
// says so and links to the item record, where the owner can dispute it. The
// best match shows here first; "View" on another find puts that one here
// instead.
//   match      a match from GET /api/matches/mine, with its found item as .item
//   lost       your lost report it was matched to
//   rank       its place in the list (1 is the best match)
//   spotsById  Map of campus spots
//   tone       the colour to draw it in when it has no photo (see itemTone)
//   claimTo    where "This is mine" goes (see claimLink in utils/matches.js)
//   busy       true while "Not mine" is being saved
// Emits notMine when the owner says the find is not theirs (the page hides it
// at once and offers Undo).
import { computed, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import MatchCompare from '@/components/matches/MatchCompare.vue'
import ScoreRing from '@/components/matches/ScoreRing.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import { whenParts } from '@/utils/feed'
import { foundWhereWhen, reasonMarks, takenFind, whereFound } from '@/utils/matches'

const props = defineProps({
  match: { type: Object, required: true },
  lost: { type: Object, required: true },
  rank: { type: Number, required: true },
  spotsById: { type: Map, required: true },
  tone: { type: String, default: 'currentColor' },
  claimTo: { type: String, required: true },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['notMine'])

const where = computed(() => whereFound(props.match.item, props.spotsById))
// The rest of "Found at SCIS 1, seminar rooms, today at 14:05.", after the
// bold building
const whereRest = computed(() =>
  foundWhereWhen(
    where.value.area,
    props.match.item.trail?.length ? whenParts(props.match.item) : null,
  ),
)
const hasPhoto = computed(() => Boolean(props.match.item.photoUrl))
const reasons = computed(() => reasonMarks(props.match, props.lost))
const isWaiting = computed(() => props.match.status === 'suggested')
// Claimed by someone else since the page loaded: no "This is mine", but a
// way to the item record to dispute it
const taken = computed(() => takenFind(props.match))

// The reason lit up in the side-by-side: the one under the pointer, else the
// one tapped (tap it again to let go)
const hovered = ref(null)
const pinned = ref(null)
const active = computed(() => reasons.value[hovered.value ?? pinned.value] || null)

function pin(index) {
  pinned.value = pinned.value === index ? null : index
}
</script>

<template>
  <article class="best" :class="{ 'best--taken': taken }" data-testid="find-card">
    <!-- Just which it is: the best match, or one of the others -->
    <p class="best__rank" data-testid="find-rank">
      {{ rank === 1 ? 'Best match' : 'Possible match' }}
    </p>

    <!-- Bootstrap grid: the picture over the words on a phone, beside them from
         md (768px), in 5 of 12 columns. With no photo, the same tile holds the
         drawing on a pale wash of the find's own colour, with a note -->
    <div class="best__body row g-4 gx-md-5">
      <div class="col-12 col-md-5">
        <div v-if="hasPhoto" class="best__picture">
          <img :src="match.item.photoUrl" :alt="match.item.title" loading="lazy" />
        </div>
        <figure
          v-else
          class="best__picture best__picture--icon"
          :style="{ '--tone': tone }"
          data-testid="find-drawing"
        >
          <ItemIcon :category="match.item.category" :size="72" :tone="tone" />
          <figcaption class="best__drawing-note">No photo added</figcaption>
        </figure>
      </div>

      <div class="best__text col-12 col-md-7">
        <div class="best__top">
          <h2 class="best__title">{{ match.item.title }}</h2>
          <ScoreRing :score="match.score" class="best__ring" />
        </div>
        <!-- The server leaves out where and when it was found unless your
             report already named that building around that time -->
        <p v-if="match.item.placeHidden" class="best__where" data-testid="find-place-hidden">
          Where and when it was found stay private: your report doesn’t name that building around
          that time.
        </p>
        <p v-else class="best__where">
          Found at <strong>{{ where.building }}</strong
          >{{ whereRest }}
        </p>
        <ul v-if="reasons.length" class="best__reasons" data-testid="find-reasons">
          <li
            v-for="(reason, index) in reasons"
            :key="reason.lead + reason.detail"
            :style="{ '--i': index }"
          >
            <button
              type="button"
              class="best__reason"
              :class="{ 'best__reason--on': active === reason }"
              :aria-pressed="pinned === index"
              data-testid="find-reason"
              @mouseenter="hovered = index"
              @mouseleave="hovered = null"
              @focus="hovered = index"
              @blur="hovered = null"
              @click="pin(index)"
            >
              <svg class="best__tick" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" />
              </svg>
              {{ reason.lead }}
            </button>
          </li>
        </ul>

        <!-- Phones: "This is mine" across the width, "Not mine" under it -->
        <div class="best__actions d-grid d-sm-flex flex-sm-wrap align-items-sm-center">
          <template v-if="taken">
            <div class="best__taken" data-testid="find-taken">
              <StatusPill :state="taken.state">{{ taken.label }}</StatusPill>
              <p class="best__taken-note">{{ taken.note }}</p>
            </div>
            <BaseButton
              v-if="taken.recordLink"
              :to="taken.recordLink"
              variant="night"
              size="sm"
              data-testid="find-taken-record"
            >
              See the item <span aria-hidden="true">→</span>
            </BaseButton>
          </template>
          <template v-else-if="isWaiting">
            <BaseButton :to="claimTo" data-testid="this-is-mine">This is mine</BaseButton>
            <BaseButton
              variant="link"
              size="sm"
              :disabled="busy"
              data-testid="not-mine"
              @click="emit('notMine', match)"
            >
              Not mine
            </BaseButton>
          </template>
          <template v-else>
            <StatusPill :state="match.status" />
            <BaseButton :to="claimTo" variant="night" size="sm">See where it’s at</BaseButton>
          </template>
        </div>
      </div>
    </div>

    <MatchCompare
      v-if="reasons.length"
      class="best__compare"
      :lost="lost"
      :found="match.item"
      :marks="reasons"
      :active="active"
      :spots-by-id="spotsById"
    />
  </article>
</template>

<style scoped>
.best {
  display: grid;
  gap: 1rem;
}

.best__compare {
  margin-top: 0.5rem;
}

.best__rank {
  margin: 0;
  color: var(--fi-brass-strong);
  font-size: 0.95rem;
  font-weight: 700;
}

.best__picture {
  display: grid;
  place-items: center;
  align-self: start;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 4px;
  background: color-mix(in srgb, var(--fi-ink) 6%, var(--fi-raised));
  color: var(--fi-mist);
}

/* No photo, only the drawing: a pale wash of the find's own colour behind
   it, and a shorter tile on a phone, so the name and score are on the first
   screen */
.best__picture--icon {
  position: relative;
  margin: 0;
  aspect-ratio: 2 / 1;
  background: color-mix(in srgb, var(--tone, var(--fi-mist)) 14%, var(--fi-raised));
}

/* A faint outline, so a white or beige drawing still shows on the pale tile */
.best__picture :deep(svg) {
  filter: drop-shadow(0 0 0.8px rgb(20 26 63 / 55%));
}

/* "No photo added", tucked into the tile's bottom corner */
.best__drawing-note {
  position: absolute;
  right: 0.6rem;
  bottom: 0.45rem;
  color: var(--fi-mist);
  font-size: 0.75rem;
}

.best__picture img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.best__text {
  display: grid;
  gap: 0.9rem;
  align-content: start;
  min-width: 0;
}

/* The name and its score share one line, so the % is read with the item */
.best__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.best__title {
  margin: 0;
  font-size: clamp(1.5rem, 5vw, 2rem);
  font-weight: 700;
  line-height: 1.18;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}

/* Faded with the picture when someone else claimed it */
.best--taken .best__ring {
  opacity: 0.55;
  filter: grayscale(1);
}

.best__where {
  margin: 0;
  color: var(--fi-mist);
  font-size: 0.95rem;
}

.best__where strong {
  color: var(--fi-ink);
  font-weight: 700;
}

/* Every reason as a chip with a tick. They pop in one after another once
   the score has started filling; pointing at one (or tapping it) lights up
   what it matched in the side-by-side below */
.best__reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0.15rem 0 0;
  padding: 0;
  list-style: none;
}

.best__reasons li {
  animation: best-chip-in 0.32s cubic-bezier(0.3, 1.3, 0.5, 1) both;
  animation-delay: calc(0.3s + var(--i, 0) * 0.08s);
}

@keyframes best-chip-in {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.92);
  }
}

.best__reason {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.25rem;
  padding: 0.3rem 0.8rem 0.3rem 0.55rem;
  border: 1px solid var(--fi-line);
  border-radius: var(--fi-radius-pill);
  background: var(--fi-raised);
  color: var(--fi-ink);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease;
}

.best__reason:hover,
.best__reason--on {
  border-color: var(--fi-brass);
  background: color-mix(in srgb, var(--fi-brass) 18%, var(--fi-raised));
}

.best__reason:active {
  transform: scale(0.97);
}

.best__reason[aria-pressed='true'] {
  border-color: var(--fi-brass-strong);
  box-shadow: inset 0 0 0 1px var(--fi-brass-strong);
}

.best__reason:focus-visible {
  outline: 3px solid var(--fi-focus);
  outline-offset: 2px;
}

/* The tick draws itself as its chip pops in */
.best__tick {
  width: 1rem;
  height: 1rem;
  padding: 0.12rem;
  border-radius: 50%;
  background: var(--fi-success-soft);
  fill: none;
  stroke: var(--fi-success);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 16;
  animation: best-tick 0.3s ease-out both;
  animation-delay: calc(0.45s + var(--i, 0) * 0.08s);
}

@keyframes best-tick {
  from {
    stroke-dashoffset: 16;
  }
  to {
    stroke-dashoffset: 0;
  }
}

.best__actions {
  gap: 0.5rem 1.25rem;
  margin-top: 0.4rem;
}

/* On a phone "Not mine" is a centred line under the big button, still a
   thumb-sized target */
.best__actions :deep(.fi-button--link) {
  justify-self: center;
  min-height: 2.75rem;
}

/* Claimed by someone else: the status pill and a line, where the buttons
   were, then "See the item" the way a claimed find shows "See where it's at".
   The pill takes a whole row so the button wraps under the line */
.best__taken {
  display: grid;
  gap: 0.2rem;
  flex-basis: 100%;
}

.best__taken-note {
  margin: 0;
  color: var(--fi-mist);
  font-size: 0.9rem;
}

/* Out of reach: the picture and score fade back, like a declined claim */
.best--taken .best__picture {
  filter: grayscale(0.6);
  opacity: 0.75;
}

@media (prefers-reduced-motion: reduce) {
  .best__reasons li,
  .best__tick {
    animation: none;
  }

  .best__reason {
    transition: none;
  }
}

/* md (768px) and up: the picture keeps the photo's 4:3 shape beside the words */
@media (min-width: 768px) {
  .best__picture--icon {
    aspect-ratio: 4 / 3;
  }
}
</style>
