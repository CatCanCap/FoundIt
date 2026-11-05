<script setup>
// WS2. The feed's compact view (List; the usual view is FeedGrid): one row
// per item with its photo (or a drawing in its main colour), its name, and a
// status only when it is not the usual one ("Claimed"). Where and when it was
// found or lost are left for the item's page. The
// whole row opens the item's page. When the page, side or category changes,
// the rows arrive one after another. The rows are shorter while
// <html data-density> is compact (utils/density.js). A stripe down each
// row's left edge and the item number take the side's colour, brass for
// found and brick red for lost, like the tags in the grid.
//   rows      one per item, worked out by the feed page (rowFor in FeedView)
//   type      'found' or 'lost'
//   swapKey   the rows arrive again whenever this changes
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import { resizedPhotoUrl } from '@/services/cloudinary'
import { noteCardTap } from '@/utils/item-morph'

defineProps({
  rows: { type: Array, required: true },
  type: { type: String, required: true },
  swapKey: { type: String, required: true },
})

// Items whose photo failed to load: they get the drawing instead
const failed = ref(new Set())
function photoFailed(id) {
  failed.value = new Set(failed.value).add(id)
}

// The picture grows into the item's page (utils/item-morph.js)
function rememberTap(event, row) {
  const hasPhoto = row.photoUrl && !failed.value.has(row.id)
  noteCardTap(event, row.to, event.currentTarget.querySelector('.feed-row__thumb'), {
    title: row.title,
    category: row.category,
    photoUrl: hasPhoto ? resizedPhotoUrl(row.photoUrl, 480) : '',
    tone: row.tone,
  })
}

// The feed page scrolls back up to the list after a page change
const listEl = ref(null)
defineExpose({ listEl })
</script>

<template>
  <ul :key="swapKey" ref="listEl" class="feed-list" :class="`is-${type}`" data-testid="feed-list">
    <li
      v-for="(row, index) in rows"
      :key="row.id"
      class="ds-enter"
      :style="{ '--i': index }"
      @click.capture="rememberTap($event, row)"
    >
      <RouterLink :to="row.to" class="feed-row" :data-testid="`feed-card-${row.id}`">
        <span class="feed-row__thumb">
          <img
            v-if="row.photoUrl && !failed.has(row.id)"
            :src="resizedPhotoUrl(row.photoUrl, 160)"
            alt=""
            loading="lazy"
            data-testid="feed-card-photo"
            @error="photoFailed(row.id)"
          />
          <ItemIcon
            v-else
            :category="row.category"
            :size="32"
            :tone="row.tone"
            data-testid="feed-card-icon"
          />
        </span>

        <span class="feed-row__words">
          <span class="feed-row__title" data-testid="feed-card-title">{{ row.title }}</span>
        </span>

        <span class="feed-row__side">
          <span
            v-if="row.status"
            class="feed-row__status"
            :class="`is-${row.status.tone}`"
            data-testid="feed-card-status"
            >{{ row.status.label }}</span
          >
          <span class="feed-row__number" :aria-label="`Item ${row.number}`">{{ row.number }}</span>
        </span>

        <svg
          class="feed-row__chevron"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path d="M6 3.5 10.5 8 6 12.5" />
        </svg>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
/* Rows on the page with a hairline between them, like the grid: no panel */
.feed-list {
  display: grid;
  border-block: 1px solid var(--ds-border);
}

.feed-list > li + li {
  border-top: 1px solid var(--ds-border);
}

/* The side's colour, set on the feed page (FeedView) for day and night */
.feed-list.is-found {
  --side: var(--brass-ink, var(--fi-brass-strong));
}

.feed-list.is-lost {
  --side: var(--lost, var(--ds-danger));
}

.feed-row {
  --thumb: 3.5rem;
  position: relative;
  display: grid;
  grid-template-columns: var(--thumb) minmax(0, 1fr) auto 1rem;
  align-items: center;
  column-gap: var(--ds-space-4);
  min-height: calc(var(--thumb) + 2 * var(--ds-space-3));
  padding: var(--ds-space-3) var(--ds-space-2) var(--ds-space-3) var(--ds-space-4);
  border-radius: var(--ds-radius-control);
  color: var(--ds-text);
  text-decoration: none;
  transition: background-color var(--ds-dur-fast) var(--ds-ease-out);
}

/* The stripe down the left edge, in the side's colour */
.feed-row::before {
  content: '';
  position: absolute;
  inset-block: var(--ds-space-2);
  left: 0;
  width: 3px;
  border-radius: var(--ds-radius-round);
  background: var(--side);
}

.feed-row:hover {
  background: var(--ds-action-wash);
  color: var(--ds-text);
}

.feed-row:focus-visible {
  outline-offset: -3px;
}

:root[data-density='compact'] .feed-row {
  --thumb: 2.5rem;
  padding-block: var(--ds-space-2);
}

.feed-row__thumb {
  display: grid;
  place-items: center;
  width: var(--thumb);
  height: var(--thumb);
  overflow: hidden;
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-tile);
}

.feed-row__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

:root[data-density='compact'] .feed-row__thumb :deep(svg) {
  width: 1.5rem;
  height: 1.5rem;
}

.feed-row__words {
  display: grid;
  gap: var(--ds-space-1);
  min-width: 0;
}

.feed-row__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--ds-weight-medium);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.feed-row:hover .feed-row__title {
  text-decoration-line: underline;
}

.feed-row__side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--ds-space-1);
}

/* A status pill, only for a status that is not the usual one */
.feed-row__status {
  padding: 0.125rem var(--ds-space-2);
  border-radius: var(--ds-radius-round);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-bold);
  white-space: nowrap;
}

.feed-row__status.is-navy {
  background: var(--ds-action-wash);
  color: var(--ds-action);
}

.feed-row__status.is-green {
  background: color-mix(in srgb, var(--ds-success) 14%, transparent);
  color: var(--ds-success);
}

.feed-row__status.is-red {
  background: color-mix(in srgb, var(--ds-danger) 12%, transparent);
  color: var(--ds-danger);
}

.feed-row__status.is-grey,
.feed-row__status.is-brass {
  background: var(--ds-surface-sunken);
  color: var(--ds-text-muted);
}

.feed-row__number {
  color: var(--side);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-medium);
  font-variant-numeric: tabular-nums;
}

.feed-row__chevron {
  fill: none;
  stroke: var(--ds-text-muted);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition:
    transform var(--ds-dur-fast) var(--ds-ease-press),
    stroke var(--ds-dur-fast) var(--ds-ease-out);
}

.feed-row:hover .feed-row__chevron {
  stroke: var(--ds-action);
  transform: translateX(2px);
}

/* Phones: the status and number go under the place, so the name keeps its width */
@media (max-width: 575.98px) {
  .feed-row {
    grid-template-columns: var(--thumb) minmax(0, 1fr) 1rem;
    column-gap: var(--ds-space-3);
    row-gap: var(--ds-space-1);
    padding-inline: var(--ds-space-3) var(--ds-space-1);
  }

  .feed-row__thumb {
    grid-row: 1 / span 2;
  }

  .feed-row__side {
    grid-column: 2;
    grid-row: 2;
    flex-direction: row;
    align-items: center;
    gap: var(--ds-space-2);
  }

  .feed-row__chevron {
    grid-column: 3;
    grid-row: 1 / span 2;
  }
}

@media (prefers-reduced-motion: reduce) {
  .feed-row:hover .feed-row__chevron {
    transform: none;
  }
}
</style>
