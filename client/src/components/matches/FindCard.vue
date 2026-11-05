<script setup>
// The find shown large on the Matches page, under the report it looks like:
// its photo (or a drawing in its own colour), its name, the score with a gold
// bar that fills up to it, where and when it turned up, and every reason it
// matched. The buttons go in the default slot ("This is mine" and "Not mine",
// or "Open the chat" once it is being returned).
//   match      a match from GET /api/matches/mine, with its found item as .item
//   spotsById  Map of campus spots
//   back       true while it is being returned: no score or reasons, since
//              the owner has already said it is theirs
//   note       true when the slot holds a note rather than buttons (someone
//              else claimed it), so it gets the full width
import { computed, ref } from 'vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import { resizedPhotoUrl } from '@/services/cloudinary'
import { whenParts } from '@/utils/feed'
import { foundWhereWhen, itemTone, reasonPartsOf, whereFound } from '@/utils/matches'

const props = defineProps({
  match: { type: Object, required: true },
  spotsById: { type: Map, required: true },
  back: { type: Boolean, default: false },
  note: { type: Boolean, default: false },
})

const photoFailed = ref(false)
const item = computed(() => props.match.item)
const score = computed(() => Math.max(0, Math.min(100, Math.round(props.match.score))))
const where = computed(() => whereFound(item.value, props.spotsById))
const whereRest = computed(() =>
  foundWhereWhen(
    where.value.area,
    item.value.trail?.length ? whenParts(item.value) : { day: '', time: '' },
  ),
)
const reasons = computed(() => (props.back ? [] : reasonPartsOf(props.match)))
</script>

<template>
  <article class="find" :class="{ 'is-back': back, 'is-note': note }" data-testid="best-find">
    <div class="find__picture" aria-hidden="true">
      <img
        v-if="item.photoUrl && !photoFailed"
        :src="resizedPhotoUrl(item.photoUrl, 480)"
        alt=""
        @error="photoFailed = true"
      />
      <ItemIcon v-else :category="item.category" :size="64" :tone="itemTone(item)" />
    </div>

    <div class="find__body">
      <div class="find__top">
        <h4 class="find__name">{{ item.title }}</h4>
        <p v-if="!back" class="find__score">
          <span class="find__percent"
            ><span data-testid="finds-score">{{ score }}%</span> match</span
          >
          <span class="find__meter" :style="{ '--score': score / 100 }" aria-hidden="true"></span>
        </p>
      </div>

      <p v-if="item.placeHidden" class="find__where" data-testid="find-place-hidden">
        Where and when it was found stay private: your report doesn’t name that building around that
        time.
      </p>
      <p v-else-if="where.building" class="find__where">
        Found at <strong>{{ where.building }}</strong
        >{{ whereRest }}
      </p>

      <ul v-if="reasons.length" class="find__reasons" aria-label="Why it matched">
        <li
          v-for="(reason, index) in reasons"
          :key="reason.lead + reason.detail"
          class="find__reason"
        >
          {{ reason.lead
          }}<span v-if="reason.detail" class="find__reason-detail">{{ reason.detail }}</span>
          <span v-if="index < reasons.length - 1" class="visually-hidden">,</span>
        </li>
      </ul>

      <div class="find__actions">
        <slot />
      </div>
    </div>
  </article>
</template>

<style scoped>
/* The picture over the words on a phone, beside them from sm (576px) */
.find {
  display: grid;
  grid-template-columns: 5.5rem minmax(0, 1fr);
  gap: var(--ds-space-4);
  padding: var(--ds-space-4);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

.find__picture {
  display: grid;
  place-items: center;
  align-self: start;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-tile);
  color: var(--ds-text-muted);
}

.find__picture img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ItemIcon is drawn at 64px; on a phone the tile is smaller */
.find__picture :deep(svg) {
  width: 60%;
  height: auto;
}

.find__body {
  display: contents;
}

.find__top {
  display: grid;
  align-content: start;
  gap: var(--ds-space-2);
  min-width: 0;
}

