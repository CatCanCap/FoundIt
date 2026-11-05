<script setup>
// The app's button.
//   variant  primary (brass), secondary (outlined), night (navy) or link
//   size     md or sm
//   to       router path; renders a link
//   block    full width
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'md' },
  to: { type: [String, Object], default: null },
  block: { type: Boolean, default: false },
})

const classes = computed(() => [
  'fi-button',
  `fi-button--${props.variant}`,
  `fi-button--${props.size}`,
  { 'fi-button--block': props.block },
])
</script>

<template>
  <RouterLink v-if="to" :to="to" :class="classes"><slot /></RouterLink>
  <button v-else type="button" :class="classes"><slot /></button>
</template>

<style scoped>
.fi-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 1.5px solid transparent;
  border-radius: var(--fi-radius-sm);
  font-family: var(--fi-font);
  font-weight: 700;
  line-height: 1.2;
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.fi-button--md {
  min-height: 2.75rem; /* 44px, a comfortable thumb target */
  padding: 0.65rem 1.25rem;
  font-size: 1rem;
}

.fi-button--sm {
  min-height: 2.25rem;
  padding: 0.4rem 0.9rem;
  font-size: 0.875rem;
}

.fi-button--block {
  width: 100%;
}

/* SMU blue with a darker ledge that presses down on click */
.fi-button--primary {
  background: var(--fi-primary);
  color: var(--fi-on-primary);
  box-shadow: 0 3px 0 var(--fi-primary-strong);
}

.fi-button--primary:hover {
  background: color-mix(in srgb, var(--fi-primary) 85%, #000);
}

.fi-button--primary:active {
  box-shadow: 0 1px 0 var(--fi-primary-strong);
  transform: translateY(2px);
}

.fi-button--secondary {
  background: transparent;
  border-color: var(--fi-primary);
  color: var(--fi-primary);
}

.fi-button--secondary:hover {
  background: var(--fi-primary-soft);
}

.fi-button--night {
  background: var(--fi-night);
  color: var(--fi-on-night);
}

.fi-button--night:hover {
  background: var(--fi-night-raised);
}

/* At night the page is navy too: a raised navy with a hairline keeps it a button */
:root[data-theme='night'] .fi-button--night {
  background: var(--fi-night-raised);
  border-color: color-mix(in srgb, var(--fi-on-night) 28%, transparent);
}

:root[data-theme='night'] .fi-button--night:hover {
  border-color: color-mix(in srgb, var(--fi-on-night) 50%, transparent);
}

.fi-button--link {
  min-height: auto;
  padding: 0.25rem 0;
  background: none;
  color: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.fi-button:focus-visible {
  outline: 3px solid var(--fi-focus);
  outline-offset: 2px;
}

.fi-button:disabled,
.fi-button[aria-disabled='true'] {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Inside a rebuilt page (class="ds", assets/system.css) the button takes the
   design system's look: flat, ranked by fill (primary filled, secondary
   outlined, link underlined), 44px tall at least, and a spinner while
   aria-busy is true. Pages not rebuilt yet keep the look above. */
.ds .fi-button {
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-5);
  white-space: nowrap;
  border-radius: var(--ds-radius-control);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-body);
  font-weight: var(--ds-weight-medium);
  line-height: 1;
  box-shadow: none;
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    border-color var(--ds-dur-fast) var(--ds-ease-out),
    color var(--ds-dur-fast) var(--ds-ease-out),
    transform var(--ds-dur-fast) var(--ds-ease-press);
}

.ds .fi-button--block {
  min-height: var(--ds-control-h-lg);
}

.ds .fi-button--sm {
  padding: 0 var(--ds-space-4);
  font-size: var(--ds-size-small);
}

.ds .fi-button--primary {
  background: var(--ds-action);
  color: var(--ds-on-action);
  box-shadow: none;
}

.ds .fi-button--primary:hover {
  background: var(--ds-action-hover);
  color: var(--ds-on-action);
}

.ds .fi-button--primary:active {
  background: var(--ds-action-pressed);
  box-shadow: none;
}

.ds .fi-button--secondary {
  border-color: var(--ds-action);
  background: var(--ds-surface);
  color: var(--ds-action);
}

.ds .fi-button--secondary:hover {
  background: var(--ds-action-wash);
  color: var(--ds-action);
}

.ds .fi-button--night {
  background: var(--ds-band);
  color: var(--ds-on-band);
}

.ds .fi-button--night:hover {
  background: color-mix(in srgb, var(--ds-band) 85%, var(--ds-on-band));
}

.ds .fi-button:not(.fi-button--link):active {
  transform: scale(0.98);
}

/* Words, not a box: underlined, with a 44px tap area around them */
.ds .fi-button--link {
  position: relative;
  min-height: 0;
  padding: 0;
  background: none;
  color: var(--ds-action);
  font-size: inherit;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.ds .fi-button--link::after {
  content: '';
  position: absolute;
  inset: -0.75rem -0.25rem;
}

.ds .fi-button--link:hover {
  color: var(--ds-action-hover);
  text-decoration-thickness: 2px;
}

.ds .fi-button:disabled,
.ds .fi-button[aria-disabled='true'] {
  border-color: transparent;
  background: var(--ds-surface-sunken);
  color: var(--ds-text-muted);
  opacity: 1;
}

.ds .fi-button--link:disabled {
  background: none;
}

/* Working: keeps its colour, with a spinner before the words */
.ds .fi-button--primary[aria-busy='true'] {
  background: var(--ds-action);
  color: var(--ds-on-action);
  cursor: progress;
}

.ds .fi-button[aria-busy='true']::before {
  content: '';
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: fi-button-spin var(--ds-loop) linear infinite;
}

@keyframes fi-button-spin {
  to {
    transform: rotate(1turn);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds .fi-button:not(.fi-button--link):active {
    transform: none;
  }
}
</style>
