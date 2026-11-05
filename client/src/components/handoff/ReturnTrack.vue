<script setup>
// The four dots under an item on its way home (Figma V13): Posted, Matched,
// Handoff pending, Resolved, each with its time, "In progress" or "Not yet".
//   steps  from returnTrack() in utils/handoff.js
defineProps({
  steps: { type: Array, required: true },
})
</script>

<template>
  <ol
    class="track list-unstyled m-0"
    aria-label="Where this item is up to"
    data-testid="return-track"
  >
    <li
      v-for="step in steps"
      :key="step.label"
      class="track__step position-relative d-flex flex-column gap-1"
      :class="`is-${step.state}`"
      :data-state="step.state"
    >
      <span class="track__dot" aria-hidden="true"></span>
      <span class="track__label">{{ step.label }}</span>
      <span class="track__when">{{ step.when }}</span>
    </li>
  </ol>
</template>

<style scoped>
.track {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.track__step {
  padding-top: 1.6rem;
  padding-right: 0.5rem;
}

/* The line to the next dot */
.track__step::before {
  position: absolute;
  top: 0.4rem;
  left: 0.5rem;
  right: -0.5rem;
  height: 2px;
  background: var(--fi-line);
  content: '';
}

.track__step:last-child::before {
  display: none;
}

.track__step.is-done::before {
  background: var(--fi-brass);
}

.track__dot {
  position: absolute;
  top: 0;
  left: 0;
  width: 0.9rem;
  height: 0.9rem;
  border: 2px solid var(--fi-line);
  border-radius: 50%;
  background: var(--fi-page);
}

.track__step.is-done .track__dot {
  border-color: var(--fi-brass);
  background: var(--fi-brass);
}

.track__step.is-current .track__dot {
  border-color: var(--fi-brass-strong);
}

.track__label {
  color: var(--fi-mist);
  font-size: 0.9rem;
  font-weight: 700;
}

.track__step.is-done .track__label,
.track__step.is-current .track__label {
  color: var(--fi-ink);
}

.track__when {
  color: var(--fi-mist);
  font-size: 0.8rem;
}

.track__step.is-current .track__when {
  color: var(--fi-brass-strong);
}

/* Inside a rebuilt page (class="ds", assets/system.css): navy for the steps
   done, since gold only means a match there. Pages not rebuilt yet keep the
   look above. */
.ds .track__step::before {
  background: var(--ds-border);
}

.ds .track__step.is-done::before {
  background: var(--ds-action);
}

.ds .track__dot {
  border-color: var(--ds-border-control);
  background: var(--ds-canvas);
}

.ds .track__step.is-done .track__dot {
  border-color: var(--ds-action);
  background: var(--ds-action);
}

.ds .track__step.is-current .track__dot {
  border-color: var(--ds-action);
}

.ds .track__label {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-bold);
}

.ds .track__step.is-done .track__label,
.ds .track__step.is-current .track__label {
  color: var(--ds-text);
}

.ds .track__when {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
}

.ds .track__step.is-current .track__when {
  color: var(--ds-action);
  font-weight: var(--ds-weight-medium);
}

/* Very narrow phones: the four steps stack */
@media (max-width: 360px) {
  .track {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .track__step::before {
    display: none;
  }
}
</style>
