<script setup>
// The top of both report forms: the "Lost item report" or "Found item report"
// badge, then a bar in one part per step with "Step 2 of 4" under it, so the
// two forms look and read the same. Red for lost, yellow for found.
//   <ReportProgress kind="lost" :step="stepIndex" :count="steps.length" />
//   kind   'lost' or 'found'
//   step   the step being shown, from 0
//   count  how many steps the form has
import ReportKind from './ReportKind.vue'

defineProps({
  kind: { type: String, required: true },
  step: { type: Number, required: true },
  count: { type: Number, required: true },
})
</script>

<template>
  <div class="report-progress" :class="`report-progress--${kind}`">
    <ReportKind :kind="kind" class="report-progress__kind" />
    <div class="report-progress__steps">
      <ol class="report-progress__bar" aria-hidden="true">
        <li v-for="index in count" :key="index" :class="{ 'is-done': index - 1 <= step }"></li>
      </ol>
      <p class="ds-small ds-muted ds-num" :data-testid="`${kind}-step-count`">
        Step {{ step + 1 }} of {{ count }}
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Used inside the rebuilt report pages (class="ds"), so it uses the tokens */
.report-progress {
  display: grid;
  gap: var(--ds-space-4);
  width: 100%;
  --kind: var(--ds-found-fill);
}

.report-progress--lost {
  --kind: var(--ds-lost);
}

.report-progress__kind {
  justify-self: start;
}

/* The bar with "Step 2 of 4" just under it */
.report-progress__steps {
  display: grid;
  gap: var(--ds-space-2);
}

.report-progress__bar {
  display: flex;
  gap: var(--ds-space-1);
  max-width: 24rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.report-progress__bar li {
  flex: 1;
  height: var(--ds-space-1);
  border-radius: var(--ds-radius-round);
  background: var(--ds-border);
  transition: background-color var(--ds-dur-base) var(--ds-ease-out);
}

.report-progress__bar li.is-done {
  background: var(--kind);
}

@media (prefers-reduced-motion: reduce) {
  .report-progress__bar li {
    transition: none;
  }
}
</style>
