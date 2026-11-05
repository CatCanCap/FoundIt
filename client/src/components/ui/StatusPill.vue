<script setup>
// An item's status as coloured words with a dot. Words and colours come from
// STATUS_PILLS in utils/design.js; the slot can replace the words.
import { computed } from 'vue'
import { statusPill } from '@/utils/design'

const props = defineProps({
  state: { type: String, required: true },
})

const pill = computed(() => statusPill(props.state))
</script>

<template>
  <span class="fi-pill" :class="`fi-pill--${pill.tone}`" data-testid="status-pill">
    <slot>{{ pill.label }}</slot>
  </span>
</template>

<style scoped>
.fi-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
}

/* The marker takes the words' colour */
.fi-pill::before {
  content: '';
  flex-shrink: 0;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
}

/* From the colour tokens, so each reads on cream and in night mode */
.fi-pill--brass {
  color: var(--fi-brass-strong);
}

.fi-pill--navy {
  color: var(--fi-info);
}

.fi-pill--green {
  color: var(--fi-success);
}

.fi-pill--red {
  color: var(--fi-danger);
}

.fi-pill--grey {
  color: var(--fi-mist);
}

/* Inside a rebuilt page (class="ds", assets/system.css): a small round badge,
   its words on a faint wash of their own colour. Gold means a match in the
   design system, so "waiting" (brass) goes quiet grey there. Pages not
   rebuilt yet keep the look above. */
.ds .fi-pill {
  gap: var(--ds-space-2);
  padding: var(--ds-space-1) var(--ds-space-3);
  border-radius: var(--ds-radius-round);
  background: color-mix(in srgb, currentColor 10%, var(--ds-surface));
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-caption);
  line-height: var(--ds-leading-caption);
  font-weight: var(--ds-weight-medium);
}

.ds .fi-pill::before {
  width: 0.375rem;
  height: 0.375rem;
}

.ds .fi-pill--brass,
.ds .fi-pill--grey {
  color: var(--ds-text-muted);
}

.ds .fi-pill--navy {
  color: var(--ds-action);
}

.ds .fi-pill--green {
  color: var(--ds-success);
}

.ds .fi-pill--red {
  color: var(--ds-danger);
}
</style>
