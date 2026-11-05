<script setup>
// Badge at the top of the report forms: red for lost, yellow for found.
//   kind  'lost' or 'found'
// Its colours are the --ds-lost and --ds-found tokens in assets/system.css.
import ReportIcon from './ReportIcon.vue'

defineProps({
  kind: { type: String, required: true },
})
</script>

<template>
  <p class="report-kind" :class="`report-kind--${kind}`" :data-testid="`report-kind-${kind}`">
    <ReportIcon :kind="kind" />
    {{ kind === 'lost' ? 'Lost item report' : 'Found item report' }}
  </p>
</template>

<style scoped>
/* A quiet pill: the report's colour on its pale wash */
.report-kind {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-2);
  margin: 0;
  padding: var(--ds-space-1) var(--ds-space-3);
  border-radius: var(--ds-radius-round);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
  line-height: var(--ds-leading-small);
}

.report-kind svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.report-kind--lost {
  background: var(--ds-lost-wash);
  color: var(--ds-lost);
}

.report-kind--found {
  background: var(--ds-found-wash);
  color: var(--ds-found);
}
</style>
