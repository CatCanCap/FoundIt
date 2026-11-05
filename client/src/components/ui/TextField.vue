<script setup>
// Labelled text input with optional help and error text.
// Other attributes are passed to the <input>.
import { useId } from 'vue'

defineOptions({ inheritAttrs: false })

const model = defineModel({ type: String, default: '' })

defineProps({
  label: { type: String, required: true },
  help: { type: String, default: '' },
  error: { type: String, default: '' },
})

const id = useId()
</script>

<template>
  <div class="fi-field">
    <label class="fi-field__label" :for="id">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      class="fi-field__input"
      :class="{ 'is-invalid': error }"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error ? `${id}-error` : help ? `${id}-help` : undefined"
      v-bind="$attrs"
    />
    <p v-if="error" :id="`${id}-error`" class="fi-field__error" role="alert">{{ error }}</p>
    <p v-else-if="help" :id="`${id}-help`" class="fi-field__help">{{ help }}</p>
  </div>
</template>

<style scoped>
.fi-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.fi-field__label {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--fi-ink);
}

.fi-field__input {
  width: 100%;
  min-height: 2.75rem;
  padding: 0.55rem 0.8rem;
  border: 1.5px solid #c9cfdd;
  border-radius: var(--fi-radius-sm);
  background: #fff;
  color: #141a3f;
  font: inherit;
  font-size: 1rem; /* 16px stops phones zooming in on focus */
}

.fi-field__input:focus {
  outline: none;
  border-color: var(--fi-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--fi-primary) 22%, transparent);
}

.fi-field__input.is-invalid {
  border-color: var(--fi-danger);
}

.fi-field__error {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--fi-danger);
}

.fi-field__help {
  margin: 0;
  font-size: 0.8rem;
  color: var(--fi-mist);
}

/* Inside a rebuilt page (class="ds", assets/system.css): the design system's
   field, which follows night mode. Pages not rebuilt yet keep the look above. */
.ds .fi-field {
  gap: var(--ds-space-2);
}

.ds .fi-field__label {
  color: var(--ds-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
}

.ds .fi-field__input {
  min-height: var(--ds-control-h-lg);
  padding: 0 var(--ds-space-4);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-text);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-body);
  transition: border-color var(--ds-dur-fast) var(--ds-ease-out);
}

.ds .fi-field__input::placeholder {
  color: var(--ds-text-muted);
}

.ds .fi-field__input:hover {
  border-color: var(--ds-text-muted);
}

.ds .fi-field__input:focus {
  border-color: var(--ds-action);
  box-shadow: none;
  outline: 3px solid var(--ds-focus);
  outline-offset: 1px;
}

.ds .fi-field__input.is-invalid {
  border-color: var(--ds-danger);
}

/* The browser's saved-address fill, in our colours instead of its own */
.ds .fi-field__input:-webkit-autofill {
  -webkit-box-shadow: 0 0 0 100px var(--ds-surface) inset;
  -webkit-text-fill-color: var(--ds-text);
}

.ds .fi-field__error,
.ds .fi-field__help {
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
}

.ds .fi-field__error {
  color: var(--ds-danger);
  font-weight: var(--ds-weight-medium);
}

.ds .fi-field__help {
  color: var(--ds-text-muted);
}
</style>
