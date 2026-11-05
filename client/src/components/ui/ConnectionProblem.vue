<script setup>
// WS1 · What a page shows when its first request got no answer from FoundIt
// (isConnectionError in utils/safeguards.js): a quiet dashed panel with one
// way on. "Try again" emits `retry`, and the page runs its own load again, so
// nothing else on the screen is thrown away.
//   busy  true while that load runs, so the button shows it is working
// A page whose item is missing or not theirs keeps its own message
// (handoff/PageProblem.vue); this panel is only for connection problems.
defineProps({
  busy: { type: Boolean, default: false },
})

defineEmits(['retry'])
</script>

<template>
  <section class="connection-problem" role="alert" data-testid="connection-problem">
    <h2 class="connection-problem__title">We can't reach FoundIt right now</h2>
    <p class="connection-problem__line">
      This is usually quick to fix. Your connection may have dropped, or the server is busy.
    </p>
    <button
      type="button"
      class="ds-btn ds-btn--primary"
      :disabled="busy"
      :aria-busy="busy ? 'true' : 'false'"
      data-testid="connection-retry"
      @click="$emit('retry')"
    >
      <span v-if="busy" class="ds-spinner" aria-hidden="true"></span>
      Try again
    </button>
  </section>
</template>

<style scoped>
.connection-problem {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ds-space-3);
  padding: var(--ds-space-5);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  color: var(--ds-text);
  font-family: var(--ds-font-text);
}

.connection-problem__title {
  margin: 0;
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-title);
  font-weight: var(--ds-weight-bold);
  line-height: var(--ds-leading-title);
}

.connection-problem__line {
  margin: 0;
  max-width: 40rem;
  color: var(--ds-text-muted);
}
</style>
