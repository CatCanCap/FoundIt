<script setup>
// WS1 · A slim strip across the top of every page while the browser is
// offline ("You're offline. Reconnecting…"), then "Back online" in green for
// 2 seconds once the connection returns. Mounted once, in App.vue.
//
// It sits under the suspended banner and over the header. SuspendedBanner.vue
// writes its height into --ds-sticky-top on <html>; this strip sticks at that
// height, and while it shows it puts the two heights added together into
// --ds-sticky-top on <body>, so the header and the feed's search (which read
// the variable) stop under both. <body> is inside <html>, so its value wins
// for everything on the page without touching the banner's own value.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

// How long "Back online" stays before the strip goes away
const BACK_ONLINE_MS = 2000

// The strip is always in the page (empty and 0 tall while online), so screen
// readers hear each change in the words.
// 'online' (nothing shown), 'offline', or 'back' (the 2 seconds after)
const state = ref(
  typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online',
)
const strip = ref(null)
const top = ref(0)
let backTimer = null
let sizeWatcher = null
let bannerWatcher = null

// The suspended banner's height, as it wrote it on <html> ("38px"), else 0
function bannerHeight() {
  return parseFloat(document.documentElement.style.getPropertyValue('--ds-sticky-top')) || 0
}

function measure() {
  top.value = bannerHeight()
  const height = strip.value?.offsetHeight || 0
  if (height > 0) {
    document.body.style.setProperty('--ds-sticky-top', `${top.value + height}px`)
  } else {
    document.body.style.removeProperty('--ds-sticky-top')
  }
}

function goneOffline() {
  clearTimeout(backTimer)
  state.value = 'offline'
}

function backOnline() {
  if (state.value !== 'offline') return
  state.value = 'back'
  clearTimeout(backTimer)
  backTimer = setTimeout(() => {
    state.value = 'online'
  }, BACK_ONLINE_MS)
}

// Measure again once the words have changed on screen
watch(state, measure, { flush: 'post' })

onMounted(() => {
  window.addEventListener('offline', goneOffline)
  window.addEventListener('online', backOnline)
  // The banner appearing, going or wrapping onto more lines moves this strip
  if (window.MutationObserver) {
    bannerWatcher = new MutationObserver(measure)
    bannerWatcher.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
    })
  }
  if (window.ResizeObserver && strip.value) {
    sizeWatcher = new ResizeObserver(measure)
    sizeWatcher.observe(strip.value)
  }
  measure()
})

onBeforeUnmount(() => {
  window.removeEventListener('offline', goneOffline)
  window.removeEventListener('online', backOnline)
  clearTimeout(backTimer)
  bannerWatcher?.disconnect()
  sizeWatcher?.disconnect()
  document.body.style.removeProperty('--ds-sticky-top')
})
</script>

<template>
  <div
    ref="strip"
    class="offline-bar"
    :style="{ top: `${top}px` }"
    role="status"
    aria-live="polite"
    data-testid="offline-bar"
  >
    <Transition name="offline-bar" mode="out-in">
      <p
        v-if="state === 'offline'"
        key="offline"
        class="offline-bar__line"
        data-testid="offline-bar-offline"
      >
        <span class="ds-spinner offline-bar__spinner" aria-hidden="true"></span>
        You're offline. Reconnecting…
      </p>
      <p
        v-else-if="state === 'back'"
        key="back"
        class="offline-bar__line offline-bar__line--back"
        data-testid="offline-bar-back"
      >
        Back online
      </p>
    </Transition>
  </div>
</template>

<style scoped>
.offline-bar {
  position: sticky;
  z-index: 1039; /* just under the suspended banner (1040), over the header */
}

.offline-bar__line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-2);
  margin: 0;
  padding: var(--ds-space-1) var(--ds-space-4);
  background: var(--ds-surface-sunken);
  border-bottom: 1px solid var(--ds-border);
  color: var(--ds-text);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
  line-height: var(--ds-leading-small);
  text-align: center;
}

/* Back online: green words on a pale green, readable in day and night mode */
.offline-bar__line--back {
  background: color-mix(in srgb, var(--ds-success) 14%, var(--ds-surface));
  color: var(--ds-success);
}

.offline-bar__spinner {
  flex: none;
  width: var(--ds-space-3);
  height: var(--ds-space-3);
  color: var(--ds-text-muted);
}

.offline-bar-enter-active {
  transition: opacity var(--ds-dur-base) var(--ds-ease-out);
}

.offline-bar-leave-active {
  transition: opacity var(--ds-dur-base) var(--ds-ease-in);
}

.offline-bar-enter-from,
.offline-bar-leave-to {
  opacity: 0;
}

/* Less motion: the strip simply appears and goes, and the spinner holds
   still (the words already say it is reconnecting) */
@media (prefers-reduced-motion: reduce) {
  .offline-bar-enter-active,
  .offline-bar-leave-active {
    transition: none;
  }

  .offline-bar__spinner {
    animation: none;
  }
}
</style>
