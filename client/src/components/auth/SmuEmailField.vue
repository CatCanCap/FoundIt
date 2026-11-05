<script setup>
// The SMU email box for the sign-in and register pages: a TextField that
// offers the rest of the address as chips once "@" is typed (tap one to fill
// it in), and shows a green tick inside the box once the address is a whole
// SMU one. Other attributes and listeners (autocomplete, data-testid, @blur…)
// go onto the TextField, and so onto the <input>.
//   v-model  the address
//   label    the visible label
//   error    what is wrong, in red under the box
// Emits pick after a chip fills the address in, so the page can check it.
import { computed, ref } from 'vue'
import TextField from '@/components/ui/TextField.vue'
import { emailSuggestions, isSmuEmail } from '@/utils/sign-in'

defineOptions({ inheritAttrs: false })

const model = defineModel({ type: String, default: '' })

defineProps({
  label: { type: String, default: 'SMU email' },
  error: { type: String, default: '' },
})

const emit = defineEmits(['pick'])

const root = ref(null)
const suggestions = computed(() => emailSuggestions(model.value))
const valid = computed(() => isSmuEmail(model.value))

function pick(address) {
  model.value = address
  emit('pick', address)
  // Back to the box, so typing (or Tab to the password) carries on
  root.value?.querySelector('input')?.focus()
}
</script>

<template>
  <div ref="root" class="fi-smu-email" :class="{ 'is-valid': valid && !error }">
    <TextField v-model="model" :label="label" type="email" :error="error" v-bind="$attrs" />
    <TransitionGroup
      v-if="suggestions.length"
      tag="ul"
      name="fi-chip"
      class="fi-smu-email__chips"
      aria-label="Finish the address"
    >
      <li v-for="(address, index) in suggestions" :key="address" :style="{ '--i': index }">
        <button
          type="button"
          class="fi-smu-email__chip"
          data-testid="email-suggestion"
          @mousedown.prevent
          @click="pick(address)"
        >
          @{{ address.split('@')[1] }}
        </button>
      </li>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.fi-smu-email {
  display: grid;
  gap: 0.45rem;
}

/* A whole SMU address: a green edge and a tick at the end of the box */
.fi-smu-email.is-valid :deep(.fi-field__input) {
  padding-right: 2.4rem;
  border-color: var(--fi-success, #2e7d4f);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Ccircle cx='10' cy='10' r='9' fill='%232e7d4f'/%3E%3Cpath d='M6 10.5l2.6 2.6L14 7.5' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-position: right 0.75rem center;
  background-repeat: no-repeat;
  background-size: 1.15rem;
  animation: fi-smu-email-ok 0.3s ease;
}

@keyframes fi-smu-email-ok {
  from {
    background-size: 0;
  }
}

.fi-smu-email__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.fi-smu-email__chip {
  min-height: 2rem;
  padding: 0.2rem 0.7rem;
  border: 1px solid color-mix(in srgb, var(--fi-primary) 30%, transparent);
  border-radius: var(--fi-radius-pill);
  background: var(--fi-primary-soft);
  color: var(--fi-primary);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.15s ease;
}

.fi-smu-email__chip:hover {
  background: color-mix(in srgb, var(--fi-primary) 16%, transparent);
}

.fi-smu-email__chip:active {
  transform: scale(0.96);
}

.fi-smu-email__chip:focus-visible {
  outline: 3px solid var(--fi-focus);
  outline-offset: 2px;
}

/* The chips pop in one after another and fade as the choice narrows */
.fi-chip-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.3, 1.3, 0.5, 1);
  transition-delay: calc(var(--i, 0) * 0.04s);
}

.fi-chip-leave-active {
  position: absolute;
  transition: opacity 0.12s ease;
}

.fi-chip-enter-from {
  opacity: 0;
  transform: translateY(-4px) scale(0.92);
}

.fi-chip-leave-to {
  opacity: 0;
}

.fi-chip-move {
  transition: transform 0.2s ease;
}

@media (prefers-reduced-motion: reduce) {
  .fi-smu-email.is-valid :deep(.fi-field__input) {
    animation: none;
  }

  .fi-chip-enter-active,
  .fi-chip-move,
  .fi-smu-email__chip {
    transition: none;
  }
}
</style>
