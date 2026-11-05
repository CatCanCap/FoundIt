<script setup>
// Two or three options, one picked. Radio buttons underneath, so arrow keys work.
//   v-model  the picked option's value
//   options  [{ value: 'student', label: 'Student' }, ...]
//   label    what the choice is about, read out by screen readers
//   tone     light (on the navy bands) or ink (on cream)
import { computed, useId } from 'vue'

const model = defineModel({ type: String, required: true })

const props = defineProps({
  options: { type: Array, required: true },
  label: { type: String, required: true },
  tone: { type: String, default: 'ink' },
})

const name = useId()

// The highlight slides under the picked option
const picked = computed(() =>
  Math.max(
    0,
    props.options.findIndex((option) => option.value === model.value),
  ),
)
</script>

<template>
  <fieldset class="fi-toggle" :class="`fi-toggle--${tone}`">
    <legend class="fi-toggle__legend">{{ label }}</legend>
    <div class="fi-toggle__track" :style="{ '--count': options.length, '--picked': picked }">
      <span class="fi-toggle__thumb" aria-hidden="true"></span>
      <label
        v-for="option in options"
        :key="option.value"
        class="fi-toggle__option"
        :class="{ 'fi-toggle__option--on': model === option.value }"
      >
        <input
          v-model="model"
          type="radio"
          class="fi-visually-hidden"
          :name="name"
          :value="option.value"
          :data-testid="`toggle-${option.value}`"
        />
        {{ option.label }}
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.fi-toggle {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  border: 0;
}

/* The legend sits beside the pills, like "Sign in as" in the design */
.fi-toggle__legend {
  float: left;
  width: auto;
  margin: 0;
  font-size: 0.85rem;
  font-weight: 500;
}

.fi-toggle__track {
  position: relative;
  display: inline-grid;
  grid-auto-columns: 1fr;
  grid-auto-flow: column;
  padding: 0.2rem;
  border-radius: var(--fi-radius-pill);
}

/* Same width as one option; moves one option's width per step */
.fi-toggle__thumb {
  position: absolute;
  top: 0.2rem;
  bottom: 0.2rem;
  left: 0.2rem;
  width: calc((100% - 0.4rem) / var(--count));
  border-radius: var(--fi-radius-pill);
  background: var(--fi-primary);
  box-shadow: 0 2px 8px rgb(0 0 0 / 18%);
  transform: translateX(calc(var(--picked) * 100%));
  transition: transform 0.32s cubic-bezier(0.34, 1.4, 0.64, 1);
}

.fi-toggle__option {
  position: relative; /* above the thumb */
  padding: 0.35rem 1rem;
  border-radius: var(--fi-radius-pill);
  font-size: 0.85rem;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
  transition: color 0.25s ease;
}

@media (prefers-reduced-motion: reduce) {
  .fi-toggle__thumb {
    transition: none;
  }
}

.fi-toggle__option:has(:focus-visible) {
  outline: 3px solid var(--fi-focus);
  outline-offset: 2px;
}

.fi-toggle__option--on {
  color: var(--fi-on-primary);
}

/* On the navy sign-in band a blue thumb would vanish, so it is white there */
.fi-toggle--light .fi-toggle__thumb {
  background: #fff;
}

.fi-toggle--light .fi-toggle__option--on {
  color: #141a3f;
}

.fi-toggle--light .fi-toggle__legend {
  color: rgb(238 240 248 / 75%);
}

.fi-toggle--light .fi-toggle__track {
  background: rgb(255 255 255 / 8%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 12%);
}

.fi-toggle--light .fi-toggle__option:not(.fi-toggle__option--on) {
  color: rgb(238 240 248 / 80%);
}

.fi-toggle--ink .fi-toggle__legend {
  color: var(--fi-mist);
}

.fi-toggle--ink .fi-toggle__track {
  background: var(--fi-raised);
  box-shadow: inset 0 0 0 1px var(--fi-line);
}

/* Inside a rebuilt page (class="ds", assets/system.css): a sunken well with a
   white tab under the picked option, which also turns bold and dark, so the
   choice shows by more than colour. Square-ish corners, 44px tall. On a navy
   band (tone light) the well and tab come from the band's colours. Pages not
   rebuilt yet keep the look above. */
.ds .fi-toggle {
  flex-wrap: wrap;
  gap: var(--ds-space-2) var(--ds-space-3);
}

.ds .fi-toggle__legend {
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
}

.ds .fi-toggle__track {
  padding: var(--ds-space-1);
  border-radius: var(--ds-radius-control);
}

.ds .fi-toggle__thumb {
  top: var(--ds-space-1);
  bottom: var(--ds-space-1);
  left: var(--ds-space-1);
  width: calc((100% - 2 * var(--ds-space-1)) / var(--count));
  border-radius: calc(var(--ds-radius-control) - 2px);
  transition: transform var(--ds-dur-base) var(--ds-ease-out);
}

.ds .fi-toggle__option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-4);
  white-space: nowrap;
  border-radius: calc(var(--ds-radius-control) - 2px);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-regular);
  transition: color var(--ds-dur-fast) var(--ds-ease-out);
}

.ds .fi-toggle__option:has(:focus-visible) {
  outline: 3px solid var(--ds-focus);
}

.ds .fi-toggle__option--on {
  font-weight: var(--ds-weight-bold);
}

.ds .fi-toggle--ink .fi-toggle__legend {
  color: var(--ds-text-muted);
}

.ds .fi-toggle--ink .fi-toggle__track {
  background: var(--ds-surface-sunken);
  box-shadow: inset 0 0 0 1px var(--ds-border);
}

.ds .fi-toggle--ink .fi-toggle__thumb {
  background: var(--ds-surface);
  box-shadow: 0 0 0 1px var(--ds-border-control);
}

.ds .fi-toggle--ink .fi-toggle__option {
  color: var(--ds-text-muted);
}

.ds .fi-toggle--ink .fi-toggle__option:hover,
.ds .fi-toggle--ink .fi-toggle__option--on {
  color: var(--ds-text);
}

.ds .fi-toggle--light .fi-toggle__legend {
  color: var(--ds-on-band-muted);
}

.ds .fi-toggle--light .fi-toggle__track {
  background: color-mix(in srgb, var(--ds-on-band) 8%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ds-on-band) 16%, transparent);
}

.ds .fi-toggle--light .fi-toggle__thumb {
  background: var(--ds-on-band);
  box-shadow: none;
}

.ds .fi-toggle--light .fi-toggle__option:not(.fi-toggle__option--on) {
  color: var(--ds-on-band-muted);
}

.ds .fi-toggle--light .fi-toggle__option--on {
  color: var(--ds-band);
}
</style>
