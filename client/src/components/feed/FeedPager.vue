<script setup>
// WS2. The page buttons under the feed: Previous, the page numbers and Next.
// A phone shows "Page 2 of 5" instead of the numbers.
//   page, pages   the page shown and how many pages there are
//   numbers       the page numbers to show, with '…' for a gap
//   type          'found' or 'lost', for the screen reader label
//   @go           sent when a button is tapped, with the page to go to
defineProps({
  page: { type: Number, required: true },
  pages: { type: Number, required: true },
  numbers: { type: Array, required: true },
  type: { type: String, required: true },
})
defineEmits(['go'])
</script>

<template>
  <nav
    class="feed-pager d-flex align-items-center justify-content-between justify-content-sm-center"
    :aria-label="type === 'found' ? 'Pages of finds' : 'Pages of lost reports'"
    data-testid="feed-pager"
  >
    <button
      type="button"
      class="feed-pager__step d-inline-flex align-items-center justify-content-center"
      :disabled="page === 1"
      data-testid="feed-page-prev"
      @click="$emit('go', page - 1)"
    >
      <span aria-hidden="true">‹</span> Previous
    </button>
    <ol class="feed-pager__numbers d-none d-sm-flex align-items-center gap-2 list-unstyled m-0 p-0">
      <li v-for="(n, index) in numbers" :key="n === '…' ? `gap-${index}` : n">
        <span v-if="n === '…'" class="feed-pager__gap d-inline-block text-center" aria-hidden="true"
          >…</span
        >
        <button
          v-else
          type="button"
          class="feed-pager__number d-inline-flex align-items-center justify-content-center"
          :aria-current="n === page ? 'page' : undefined"
          :aria-label="`Page ${n}`"
          :data-testid="`feed-page-${n}`"
          @click="$emit('go', n)"
        >
          {{ n }}
        </button>
      </li>
    </ol>
    <p class="feed-pager__where d-sm-none mb-0" data-testid="feed-page-where">
      Page {{ page }} of {{ pages }}
    </p>
    <button
      type="button"
      class="feed-pager__step d-inline-flex align-items-center justify-content-center"
      :disabled="page === pages"
      data-testid="feed-page-next"
      @click="$emit('go', page + 1)"
    >
      Next <span aria-hidden="true">›</span>
    </button>
  </nav>
</template>

<style scoped>
/* The page buttons */
.feed-pager {
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.feed-pager__step,
.feed-pager__number {
  gap: 0.35rem;
  min-width: 2.75rem;
  min-height: 2.75rem;
  border: 1.5px solid var(--fi-line);
  border-radius: var(--fi-radius-pill);
  background: var(--fi-ticket);
  color: var(--fi-ink);
  font-size: 0.9375rem;
  font-weight: 700;
}

.feed-pager__step {
  padding: 0 1.1rem;
}

.feed-pager__step:disabled {
  opacity: 0.4;
  cursor: default;
}

.feed-pager__step:not(:disabled):hover,
.feed-pager__number:not([aria-current]):hover {
  border-color: var(--fi-ink);
}

.feed-pager__number[aria-current='page'] {
  border-color: var(--chip-on);
  background: var(--chip-on);
  color: var(--fi-on-night);
}

.feed-pager__gap {
  min-width: 1.5rem;
  color: var(--fi-mist);
}

.feed-pager__where {
  color: var(--fi-mist);
  font-size: 0.9375rem;
  font-weight: 600;
}

.feed-pager button:focus-visible {
  outline: 3px solid var(--fi-focus);
  outline-offset: 2px;
}

/* Inside a rebuilt page (class="ds", assets/system.css): 44px buttons, the
   page you are on filled in navy. The Matches page keeps the look above. */
.ds .feed-pager {
  gap: var(--ds-space-2);
  margin-top: var(--ds-space-5);
}

.ds .feed-pager__step,
.ds .feed-pager__number {
  min-width: var(--ds-control-h);
  min-height: var(--ds-control-h);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-text);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-body);
  font-weight: var(--ds-weight-medium);
  font-variant-numeric: tabular-nums;
  box-shadow: none;
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    border-color var(--ds-dur-fast) var(--ds-ease-out);
}

.ds .feed-pager__step {
  gap: var(--ds-space-1);
  padding: 0 var(--ds-space-4);
}

.ds .feed-pager__step:not(:disabled):hover,
.ds .feed-pager__number:not([aria-current]):hover {
  border-color: var(--ds-action);
  background: var(--ds-action-wash);
}

.ds .feed-pager__number[aria-current='page'] {
  border-color: var(--ds-action);
  background: var(--ds-action);
  color: var(--ds-on-action);
}

.ds .feed-pager__step:disabled {
  border-color: var(--ds-border);
  background: var(--ds-surface-sunken);
  color: var(--ds-text-muted);
  opacity: 1;
  cursor: not-allowed;
}

.ds .feed-pager__gap,
.ds .feed-pager__where {
  color: var(--ds-text-muted);
  font-variant-numeric: tabular-nums;
}

.ds .feed-pager button:focus-visible {
  outline: 3px solid var(--ds-focus);
  outline-offset: 2px;
}
</style>
