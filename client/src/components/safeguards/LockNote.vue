<script setup>
// The grey line with a padlock above a chat an admin can only see because of a
// dispute or a report ("Visible because it's attached to this dispute.").
// The words go in the slot.
</script>

<template>
  <p class="lock-note ds-small ds-muted">
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="5"
        y="11"
        width="14"
        height="10"
        rx="2"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2" />
    </svg>
    <slot />
  </p>
</template>

<style scoped>
.lock-note {
  display: flex;
  gap: var(--ds-space-2);
  align-items: center;
  padding: 0.65rem var(--ds-space-4);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-sunken);
}

.lock-note svg {
  flex-shrink: 0;
}
</style>