.find__name {
  font-size: var(--ds-size-title);
  line-height: var(--ds-leading-title);
  letter-spacing: -0.01em;
}

/* "92% match" with a gold bar that fills up to the score once */
.find__score {
  display: grid;
  gap: var(--ds-space-1);
  max-width: 12rem;
}

.find__percent {
  color: var(--ds-signal-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
}

.find__meter {
  position: relative;
  height: 0.375rem;
  overflow: hidden;
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface-sunken);
}

.find__meter::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--ds-signal);
  transform: scaleX(var(--score));
  transform-origin: left;
  animation: find-fill var(--ds-dur-max) var(--ds-ease-out) both;
}

@keyframes find-fill {
  from {
    transform: scaleX(0);
  }
}

.find__where,
.find__reasons,
.find__actions {
  grid-column: 1 / -1;
}

.find__where {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
}

.find__where strong {
  color: var(--ds-text);
  font-weight: var(--ds-weight-medium);
}

/* Each reason as a label with a gold dot: "Same brand  Hydro Flask" */
.find__reasons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-2);
}

.find__reason {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-2);
  min-height: 2rem;
  padding: 0 var(--ds-space-3);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-control);
  background: var(--ds-canvas);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
}

.find__reason::before {
  content: '';
  flex-shrink: 0;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--ds-signal);
}

.find__reason-detail {
  color: var(--ds-text-muted);
  font-weight: var(--ds-weight-regular);
}

.find__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-2) var(--ds-space-4);
  margin-top: var(--ds-space-1);
}

/* Below lg (1024px) the buttons come before the reasons, so they stay near
   the top of the card as they do beside the name on a wide screen */
@media (max-width: 1023.98px) {
  .find__reasons {
    order: 1;
  }
}

/* Phones: only what each reason is (the finds page has the details), and
   "This is mine" taking the width beside "Not mine" */
@media (max-width: 575.98px) {
  .find__reasons {
    gap: var(--ds-space-1) var(--ds-space-2);
  }

  .find__reason {
    min-height: 1.75rem;
    padding-inline: var(--ds-space-2);
    font-size: var(--ds-size-caption);
  }

  .find__reason-detail {
    display: none;
  }

  .find:not(.is-note) .find__actions {
    flex-wrap: nowrap;
  }

  .find:not(.is-note) .find__actions > :first-child {
    flex-grow: 1;
  }
}

/* sm (576px) and up: the picture runs down the left side */
@media (min-width: 576px) {
  .find {
    grid-template-columns: 9rem minmax(0, 1fr);
    gap: var(--ds-space-3) var(--ds-space-5);
    padding: var(--ds-space-5);
  }

  .find__picture {
    grid-row: span 4;
  }

  .find__where,
  .find__reasons,
  .find__actions {
    grid-column: 2;
  }

  .find__top {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    column-gap: var(--ds-space-5);
  }

  .find__score {
    min-width: 8rem;
    justify-items: end;
  }

  .find__meter {
    width: 100%;
  }
}

/* lg (1024px) and up: the buttons move up beside the name and score, so
   they sit on the first screen with the find */
@media (min-width: 1024px) {
  .find {
    grid-template-columns: 9rem minmax(0, 1fr) auto;
    grid-template-areas:
      'picture top actions'
      'picture where where'
      'picture reasons reasons';
    align-content: start;
  }

  .find__picture {
    grid-area: picture;
  }

  .find__top {
    grid-area: top;
    grid-template-columns: minmax(0, 1fr);
    row-gap: var(--ds-space-1);
  }

  .find__score {
    justify-items: start;
  }

  .find__where {
    grid-area: where;
  }

  .find__reasons {
    grid-area: reasons;
  }

  .find__actions {
    grid-area: actions;
    flex-wrap: nowrap;
    align-self: start;
    margin-top: 0;
  }

  /* Someone else claimed it: the note needs the room under the name */
  .find.is-note .find__actions {
    grid-area: auto;
    grid-column: 2 / -1;
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .find__meter::after {
    animation: none;
  }
}
</style>
