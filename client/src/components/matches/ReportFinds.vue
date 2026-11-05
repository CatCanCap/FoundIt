<script setup>
// What has turned up for the report shown on the Matches page, under its
// details. With finds: the best one large (FindCard) with "This is mine" and
// "Not mine", the others as rows that open on the finds page, and "Compare
// side by side" for the finds page itself. "Not mine" hides a find at once and
// offers Undo for a few seconds; the page saves it after that. While the
// report is being returned: the claimed find and the way into the chat. With
// no finds yet: a quiet panel with "Add details" and the feed.
//   report     from GET /api/matches/mine: { item, matches }
//   spotsById  Map of campus spots
//   hiding     Set of match ids just turned down (hidden while they save)
//   undoable   the match waiting out its Undo, or null
// Emits notMine(match), undo and addDetails.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import FindCard from '@/components/matches/FindCard.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import { resizedPhotoUrl } from '@/services/cloudinary'
import {
  claimLink,
  claimedMatch,
  feedSearchLink,
  findsLookLike,
  itemNoun,
  itemTone,
  reportKind,
  shortReasons,
  takenFind,
  whereFound,
} from '@/utils/matches'

const props = defineProps({
  report: { type: Object, required: true },
  spotsById: { type: Map, required: true },
  hiding: { type: Set, default: () => new Set() },
  undoable: { type: Object, default: null },
})

const emit = defineEmits(['notMine', 'undo', 'addDetails'])

const kind = computed(() => reportKind(props.report))
const reportId = computed(() => props.report.item.id)
const noun = computed(() => itemNoun(props.report.item.category))
// The finds still on show, best first
const finds = computed(() => props.report.matches.filter((match) => !props.hiding.has(match.id)))
const best = computed(() => finds.value[0] || null)
const others = computed(() => finds.value.slice(1))
const taken = computed(() => (best.value ? takenFind(best.value) : null))
const claimed = computed(() => (kind.value === 'back' ? claimedMatch(props.report) : null))
const headingId = computed(() => `finds-heading-${reportId.value}`)

// "SCIS 1. Same category, similar colour." on another find's row
function otherLine(match) {
  const building = whereFound(match.item, props.spotsById).building
  const why = shortReasons(match, 2)
  return [building && `${building}.`, why].filter(Boolean).join(' ')
}
</script>

<template>
  <section class="finds" :class="`is-${kind}`" :aria-labelledby="headingId">
    <!-- Finds to check -->
    <template v-if="kind === 'finds'">
      <div class="finds__head">
        <h3 :id="headingId" class="finds__title" data-testid="finds-title">
          <template v-if="finds.length">{{ findsLookLike(finds.length) }} it</template>
          <template v-else>No other finds look like it</template>
        </h3>
        <RouterLink
          v-if="finds.length"
          :to="`/matches/finds/${reportId}`"
          class="finds__compare ds-link"
          data-testid="finds-link"
          >Compare side by side</RouterLink
        >
      </div>

      <p v-if="undoable" class="finds__undo" role="status" data-testid="not-mine-undo">
        <span
          >Hidden <strong>{{ undoable.item.title }}</strong
          >.</span
        >
        <button
          type="button"
          class="finds__undo-button ds-btn ds-btn--tertiary"
          data-testid="not-mine-undo-button"
          @click="emit('undo')"
        >
          Undo
        </button>
      </p>

      <div v-if="best" class="finds__list">
        <FindCard
          :key="best.id"
          :match="best"
          :spots-by-id="spotsById"
          :note="Boolean(taken)"
          class="finds__best"
        >
          <template v-if="taken">
            <p class="finds__taken" data-testid="find-taken">
              <strong>{{ taken.label }}.</strong> {{ taken.note }}
            </p>
            <RouterLink
              v-if="taken.recordLink"
              :to="taken.recordLink"
              class="ds-link ds-link--standalone"
              data-testid="find-taken-record"
              >See the item</RouterLink
            >
          </template>
          <template v-else>
            <BaseButton :to="claimLink(best)" data-testid="this-is-mine">This is mine</BaseButton>
            <BaseButton variant="link" data-testid="not-mine" @click="emit('notMine', best)">
              Not mine
            </BaseButton>
          </template>
        </FindCard>

        <section v-if="others.length" class="finds__others" :aria-labelledby="`${headingId}-more`">
          <h4 :id="`${headingId}-more`" class="finds__others-title">Other finds</h4>
          <ul class="finds__rows">
            <li v-for="match in others" :key="match.id">
              <RouterLink
                :to="{ path: `/matches/finds/${reportId}`, query: { find: String(match.id) } }"
                class="finds__row"
                data-testid="other-find"
              >
                <span class="finds__row-picture" aria-hidden="true">
                  <img
                    v-if="match.item.photoUrl"
                    :src="resizedPhotoUrl(match.item.photoUrl, 120)"
                    alt=""
                    loading="lazy"
                  />
                  <ItemIcon
                    v-else
                    :category="match.item.category"
                    :size="28"
                    :tone="itemTone(match.item)"
                  />
                </span>
                <span class="finds__row-text">
                  <span class="finds__row-name">{{ match.item.title }}</span>
                  <span class="finds__row-line">{{ otherLine(match) }}</span>
                </span>
                <span class="finds__row-score">{{ Math.round(match.score) }}%</span>
                <svg class="finds__row-arrow" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </RouterLink>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <!-- Being returned -->
    <template v-else-if="kind === 'back'">
      <div class="finds__head">
        <h3 :id="headingId" class="finds__title">Your claim is under way</h3>
      </div>
      <FindCard v-if="claimed" :match="claimed" :spots-by-id="spotsById" back>
        <BaseButton
          :to="`/matches/${claimed.id}/handoff`"
          :aria-label="`Open the chat with the finder of your ${noun}`"
          data-testid="handoff-link"
        >
          Open the chat
        </BaseButton>
      </FindCard>
    </template>

    <!-- Nothing yet -->
    <div v-else class="finds__none">
      <h3 :id="headingId" class="finds__title">No finds yet</h3>
      <p class="finds__none-line" data-testid="no-finds">
        No finds look like it yet. A finder may have described it differently, so more detail helps.
      </p>
      <div class="finds__none-actions">
        <BaseButton
          v-if="report.item.status === 'open'"
          variant="secondary"
          data-testid="add-details"
          @click="emit('addDetails')"
        >
          Add details
        </BaseButton>
        <RouterLink
          :to="feedSearchLink(report.item.category)"
          class="ds-link ds-link--standalone"
          data-testid="search-feed"
          >Browse our finds</RouterLink
        >
      </div>
    </div>
  </section>
