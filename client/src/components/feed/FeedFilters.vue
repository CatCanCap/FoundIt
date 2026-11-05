<template>
  <div class="feed-filters">
    <div class="feed-search">
      <svg class="feed-search__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M16 16l4.5 4.5" />
      </svg>
      <label for="feed-search" class="visually-hidden">Search</label>
      <input
        id="feed-search"
        class="feed-search__input"
        :value="modelValue"
        type="search"
        maxlength="100"
        placeholder="Item, building or number"
        data-testid="feed-search"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <button
        v-if="modelValue"
        type="button"
        class="feed-search__clear"
        aria-label="Clear the search"
        data-testid="feed-search-clear"
        @click="$emit('update:modelValue', '')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
      </button>
    </div>

    <div class="feed-cats">
      <h2 id="feed-cats-title" class="feed-cats__heading">Category</h2>
      <div
        ref="chipsEl"
        class="feed-chips"
        :class="{ 'has-more-left': chipsMore.left, 'has-more-right': chipsMore.right }"
        role="group"
        aria-labelledby="feed-cats-title"
        @scroll.passive="checkChipsEdges"
      >
        <button
          type="button"
          class="feed-chip"
          :aria-pressed="!family"
          data-testid="feed-family-all"
          @click="$emit('family', '')"
        >
          <span class="feed-chip__mark" aria-hidden="true"></span>
          <span class="feed-chip__label">All</span>
          <span v-if="counts" class="feed-chip__count">{{ counts[''] }}</span>
        </button>
        <button
          v-for="chip in FAMILIES"
          :key="chip"
          type="button"
          class="feed-chip"
          :aria-pressed="family === chip"
          :title="FAMILY_HINTS[chip]"
          :aria-label="chipLabel(chip)"
          :data-testid="`feed-family-${chip}`"
          @click="$emit('family', chip)"
        >
          <span class="feed-chip__mark" aria-hidden="true"></span>
          <span class="feed-chip__label">{{ FAMILY_LABELS[chip] }}</span>
          <span v-if="counts" class="feed-chip__count">{{ counts[chip] }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// WS2. The feed's search box and categories. The two sit straight in the
// feed page's grid (this component's box is display: contents): the search
// over the items from 1024px, staying in view while the page scrolls, and
// the categories down the left as a
// shop's filter list (one picked at a time) from 1024px, or as one row of
// chips that scrolls sideways below that.
//   v-model   the text in the search box
//   family    the picked category ('' for All)
//   counts    how many items each category has, { '': all, electronics: 3, … },
//             or null while they load (no numbers rather than a wrong "0")
//   @family   sent when a chip is tapped, with its category ('' for All)
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { FAMILY_LABELS } from '@/utils/design'
import { FAMILIES, FAMILY_HINTS } from '@/utils/feed'

defineProps({
  modelValue: { type: String, default: '' },
  family: { type: String, default: '' },
  counts: { type: Object, default: null },
})
defineEmits(['update:modelValue', 'family'])

// What screen readers say for a chip, with its hint if it has one:
// "Other (clothing, stationery and anything else)"
function chipLabel(chip) {
  const hint = FAMILY_HINTS[chip]
  return hint ? `${FAMILY_LABELS[chip]} (${hint.toLowerCase()})` : undefined
}

// When the chips don't fit, they scroll sideways. These note whether there
// are more chips past the left or right edge, so that edge can fade out.
const chipsEl = ref(null)
const chipsMore = ref({ left: false, right: false })
function checkChipsEdges() {
  const row = chipsEl.value
  if (!row) return
  chipsMore.value = {
    left: row.scrollLeft > 2,
    right: row.scrollLeft + row.clientWidth < row.scrollWidth - 2,
  }
}
onMounted(() => {
  nextTick(checkChipsEdges)
  window.addEventListener('resize', checkChipsEdges)
})
onBeforeUnmount(() => window.removeEventListener('resize', checkChipsEdges))
</script>

<style scoped>
/* Its two parts are placed by the feed page's grid (grid-area names there) */
.feed-filters {
  display: contents;
}

.feed-search {
  grid-area: search;
  position: relative;
  display: flex;
  align-items: center;
}

/* The search stays under the header while the page scrolls. A band of the
   page's background behind it, reaching a little above and below, hides the
   items passing underneath. It is the plain page colour, because the waves
   sit at the bottom of the screen and the page fade would shift them. */
.feed-search {
  position: sticky;
  top: calc(var(--ds-sticky-top, 0px) + 4rem + 1px + var(--ds-space-3));
  z-index: 5;
}

.feed-search::before {
  content: '';
  position: absolute;
  inset: calc(-1 * var(--ds-space-3)) 0;
  z-index: -1;
  background: var(--fi-page);
}

.feed-search__icon {
  position: absolute;
  left: var(--ds-space-4);
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: var(--ds-text-muted);
  stroke-width: 2;
  stroke-linecap: round;
  pointer-events: none;
}

.feed-search__input {
  width: 100%;
  min-height: var(--ds-control-h-lg);
  padding: 0 3.25rem 0 3rem;
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-text);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-body);
  transition: border-color var(--ds-dur-fast) var(--ds-ease-out);
}

.feed-search__input::placeholder {
  color: var(--ds-text-muted);
}

.feed-search__input:hover {
  border-color: var(--ds-text-muted);
}

.feed-search__input:focus {
  border-color: var(--ds-action);
  outline: 3px solid var(--ds-focus);
  outline-offset: 1px;
}

