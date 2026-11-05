<script setup>
// One row under "Other finds" on the finds page (Figma V09): its place in the
// list, a small picture, the title, where and when it turned up with a short
// reason line, and the score. "View" shows it large at the top of this page, so
// it has no arrow (arrows are for links to another page).
//   match      a match from GET /api/matches/mine, with its found item as .item
//   rank       its place in the list
//   spotsById  Map of campus spots
//   tone       the colour to draw it in when it has no photo (see itemTone)
// Emits view with the match.
import { computed } from 'vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import { whenParts } from '@/utils/feed'
import { shortReasons, whereFound } from '@/utils/matches'

const props = defineProps({
  match: { type: Object, required: true },
  rank: { type: Number, required: true },
  spotsById: { type: Map, required: true },
  tone: { type: String, default: 'currentColor' },
})

const emit = defineEmits(['view'])

const where = computed(() => whereFound(props.match.item, props.spotsById))
// The rest of "LKS Library, today 16:40. Same category, similar colour.",
// after the bold building. "today" and "yesterday" are lower case mid-sentence.
const lineRest = computed(() => {
  const { day, time } = props.match.item.trail?.length
    ? whenParts(props.match.item)
    : { day: '', time: '' }
  const dayWords = ['Today', 'Yesterday'].includes(day) ? day.toLowerCase() : day
  const when = dayWords ? `, ${dayWords}${time ? ` ${time}` : ''}` : ''
  const why = shortReasons(props.match, 2)
  return `${when}.${why ? ` ${why}` : ''}`
})
</script>

<template>
  <!-- position-relative + stretched-link: the whole row answers a tap on "View" -->
  <li class="other position-relative" data-testid="find-row">
    <span class="other__rank fi-mono">{{ String(rank).padStart(2, '0') }}</span>

    <span class="other__picture" :style="{ '--tone': tone }">
      <img
        v-if="match.item.photoUrl"
        :src="match.item.photoUrl"
        :alt="match.item.title"
        loading="lazy"
      />
      <ItemIcon v-else :category="match.item.category" :size="28" :tone="tone" />
    </span>

    <span class="other__text">
      <span class="other__title">{{ match.item.title }}</span>
      <span class="other__line">
        <strong>{{ where.building }}</strong
        >{{ lineRest }}
      </span>
    </span>

    <span class="other__score" data-testid="find-row-score">{{ Math.round(match.score) }}%</span>

    <button
      type="button"
      class="other__view stretched-link"
      data-testid="find-view"
      @click="emit('view', match)"
    >
      View <span class="fi-visually-hidden">{{ match.item.title }}</span>
    </button>
  </li>
</template>

<style scoped>
/* Phones: the picture on the left, the rank and score on the top line, the
   name and its line under them across the width, and "View" at the end */
.other {
  display: grid;
  grid-template-columns: 3.5rem 1fr auto;
  grid-template-areas:
    'picture rank score'
    'picture text text'
    'picture . view';
  align-items: start;
  gap: 0.2rem 0.85rem;
  padding: 1rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--fi-ink) 30%, var(--fi-line));
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.15s ease;
}

.other:active {
  background: color-mix(in srgb, var(--fi-ink) 5%, transparent);
}

.other__rank {
  grid-area: rank;
  align-self: center;
  color: var(--fi-mist);
  font-size: 0.75rem;
}

.other__picture {
  grid-area: picture;
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  overflow: hidden;
  border-radius: 4px;
  /* With no photo, a pale wash of the find's own colour behind its drawing */
  background: color-mix(in srgb, var(--tone, var(--fi-mist)) 14%, var(--fi-raised));
  color: var(--fi-mist);
}

/* A faint outline, so a white or beige drawing still shows on the pale tile */
.other__picture :deep(svg) {
  filter: drop-shadow(0 0 0.6px rgb(20 26 63 / 55%));
}

.other__picture img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.other__text {
  grid-area: text;
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}

.other__title {
  font-size: 1.1rem;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}

.other__line {
  color: var(--fi-mist);
  font-size: 0.85rem;
}

.other__line strong {
  color: var(--fi-ink);
  font-weight: 700;
}

.other__score {
  grid-area: score;
  justify-self: end;
  align-self: center;
  color: var(--fi-ink);
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.other__view {
  grid-area: view;
  justify-self: end;
  align-self: end;
  padding: 0.25rem 0;
  border: 0;
  background: none;
  color: var(--fi-ink);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.other__view:focus-visible {
  outline: 3px solid var(--fi-focus);
  outline-offset: 2px;
}

/* md (768px) and up: everything on one line, as in the design */
@media (min-width: 768px) {
  .other {
    grid-template-columns: 2.5rem auto 1fr 5rem auto;
    grid-template-areas: 'rank picture text score view';
    align-items: center;
    gap: 1.25rem;
  }

  .other__view {
    align-self: center;
  }

  .other__picture {
    width: 5.5rem;
    height: 4.125rem;
  }

  .other__score {
    justify-self: end;
    font-size: 1.6rem;
  }

  .other__view {
    padding-left: 2rem;
  }
}
</style>
