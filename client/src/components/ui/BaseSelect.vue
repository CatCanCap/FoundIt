<script setup>
// The app's drop-down, in the design system's colours. Every page uses this
// instead of a bare <select>, so they all look the same in day and night mode.
//
// It is still a real <select> underneath, so keyboards, screen readers, phone
// pickers and the tests (setValue, selectOption) work as usual. In browsers
// that let a page style the open list (Chrome and Edge for now) the list
// gets our colours too; elsewhere the browser draws the open list.
//
//   <BaseSelect id="report-category" v-model="form.category" placeholder="Pick one">
//     <option v-for="c in categories" :key="c.name" :value="c.name">{{ c.name }}</option>
//   </BaseSelect>
//
// Other attributes (id, required, disabled, aria-*, data-testid) go to the
// <select>; class and style go to the outer box.
import { computed, useAttrs } from 'vue'

defineOptions({ inheritAttrs: false })

const model = defineModel({ type: [String, Number], default: '' })

defineProps({
  // Shown first, greyed out, until something is picked
  placeholder: { type: String, default: '' },
  // 'md' (44px) beside the report forms' inputs, 'lg' (48px) beside TextField
  size: { type: String, default: 'md', validator: (value) => ['md', 'lg'].includes(value) },
})

// Nothing picked yet (null) shows the placeholder
const value = computed({
  get: () => model.value ?? '',
  set: (next) => (model.value = next),
})

const attrs = useAttrs()
const selectAttrs = computed(() =>
  Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style')),
)
</script>

<template>
  <span class="ds-select" :class="[`ds-select--${size}`, attrs.class]" :style="attrs.style">
    <select
      v-model="value"
      class="ds-select__control"
      :class="{ 'is-placeholder': placeholder && value === '' }"
      v-bind="selectAttrs"
    >
      <option v-if="placeholder" class="ds-select__placeholder" value="" disabled>
        {{ placeholder }}
      </option>
      <slot />
    </select>
    <svg class="ds-select__arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 6l4 4 4-4" />
    </svg>
  </span>
</template>

<style scoped>
.ds-select {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
}

.ds-select__control {
  appearance: none;
  display: block;
  width: 100%;
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-7) 0 var(--ds-space-3);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background-color: var(--ds-surface);
  color: var(--ds-text);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-body); /* 16px stops phones zooming in on focus */
  line-height: var(--ds-leading-body);
  text-overflow: ellipsis;
  color-scheme: light;
  cursor: pointer;
  transition: border-color var(--ds-dur-fast) var(--ds-ease-out);
}

.ds-select--lg .ds-select__control {
  min-height: var(--ds-control-h-lg);
  padding-left: var(--ds-space-4);
}

/* The browser's own open list follows night mode where we can't style it */
:global(:root[data-theme='night'] .ds-select__control) {
  color-scheme: dark;
}

.ds-select__control.is-placeholder {
  color: var(--ds-text-muted);
}

.ds-select__control:hover:not(:disabled) {
  border-color: var(--ds-text-muted);
}

.ds-select__control:focus {
  outline: none;
}

.ds-select__control:focus-visible {
  border-color: var(--ds-action);
  outline: 3px solid var(--ds-focus);
  outline-offset: 1px;
}

/* The field a form's message is about */
.ds-select__control[aria-invalid='true'] {
  border-color: var(--ds-danger);
}

.ds-select__control:disabled {
  background-color: var(--ds-surface-sunken);
  color: var(--ds-text-muted);
  cursor: not-allowed;
}

/* Our arrow, drawn in the text colour so it follows night mode */
.ds-select__arrow {
  position: absolute;
  top: 50%;
  right: var(--ds-space-3);
  width: var(--ds-space-4);
  height: var(--ds-space-4);
  translate: 0 -50%;
  fill: none;
  stroke: var(--ds-text-muted);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
  transition: rotate var(--ds-dur-base) var(--ds-ease-out);
}

.ds-select:hover .ds-select__arrow {
  stroke: var(--ds-text);
}

.ds-select__control:disabled + .ds-select__arrow {
  stroke: var(--ds-text-muted);
  opacity: 0.6;
}

/* The open list, where the browser lets us style it */
@supports (appearance: base-select) {
  .ds-select__control,
  .ds-select__control::picker(select) {
    appearance: base-select;
  }

  .ds-select__control {
    display: flex;
    align-items: center;
  }

  .ds-select__control::picker-icon {
    display: none;
  }

  .ds-select__control:open + .ds-select__arrow {
    rotate: 180deg;
  }

  .ds-select__control::picker(select) {
    max-height: min(20rem, 50vh);
    margin-block: var(--ds-space-1);
    padding: var(--ds-space-1);
    border: 1px solid var(--ds-border-control);
    border-radius: var(--ds-radius-control);
    background: var(--ds-surface);
    color: var(--ds-text);
    box-shadow: var(--ds-elev-2);
    opacity: 1;
    translate: 0 0;
    transition:
      opacity var(--ds-dur-fast) var(--ds-ease-out),
      translate var(--ds-dur-fast) var(--ds-ease-out),
      overlay var(--ds-dur-fast) allow-discrete,
      display var(--ds-dur-fast) allow-discrete;
  }

  .ds-select__control:not(:open)::picker(select) {
    opacity: 0;
    translate: 0 calc(var(--ds-space-1) * -1);
  }

  @starting-style {
    .ds-select__control:open::picker(select) {
      opacity: 0;
      translate: 0 calc(var(--ds-space-1) * -1);
    }
  }

  .ds-select :deep(option) {
    display: flex;
    align-items: center;
    gap: var(--ds-space-2);
    min-height: var(--ds-control-h);
    padding: 0 var(--ds-space-3);
    border-radius: var(--ds-radius-control);
    font-size: var(--ds-size-body);
    cursor: pointer;
  }

  .ds-select :deep(option:hover),
  .ds-select :deep(option:focus-visible) {
    outline: none;
    background: var(--ds-action-wash);
  }

  .ds-select :deep(option:checked) {
    color: var(--ds-action);
    font-weight: var(--ds-weight-medium);
  }

  .ds-select :deep(option::checkmark) {
    order: 1;
    margin-left: auto;
  }

  /* The "Pick one" line is a hint, not a choice, so the open list leaves it out */
  .ds-select .ds-select__placeholder {
    display: none;
  }

  .ds-select :deep(option:disabled) {
    color: var(--ds-text-muted);
    cursor: default;
  }

  .ds-select :deep(option:disabled:hover) {
    background: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds-select__arrow,
  .ds-select__control::picker(select) {
    transition: none;
  }
}
</style>
