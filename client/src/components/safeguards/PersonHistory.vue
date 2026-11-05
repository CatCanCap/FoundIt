<script setup>
// A person's record on other cases, in a few short labels ("1 of 2 disputes
// lost · 1 warning"), for the admin weighing an honest mistake against a
// deliberate false claim. Labels that point to the second are in red. The
// words come from historyLabels() in utils/safeguards.js.
//   history  the `history` the admin API adds to each person on a case
import { computed } from 'vue'
import { historyLabels } from '@/utils/safeguards'

const props = defineProps({
  history: { type: Object, default: null },
})

const labels = computed(() => historyLabels(props.history))
</script>

<template>
  <ul v-if="labels.length" class="history" aria-label="Record on other cases" data-testid="history">
    <li
      v-for="label in labels"
      :key="label.text"
      class="history-label"
      :class="{ 'is-bad': label.tone === 'bad' }"
    >
      {{ label.text }}
    </li>
  </ul>
  <p v-else-if="history" class="history-clean" data-testid="history">Nothing else on record</p>
</template>

<style scoped>
.history {
  margin: var(--ds-space-1) 0 0;
  padding: 0;
  list-style: none;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.history-label.is-bad {
  color: var(--ds-danger);
  font-weight: var(--ds-weight-medium);
}

.history-clean {
  margin: var(--ds-space-1) 0 0;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}
</style>
