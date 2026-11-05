<script setup>
// A password input with an eye button that shows or hides what was typed, for
// the sign-in and register pages. It looks like TextField (components/ui).
//   v-model   the password
//   label     the visible label
//   help      a line under the input ("At least 8 characters.")
//   error     what is wrong, shown in red under the input ('' when nothing is)
//   meter     a new password's least length: that many dots under the input,
//             one filling for each character typed, all turning green once it
//             is long enough (0, the default, shows none)
// A small up-arrow shows in the box while Caps Lock is on.
// Emits reveal with true or false when the eye shows or hides the password.
// Every other attribute (autocomplete, required, data-testid…) goes onto the
// <input>, so tests and password managers see a normal password field.
import { computed, ref, useId } from 'vue'

defineOptions({ inheritAttrs: false })

const model = defineModel({ type: String, default: '' })

const props = defineProps({
  label: { type: String, default: 'Password' },
  help: { type: String, default: '' },
  error: { type: String, default: '' },
  meter: { type: Number, default: 0 },
})

const emit = defineEmits(['reveal'])

const id = useId()
const shown = ref(false)

function toggleShown() {
  shown.value = !shown.value
  emit('reveal', shown.value)
}
const capsLock = ref(false)

const filled = computed(() => Math.min(model.value.length, props.meter))
const longEnough = computed(() => props.meter > 0 && model.value.length >= props.meter)

// Caps Lock, from the last key pressed in the box (only keyboard events say)
function readCapsLock(event) {
  if (typeof event.getModifierState === 'function') {
    capsLock.value = event.getModifierState('CapsLock')
  }
}
</script>

<template>
  <div class="fi-password">
    <label class="fi-password__label" :for="id">{{ label }}</label>
    <div class="fi-password__box" :class="{ 'is-invalid': error }">
      <input
        :id="id"
        v-model="model"
        class="fi-password__input"
        :type="shown ? 'text' : 'password'"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? `${id}-error` : help ? `${id}-help` : undefined"
        v-bind="$attrs"
        @keydown="readCapsLock"
        @keyup="readCapsLock"
      />
      <Transition name="fi-caps">
        <span
          v-if="capsLock"
          class="fi-password__caps"
          role="img"
          aria-label="Caps Lock is on"
          title="Caps Lock is on"
          data-testid="password-caps"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 4l7 7h-4v5H9v-5H5z M9 19h6"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </svg>
        </span>
      </Transition>
      <button
        type="button"
        class="fi-password__toggle"
        :aria-label="shown ? 'Hide password' : 'Show password'"
        :aria-pressed="shown ? 'true' : 'false'"
        :aria-controls="id"
        :title="shown ? 'Hide password' : 'Show password'"
        data-testid="password-toggle"
        @click="toggleShown"
      >
        <!-- An open eye shows the password; a crossed-out eye hides it again -->
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2" />
          <path
            v-if="shown"
            d="M4 4l16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
    <p v-if="error" :id="`${id}-error`" class="fi-password__error" role="alert">{{ error }}</p>
    <ol
      v-else-if="meter"
      class="fi-password__meter"
      :class="{ 'is-long-enough': longEnough }"
      role="meter"
      :aria-valuemin="0"
      :aria-valuemax="meter"
      :aria-valuenow="filled"
      :aria-label="`${filled} of ${meter} characters`"
      data-testid="password-meter"
    >
      <li
        v-for="dot in meter"
        :key="dot"
        class="fi-password__dot"
        :class="{ 'is-filled': dot <= filled }"
        :style="{ '--i': dot }"
      ></li>
    </ol>
    <p v-else-if="help" :id="`${id}-help`" class="fi-password__help">{{ help }}</p>
  </div>
</template>

<style scoped>
.fi-password {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.fi-password__label {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--fi-ink);
}

.fi-password__box {
  display: flex;
  align-items: center;
  min-height: 2.75rem;
  border: 1.5px solid #c9cfdd;
  border-radius: var(--fi-radius-sm);
  background: #fff;
}

.fi-password__box:focus-within {
  border-color: var(--fi-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--fi-primary) 22%, transparent);
}

.fi-password__box.is-invalid {
  border-color: var(--fi-danger);
}

.fi-password__input {
  flex: 1;
  min-width: 0;
  padding: 0.55rem 0.8rem;
  border: 0;
  border-radius: var(--fi-radius-sm);
  background: transparent;
  color: #141a3f;
  font: inherit;
  font-size: 1rem; /* 16px stops phones zooming in on focus */
}

.fi-password__input:focus {
  outline: none;
}

.fi-password__toggle {
  display: grid;
  place-items: center;
  align-self: stretch;
  width: 2.6rem;
  padding: 0 0.25rem 0 0;
  border: 0;
  border-radius: 0 var(--fi-radius-sm) var(--fi-radius-sm) 0;
  background: none;
  color: #5c6282;
  cursor: pointer;
}

.fi-password__toggle:hover {
  color: #141a3f;
}

.fi-password__toggle:focus-visible {
  outline: 3px solid var(--fi-focus);
  outline-offset: -3px;
}

.fi-password__caps {
  display: grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 6px;
  background: var(--fi-notice-soft);
  color: var(--fi-brass-strong);
}

.fi-caps-enter-active,
.fi-caps-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.fi-caps-enter-from,
.fi-caps-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

/* One dot per character until the password is long enough; then the row
   turns green and gives a little hop, one dot after another */
.fi-password__meter {
  display: flex;
  gap: 0.3rem;
  margin: 0.15rem 0 0;
  padding: 0;
  list-style: none;
}

.fi-password__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: color-mix(in srgb, var(--fi-ink) 14%, transparent);
  transition:
    background-color 0.15s ease,
    transform 0.15s ease;
}

.fi-password__dot.is-filled {
  background: var(--fi-brass);
  transform: scale(1.15);
}

.is-long-enough .fi-password__dot {
  background: var(--fi-success, #2e7d4f);
  animation: fi-dot-hop 0.4s ease both;
  animation-delay: calc(var(--i) * 0.03s);
}

@keyframes fi-dot-hop {
  50% {
    transform: translateY(-4px) scale(1.2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fi-password__dot,
  .fi-caps-enter-active,
  .fi-caps-leave-active {
    transition: none;
  }

  .is-long-enough .fi-password__dot {
    animation: none;
  }
}

.fi-password__error {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--fi-danger);
}

.fi-password__help {
  margin: 0;
  font-size: 0.8rem;
  color: var(--fi-mist);
}
</style>
