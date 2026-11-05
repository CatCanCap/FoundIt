<script setup>
// The claims the finder declined for one lost report, under its matches. A
// declined claim does not close the report: it stays open and new finds keep
// showing up, so this says what happened instead of the claim just vanishing.
//   declined   [{ matchId, declinedAt, item }] from GET /api/matches/mine
//   reportOpen whether the report is still open (not being returned)
//   canClose   offer "I found it myself": only while the report is open, and
//              not when the "No matches yet" panel already offers it
// Emits hide(matchId) and close.
import { RouterLink } from 'vue-router'
import CloseReport from '@/components/matches/CloseReport.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import { declinedLine, itemTone } from '@/utils/matches'

defineProps({
  declined: { type: Array, required: true },
  reportOpen: { type: Boolean, default: true },
  canClose: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['hide', 'close'])
</script>

<template>
  <section class="declined" data-testid="declined-claims">
    <h2 class="declined__title">Claims the finder declined</h2>
    <p v-if="reportOpen" class="declined__note">
      Your report stays open, so new finds will still show up here.
    </p>

    <CloseReport
      v-if="canClose"
      class="declined__close-report"
      prompt="Got it back another way?"
      :busy="busy"
      @close="emit('close')"
    />

    <ul class="declined__list">
      <li
        v-for="entry in declined"
        :key="entry.matchId"
        class="declined__row"
        data-testid="declined-claim"
      >
        <div class="declined__thumb">
          <img
            v-if="entry.item.photoUrl"
            :src="entry.item.photoUrl"
            :alt="entry.item.title"
            loading="lazy"
          />
          <ItemIcon
            v-else
            :category="entry.item.category"
            :size="28"
            :tone="itemTone(entry.item)"
          />
        </div>
        <div class="declined__text">
          <h3 class="declined__name">{{ entry.item.title }}</h3>
          <p class="declined__when">{{ declinedLine(entry.declinedAt) }}</p>
        </div>
        <div class="declined__actions">
          <RouterLink :to="`/items/${entry.item.id}/record`" class="declined__link">
            View <span class="fi-visually-hidden">{{ entry.item.title }}</span>
          </RouterLink>
          <button
            type="button"
            class="declined__link"
            data-testid="declined-hide"
            @click="emit('hide', entry.matchId)"
          >
            Hide <span class="fi-visually-hidden">{{ entry.item.title }}</span>
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.declined {
  margin-top: 2.5rem;
}

.declined__title {
  margin: 0 0 0.25rem;
  color: var(--fi-mist);
  font-size: 0.85rem;
  font-weight: 600;
}

.declined__note {
  margin: 0 0 0.5rem;
  color: var(--fi-mist);
  font-size: 0.9rem;
}

.declined__close-report {
  margin-bottom: 0.75rem;
}

.declined__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.declined__row {
  display: grid;
  grid-template-columns: 3.5rem 1fr auto;
  align-items: center;
  gap: 0.25rem 1rem;
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--fi-line);
  opacity: 0.75;
}

.declined__thumb {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 2.75rem;
  overflow: hidden;
  border-radius: var(--fi-radius-sm);
  background: var(--fi-raised);
}

.declined__thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: grayscale(0.6);
}

.declined__name {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.declined__when {
  margin: 0.1rem 0 0;
  color: var(--fi-mist);
  font-size: 0.85rem;
}

.declined__actions {
  display: flex;
  gap: 0.9rem;
}

.declined__link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--fi-ink);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.declined__link:hover {
  text-decoration: underline;
}

.declined__link:focus-visible {
  outline: 3px solid var(--fi-focus);
  outline-offset: 2px;
}

/* Phones: the links go under the text */
@media (max-width: 575.98px) {
  .declined__row {
    grid-template-columns: 3.5rem 1fr;
  }

  .declined__actions {
    grid-column: 2;
  }
}
</style>