</template>

<style scoped>
.finds {
  display: grid;
  gap: var(--ds-space-3);
}

.finds__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ds-space-1) var(--ds-space-4);
}

.finds__title {
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-lead);
  line-height: var(--ds-leading-lead);
  letter-spacing: -0.01em;
}

.finds__compare {
  position: relative;
  font-size: var(--ds-size-small);
}

/* A 44px tap target around the words */
.finds__compare::after {
  content: '';
  position: absolute;
  inset: 50% 0 auto;
  height: var(--ds-control-h);
  translate: 0 -50%;
}

/* "Hidden Navy Hydro Flask. Undo" */
.finds__undo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-2);
  padding: var(--ds-space-1) var(--ds-space-1) var(--ds-space-1) var(--ds-space-4);
  border-radius: var(--ds-radius-control);
  background: var(--ds-band);
  color: var(--ds-on-band);
  font-size: var(--ds-size-small);
  animation: finds-in var(--ds-dur-base) var(--ds-ease-out);
}

.finds__undo-button {
  color: var(--ds-on-band);
}

.finds__undo-button:hover {
  background: color-mix(in srgb, var(--ds-on-band) 12%, transparent);
  color: var(--ds-on-band);
}

@keyframes finds-in {
  from {
    opacity: 0;
    translate: 0 calc(-1 * var(--ds-space-1));
  }
}

.finds__list {
  display: grid;
  gap: var(--ds-space-4);
  align-items: start;
}

.finds__best {
  animation: finds-in var(--ds-dur-base) var(--ds-ease-out);
}

.finds__taken {
  flex-basis: 100%;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.finds__taken strong {
  color: var(--ds-text);
}

/* The other finds: rows that open on the finds page */
.finds__others {
  display: grid;
  gap: var(--ds-space-2);
}

.finds__others-title {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.finds__rows {
  display: grid;
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

.finds__rows li + li {
  border-top: 1px solid var(--ds-border);
}

.finds__row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  min-height: var(--ds-row-h);
  padding: var(--ds-space-2) var(--ds-space-3);
  border-radius: var(--ds-radius-surface);
  color: var(--ds-text);
  text-decoration: none;
  transition: background-color var(--ds-dur-fast) var(--ds-ease-out);
}

.finds__row:hover {
  background: var(--ds-action-wash);
  color: var(--ds-text);
}

.finds__row:focus-visible {
  outline-offset: -3px;
}

.finds__row-picture {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  overflow: hidden;
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-tile);
  color: var(--ds-text-muted);
}

.finds__row-picture img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.finds__row-text {
  display: grid;
  flex: 1;
  min-width: 0;
}

.finds__row-name {
  overflow: hidden;
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-bold);
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.finds__row:hover .finds__row-name {
  text-decoration-line: underline;
}

.finds__row-line {
  overflow: hidden;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
  line-height: var(--ds-leading-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.finds__row-score {
  color: var(--ds-signal-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
}

.finds__row-arrow {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: var(--ds-text-muted);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform var(--ds-dur-fast) var(--ds-ease-press);
}

.finds__row:hover .finds__row-arrow {
  transform: translateX(2px);
}

/* No finds yet: a quiet dashed panel with one way on */
.finds__none {
  display: grid;
  justify-items: start;
  gap: var(--ds-space-2);
  padding: var(--ds-space-5);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
}

.finds__none-line {
  max-width: 52ch;
  color: var(--ds-text-muted);
}

.finds__none-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-2) var(--ds-space-5);
  margin-top: var(--ds-space-2);
}

/* lg (1024px) and up: the other finds beside the best one, which keeps the
   same width when it is the only one, so its score stays near its name */
@media (min-width: 1024px) {
  .finds__list {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  }

  .finds.is-back > .find {
    width: calc((100% - var(--ds-space-4)) * 2 / 3);
  }
}

@media (prefers-reduced-motion: reduce) {
  .finds__undo,
  .finds__best {
    animation: none;
  }

  .finds__row-arrow {
    transition: none;
  }
}
</style>