/* The browser's own clear button: ours is bigger and in our colours */
.feed-search__input::-webkit-search-cancel-button {
  display: none;
}

.feed-search__clear {
  position: absolute;
  right: var(--ds-space-1);
  display: grid;
  place-items: center;
  width: var(--ds-control-h);
  height: var(--ds-control-h);
  padding: 0;
  border: 0;
  border-radius: var(--ds-radius-control);
  background: transparent;
  color: var(--ds-text-muted);
  cursor: pointer;
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    color var(--ds-dur-fast) var(--ds-ease-out);
}

.feed-search__clear:hover {
  background: var(--ds-surface-sunken);
  color: var(--ds-text);
}

.feed-search__clear svg {
  width: 1.125rem;
  height: 1.125rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.feed-cats {
  grid-area: cats;
  min-width: 0;
}

/* The heading only shows beside the list; the chips say what they are */
.feed-cats__heading {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Phones and tablets: one row of chips that scrolls sideways, fading at
   whichever edge has more */
.feed-chips {
  display: flex;
  gap: var(--ds-space-2);
  margin-inline: calc(-1 * var(--ds-gutter));
  padding: var(--ds-space-1) var(--ds-gutter);
  overflow-x: auto;
  scrollbar-width: none;
}

.feed-chips::-webkit-scrollbar {
  display: none;
}

.feed-chips.has-more-right {
  mask-image: linear-gradient(to right, #000 85%, transparent);
}

.feed-chips.has-more-left {
  mask-image: linear-gradient(to left, #000 85%, transparent);
}

.feed-chips.has-more-left.has-more-right {
  mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent);
}

.feed-chip {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--ds-space-2);
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-4);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-text);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    border-color var(--ds-dur-fast) var(--ds-ease-out),
    color var(--ds-dur-fast) var(--ds-ease-out),
    transform var(--ds-dur-fast) var(--ds-ease-press);
}

.feed-chip:hover {
  border-color: var(--ds-text-muted);
  background: var(--ds-surface-sunken);
}

.feed-chip:active {
  transform: scale(0.97);
}

.feed-chip[aria-pressed='true'] {
  border-color: var(--ds-action);
  background: var(--ds-action);
  color: var(--ds-on-action);
}

.feed-chip:focus-visible {
  outline: 3px solid var(--ds-focus);
  outline-offset: 2px;
}

/* The round mark only shows in the list down the left */
.feed-chip__mark {
  display: none;
}

.feed-chip__count {
  color: var(--ds-text-muted);
  font-variant-numeric: tabular-nums;
}

.feed-chip[aria-pressed='true'] .feed-chip__count {
  color: inherit;
  opacity: 0.8;
}

/* From 1024px: a shop's filter list down the left. One row per category with
   a hairline between, a round mark that fills for the picked one, and the
   counts lined up on the right. */
@media (min-width: 1024px) {
  .feed-cats__heading {
    position: static;
    width: auto;
    height: auto;
    overflow: visible;
    clip-path: none;
    padding-bottom: var(--ds-space-2);
    font-family: var(--ds-font-text);
    font-size: var(--ds-size-body);
    line-height: var(--ds-leading-body);
    letter-spacing: 0;
  }

  .feed-chips {
    flex-direction: column;
    gap: 0;
    margin: 0;
    padding: 0;
    overflow: visible;
    border-top: 1px solid var(--ds-border);
    mask-image: none !important;
  }

  .feed-chip {
    gap: var(--ds-space-3);
    width: 100%;
    padding: 0 var(--ds-space-2);
    border: 0;
    border-bottom: 1px solid var(--ds-border);
    border-radius: 0;
    background: transparent;
    font-size: var(--ds-size-body);
    font-weight: var(--ds-weight-regular);
  }

  .feed-chip:hover {
    background: var(--ds-action-wash);
  }

  .feed-chip:active {
    transform: none;
  }

  .feed-chip:focus-visible {
    outline-offset: -3px;
  }

  .feed-chip__mark {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 1.125rem;
    height: 1.125rem;
    border: 1.5px solid var(--ds-border-control);
    border-radius: var(--ds-radius-round);
    transition: border-color var(--ds-dur-fast) var(--ds-ease-out);
  }

  .feed-chip__mark::after {
    content: '';
    width: 0.5rem;
    height: 0.5rem;
    border-radius: var(--ds-radius-round);
    background: var(--ds-action);
    scale: 0;
    transition: scale var(--ds-dur-fast) var(--ds-ease-press);
  }

  .feed-chip:hover .feed-chip__mark {
    border-color: var(--ds-text-muted);
  }

  .feed-chip__count {
    margin-left: auto;
  }

  .feed-chip[aria-pressed='true'] {
    background: transparent;
    color: var(--ds-action);
    font-weight: var(--ds-weight-bold);
  }

  .feed-chip[aria-pressed='true']:hover {
    background: var(--ds-action-wash);
  }

  .feed-chip[aria-pressed='true'] .feed-chip__mark {
    border-color: var(--ds-action);
  }

  .feed-chip[aria-pressed='true'] .feed-chip__mark::after {
    scale: 1;
  }

  .feed-chip[aria-pressed='true'] .feed-chip__count {
    color: var(--ds-action);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .feed-chip:active {
    transform: none;
  }

  .feed-chip__mark::after {
    transition: none;
  }
}
</style>
