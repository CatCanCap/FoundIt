<script setup>
// "Back to top" button, shown after scrolling about one screen
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  // How far down, in pixels, before the arrow shows; defaults to one screen
  offset: { type: Number, default: 0 },
})

const isShown = ref(false)
let frame = 0

function check() {
  frame = 0
  const limit = props.offset || window.innerHeight
  isShown.value = window.scrollY > limit
}

// Scrolling fires many events a second; check at most once per frame
function onScroll() {
  if (!frame) frame = requestAnimationFrame(check)
}

function toTop() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  check()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  if (frame) cancelAnimationFrame(frame)
})
</script>

<template>
  <Transition name="fi-to-top">
    <button
      v-if="isShown"
      type="button"
      class="fi-to-top"
      aria-label="Back to top"
      title="Back to top"
      data-testid="back-to-top"
      @click="toTop"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d="M12 19V5M5 12l7-7 7 7"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </Transition>
</template>

<style scoped>
.fi-to-top {
  position: fixed;
  right: calc(1rem + env(safe-area-inset-right));
  bottom: calc(1rem + env(safe-area-inset-bottom));
  z-index: 30;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border: 0;
  border-radius: var(--fi-radius-pill);
  background: var(--fi-primary);
  color: #141a3f; /* ink stays dark on brass in night mode too, as on BaseButton */
  box-shadow: var(--fi-shadow-lift);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.15s ease;
}

.fi-to-top:hover {
  background: var(--fi-primary-strong);
  transform: translateY(-2px);
}

.fi-to-top:focus-visible {
  outline: 3px solid var(--fi-focus);
  outline-offset: 3px;
}

@media (min-width: 768px) {
  .fi-to-top {
    right: calc(1.5rem + env(safe-area-inset-right));
    bottom: calc(1.5rem + env(safe-area-inset-bottom));
  }
}

.fi-to-top-enter-active,
.fi-to-top-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.fi-to-top-enter-from,
.fi-to-top-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}

@media (prefers-reduced-motion: reduce) {
  .fi-to-top,
  .fi-to-top-enter-active,
  .fi-to-top-leave-active {
    transition: none;
  }
}

/* On a rebuilt page (one with class="ds", assets/system.css) the arrow takes
   the design system's look: a navy square that floats. The arrow sits in
   App.vue, outside the page, so it asks the whole document whether a rebuilt
   page is showing (:has) rather than sitting inside .ds. Pages not rebuilt
   yet keep the look above. */
:root:has(.ds) .fi-to-top {
  width: var(--ds-control-h-lg);
  height: var(--ds-control-h-lg);
  border-radius: var(--ds-radius-control);
  background: var(--ds-action);
  color: var(--ds-on-action);
  box-shadow: var(--ds-elev-2);
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    transform var(--ds-dur-fast) var(--ds-ease-press);
}

:root:has(.ds) .fi-to-top:hover {
  background: var(--ds-action-hover);
  transform: translateY(-2px);
}

:root:has(.ds) .fi-to-top:active {
  background: var(--ds-action-pressed);
  transform: scale(0.96);
}

:root:has(.ds) .fi-to-top:focus-visible {
  outline-color: var(--ds-focus);
}

:root:has(.ds) .fi-to-top-enter-active,
:root:has(.ds) .fi-to-top-leave-active {
  transition:
    opacity var(--ds-dur-base) var(--ds-ease-out),
    transform var(--ds-dur-base) var(--ds-ease-out);
}

@media (prefers-reduced-motion: reduce) {
  :root:has(.ds) .fi-to-top,
  :root:has(.ds) .fi-to-top-enter-active,
  :root:has(.ds) .fi-to-top-leave-active {
    transition: none;
  }

  :root:has(.ds) .fi-to-top:hover,
  :root:has(.ds) .fi-to-top:active {
    transform: none;
  }
}
</style>
