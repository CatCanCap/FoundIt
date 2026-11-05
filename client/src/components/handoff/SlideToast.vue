<script setup>
// A small notice that slides in at the bottom of the screen and goes away by
// itself after a few seconds (WS5: "New message from the finder").
//   show      true to slide it in
//   duration  milliseconds before it hides itself (0 keeps it until closed)
//   action    words on its button ("See it", "Open chat"); empty hides it
//   place     'bottom' (default) or 'top', under the header, so it never sits
//             over a chat's message box and Send button
// Emits action when the button is pressed, and close when it hides.
// People who ask their device for less motion get a fade instead of a slide.
// Built on Bootstrap's toast markup (toast, toast-body, btn-close); Vue shows
// and hides it, so no Bootstrap JavaScript is needed.
import { onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  duration: { type: Number, default: 5000 },
  action: { type: String, default: '' },
  place: { type: String, default: 'bottom' },
})

const emit = defineEmits(['action', 'close'])

let timer = null

function startTimer() {
  clearTimeout(timer)
  if (props.show && props.duration > 0) timer = setTimeout(() => emit('close'), props.duration)
}

// Hovering keeps it on screen; leaving starts the countdown again
function pause() {
  clearTimeout(timer)
}

watch(() => props.show, startTimer, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Transition name="slide-toast" appear>
    <div
      v-if="show"
      class="toast show slide-toast"
      :class="`slide-toast--${place}`"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="slide-toast"
      @mouseenter="pause"
      @mouseleave="startTimer"
    >
      <div class="d-flex align-items-center gap-2 p-2 ps-3">
        <span class="slide-toast__dot rounded-circle flex-shrink-0" aria-hidden="true"></span>
        <span class="toast-body p-0 flex-grow-1 fw-semibold"><slot /></span>
        <button
          v-if="action"
          type="button"
          class="btn btn-sm slide-toast__action flex-shrink-0"
          data-testid="slide-toast-action"
          @click="emit('action')"
        >
          {{ action }}
        </button>
        <button
          type="button"
          class="btn-close slide-toast__close flex-shrink-0 m-1"
          aria-label="Close"
          data-testid="slide-toast-close"
          @click="emit('close')"
        ></button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Bootstrap's toast, in FoundIt colours, a card fixed to the right-hand side
   of the screen. Bootstrap gives it width: 26rem (--bs-toast-max-width), and
   on a phone it shrinks to fit inside the 1rem margins. */
.slide-toast {
  --bs-toast-bg: var(--fi-raised);
  --bs-toast-color: var(--fi-ink);
  --bs-toast-border-color: var(--fi-line);
  --bs-toast-border-radius: var(--fi-radius);
  --bs-toast-max-width: 26rem;
  --bs-toast-font-size: 0.9rem;
  --bs-toast-box-shadow: var(--fi-shadow-lift);
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 1090;
  max-width: calc(100vw - 2rem);
}

.slide-toast--top {
  top: 5.5rem;
  bottom: auto;
}

.slide-toast__dot {
  width: 0.6rem;
  height: 0.6rem;
  background: var(--fi-brass);
}

.slide-toast .toast-body {
  min-width: 0;
  overflow-wrap: anywhere;
}

.slide-toast__action {
  --bs-btn-color: var(--fi-on-primary);
  --bs-btn-bg: var(--fi-primary);
  --bs-btn-hover-color: var(--fi-on-primary);
  --bs-btn-hover-bg: var(--fi-primary-strong);
  --bs-btn-active-color: var(--fi-on-primary);
  --bs-btn-active-bg: var(--fi-primary-strong);
  --bs-btn-focus-box-shadow: 0 0 0 3px var(--fi-focus);
  --bs-btn-font-weight: 700;
  min-height: 2rem;
}

.slide-toast__close {
  --bs-btn-close-focus-shadow: 0 0 0 3px var(--fi-focus);
}

/* Night mode: Bootstrap's own trick for a light close icon */
:root[data-theme='night'] .slide-toast__close {
  filter: invert(1) grayscale(100%) brightness(200%);
}

.slide-toast-enter-active,
.slide-toast-leave-active {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.slide-toast-enter-from,
.slide-toast-leave-to {
  opacity: 0;
  transform: translateY(1.5rem);
}

.slide-toast--top.slide-toast-enter-from,
.slide-toast--top.slide-toast-leave-to {
  transform: translateY(-1.5rem);
}

@media (prefers-reduced-motion: reduce) {
  .slide-toast-enter-from,
  .slide-toast-leave-to {
    transform: none;
  }
}
</style>
