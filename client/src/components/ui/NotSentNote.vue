<script setup>
// WS1 · The line beside a form's send button when sending got no answer from
// FoundIt (isConnectionError in utils/safeguards.js). The form keeps what the
// person typed; "Try again" emits `retry` and the page sends it again.
//   busy        true while it is sending, so the button can't be pressed twice
//   maybeSent   true when the send got no answer in time (mayHaveSent in
//               utils/safeguards.js): it may have gone through, so the words
//               say so. Sending it again is safe; FoundIt keeps one copy.
// An answer the server wrote itself ("That email is already registered")
// is still shown in the page's own words, not here.
defineProps({
  busy: { type: Boolean, default: false },
  maybeSent: { type: Boolean, default: false },
})

defineEmits(['retry'])
</script>

<template>
  <div class="not-sent" role="alert" data-testid="not-sent">
    <span v-if="maybeSent" class="not-sent__words">
      No answer yet. It may have gone through; trying again won't send it twice.
    </span>
    <span v-else class="not-sent__words">Not sent. What you wrote is still here.</span>
    <button
      type="button"
      class="ds-btn ds-btn--secondary not-sent__retry"
      :disabled="busy"
      :aria-busy="busy ? 'true' : 'false'"
      data-testid="not-sent-retry"
      @click="$emit('retry')"
    >
      <span v-if="busy" class="ds-spinner" aria-hidden="true"></span>
      Try again
    </button>
  </div>
</template>

<style scoped>
.not-sent {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-2) var(--ds-space-3);
  color: var(--ds-danger);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
  line-height: var(--ds-leading-small);
}

.not-sent__retry {
  padding-inline: var(--ds-space-4);
  font-size: var(--ds-size-small);
}
</style>
