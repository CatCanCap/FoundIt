<script setup>
// WS2. Round colour swatches with their names. Up to three can be picked; the
// first picked is the main colour, and each picked swatch shows its number.
// Tapping a picked swatch again removes it.
//   colours     the list from GET /api/colours: [{ name, hex }]
//   modelValue  the picked names, main colour first (use v-model)
//   max         how many can be picked
//   name        a name for the checkboxes and their test ids
import { computed } from 'vue'
import { MAX_COLOURS } from '@/utils/report'

const props = defineProps({
  colours: { type: Array, required: true },
  modelValue: { type: Array, default: () => [] },
  max: { type: Number, default: MAX_COLOURS },
  name: { type: String, default: 'colour' },
})
const emit = defineEmits(['update:modelValue'])

const isFull = computed(() => props.modelValue.length >= props.max)

// "Main colour: Navy, with White and Silver."
const picked = computed(() => {
  const [main, ...others] = props.modelValue
  if (others.length === 0) return `Main colour: ${main}.`
  const last = others.pop()
  const rest = others.length > 0 ? `${others.join(', ')} and ${last}` : last
  return `Main colour: ${main}, with ${rest}.`
})

// What the finder can do next
const nextStep = computed(() => {
  const left = props.max - props.modelValue.length
  if (left === 0) return 'That’s the most. Tap one to remove it.'
  if (props.modelValue.length === 1) {
    return `Add up to ${left} more if it has other colours.`
  }
  return `You can add ${left} more.`
})

// 1 for the main colour, 2 and 3 for the others, 0 when not picked
function position(name) {
  return props.modelValue.indexOf(name) + 1
}

// Picks a colour, or removes it if it was already picked
function toggle(name) {
  if (props.modelValue.includes(name)) {
    emit(
      'update:modelValue',
      props.modelValue.filter((picked) => picked !== name),
    )
  } else if (!isFull.value) {
    emit('update:modelValue', [...props.modelValue, name])
  }
}

// Clear and Multicolour have no single colour, so they get a pattern
function swatchBackground(entry) {
  if (entry.hex) return entry.hex
  if (entry.name === 'Multicolour') {
    return 'conic-gradient(#e0645a, #f5c542, #5e8c5a, #2f6fd6, #7b4ba0, #e0645a)'
  }
  return 'linear-gradient(135deg, rgb(255 255 255 / 85%), rgb(200 215 235 / 45%))'
}
</script>

<template>
  <div class="colour-picker">
    <div class="colour-picker__swatches d-flex flex-wrap">
      <label
        v-for="entry in colours"
        :key="entry.name"
        class="colour-swatch d-flex flex-column align-items-center gap-1"
        :class="{ 'is-on': position(entry.name) > 0, 'is-off': isFull && !position(entry.name) }"
      >
        <input
          type="checkbox"
          :name="name"
          class="visually-hidden"
          :value="entry.name"
          :checked="position(entry.name) > 0"
          :disabled="isFull && !position(entry.name)"
          :data-testid="`${name}-${entry.name}`"
          @change="toggle(entry.name)"
        />
        <span
          class="colour-swatch__chip position-relative rounded-circle"
          :style="{ background: swatchBackground(entry) }"
          aria-hidden="true"
        >
          <span
            v-if="position(entry.name)"
            class="colour-swatch__order position-absolute d-flex align-items-center justify-content-center rounded-circle"
          >
            {{ position(entry.name) }}
          </span>
        </span>
        <span class="colour-swatch__name text-center">{{ entry.name }}</span>
      </label>
    </div>
    <p class="colour-picker__hint mb-0" aria-live="polite" :data-testid="`${name}-hint`">
      <template v-if="modelValue.length === 0">
        Pick up to {{ max }}, starting with the main colour. Not sure? Leave it blank.
      </template>
      <template v-else>
        <strong>{{ picked }}</strong> {{ nextStep }}
      </template>
    </p>
  </div>
</template>

<style scoped>
/* Used only inside rebuilt pages (the found and lost reports, class="ds"), so
   it takes the design system's tokens directly. A picked swatch gets a navy
   ring and its number; the rest stay plain. */
.colour-picker__swatches {
  gap: var(--ds-space-2) var(--ds-space-4);
}

.colour-swatch {
  width: 3rem;
  cursor: pointer;
}

.colour-swatch.is-off {
  cursor: not-allowed;
  opacity: 0.45;
}

.colour-swatch__chip {
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid color-mix(in srgb, var(--ds-text) 18%, transparent);
  transition:
    box-shadow var(--ds-dur-fast) var(--ds-ease-out),
    transform var(--ds-dur-fast) var(--ds-ease-press);
}

.colour-swatch:not(.is-off):hover .colour-swatch__chip {
  transform: scale(1.06);
}

.colour-swatch.is-on .colour-swatch__chip {
  box-shadow:
    0 0 0 3px var(--ds-surface),
    0 0 0 5px var(--ds-action);
}

.colour-swatch:has(:focus-visible) .colour-swatch__chip {
  outline: 3px solid var(--ds-focus);
  outline-offset: 4px;
}

/* The small 1, 2 or 3 on a picked swatch */
.colour-swatch__order {
  top: calc(-1 * var(--ds-space-2));
  right: calc(-1 * var(--ds-space-2));
  width: 1.25rem;
  height: 1.25rem;
  background: var(--ds-action);
  color: var(--ds-on-action);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
}

.colour-swatch__name {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
}

.colour-swatch.is-on .colour-swatch__name {
  color: var(--ds-text);
  font-weight: var(--ds-weight-bold);
}

.colour-picker__hint {
  margin-top: var(--ds-space-3);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.colour-picker__hint strong {
  color: var(--ds-text);
  font-weight: var(--ds-weight-medium);
}

@media (prefers-reduced-motion: reduce) {
  .colour-swatch__chip {
    transition: none;
  }

  .colour-swatch:not(.is-off):hover .colour-swatch__chip {
    transform: none;
  }
}
</style>
