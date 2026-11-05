<script setup>
// Previous / Next and page numbers under a long Admin list, with
// "Showing 11–20 of 23". The admin routes return whole lists, so the page cuts
// the list itself with pageOf() from utils/safeguards.js and gives this
// component the page number and the length of the list (pageInfo does the
// same maths here, so the two always agree).
//   v-model:page  the page shown, counting from 1
//   total         how many rows the whole list has
//   perPage       rows on one page (10)
//   noun          what the rows are ("disputes"), for screen readers
// Hidden while everything fits on one page. On a phone the numbers give way
// to "Page 2 of 3" so the row fits at 375px.
import { computed } from 'vue'
import { pageNumbers } from '@/utils/pager'
import { pageInfo, PER_PAGE } from '@/utils/safeguards'

const page = defineModel('page', { type: Number, default: 1 })

const props = defineProps({
  total: { type: Number, required: true },
  perPage: { type: Number, default: PER_PAGE },
  noun: { type: String, default: 'rows' },
})

const info = computed(() => pageInfo(props.total, page.value, props.perPage))
const numbers = computed(() => pageNumbers(info.value.page, info.value.pageCount))

function go(number) {
  const next = Math.min(Math.max(1, number), info.value.pageCount)
  if (next !== page.value) page.value = next
}
</script>

<template>
  <nav
    v-if="info.pageCount > 1"
    class="pager"
    :aria-label="`Pages of ${noun}`"
    data-testid="list-pager"
  >
    <p class="pager__count" aria-live="polite" data-testid="pager-count">
      Showing {{ info.from }}–{{ info.to }} of {{ total }}
    </p>
    <ul class="pager__row">
      <li>
        <button
          type="button"
          class="pager__button pager__step"
          :disabled="info.page === 1"
          data-testid="pager-previous"
          @click="go(info.page - 1)"
        >
          Previous
        </button>
      </li>
      <li v-for="(number, index) in numbers" :key="`${number}-${index}`" class="pager__number">
        <span v-if="number === '…'" class="pager__gap" aria-hidden="true">…</span>
        <button
          v-else
          type="button"
          class="pager__button"
          :class="{ 'is-current': number === info.page }"
          :aria-current="number === info.page ? 'page' : undefined"
          :aria-label="`Page ${number}`"
          :data-testid="`pager-page-${number}`"
          @click="go(number)"
        >
          {{ number }}
        </button>
      </li>
      <li class="pager__where">Page {{ info.page }} of {{ info.pageCount }}</li>
      <li>
        <button
          type="button"
          class="pager__button pager__step"
          :disabled="info.page === info.pageCount"
          data-testid="pager-next"
          @click="go(info.page + 1)"
        >
          Next
        </button>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-3) var(--ds-space-4);
  margin-top: var(--ds-space-4);
}

.pager__count {
  margin: 0;
  font-size: var(--ds-size-small);
  color: var(--ds-text-muted);
}

.pager__row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pager__button {
  display: inline-grid;
  place-items: center;
  min-width: var(--ds-control-h);
  min-height: var(--ds-control-h);
  padding: 0 0.6rem;
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-text);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.pager__step {
  display: inline-flex;
  gap: 0.35rem;
}

.pager__button:hover:not(:disabled) {
  border-color: var(--ds-action);
}

.pager__button.is-current {
  border-color: var(--ds-action);
  background: var(--ds-action);
  color: var(--ds-on-action);
}

.pager__button:disabled {
  border-color: transparent;
  background: var(--ds-surface-sunken);
  color: var(--ds-text-muted);
  cursor: not-allowed;
}

.pager__gap {
  display: inline-block;
  min-width: 1.25rem;
  text-align: center;
  color: var(--ds-text-muted);
}

/* "Page 2 of 3" only on a phone */
.pager__where {
  display: none;
  padding: 0 var(--ds-space-2);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
  white-space: nowrap;
}

@media (max-width: 575.98px) {
  .pager {
    justify-content: center;
  }

  .pager__count {
    flex-basis: 100%;
    text-align: center;
  }

  .pager__row {
    justify-content: space-between;
    width: 100%;
  }

  .pager__number {
    display: none;
  }

  .pager__where {
    display: block;
  }
}
</style>
