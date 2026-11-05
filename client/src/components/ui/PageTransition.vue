<script setup>
// The router view with a fade between pages (query changes don't animate). A
// feed card opening its item grows its picture into the page instead (see
// utils/item-morph.js). Sets <html data-band> for the navy sign-in pages and
// moves focus to the new page's <h1>.
import { onBeforeUnmount } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { PAGE_FADE_OUT_MS } from '@/utils/design'
import { MORPH_NAME, morphing, tappedPicture } from '@/utils/item-morph'

const router = useRouter()

// The browser holds the old page on screen while the new one is put in place.
// If the new page never says it is ready, go ahead after this long.
const NEW_PAGE_WAIT_MS = 300

let newPageReady = null

// The browser takes a picture of the old page, swaps pages while it holds that
// on screen, then animates from one to the other. Holding this guard open is
// what lets the old picture be taken before the page changes.
const removeMorphGuard = router.beforeResolve((to) => {
  const picture = tappedPicture(to.path)
  if (!picture) return undefined
  return new Promise((resolve) => {
    morphing.value = true
    picture.style.viewTransitionName = MORPH_NAME
    const transition = document.startViewTransition(() => {
      const ready = new Promise((done) => {
        newPageReady = done
        setTimeout(done, NEW_PAGE_WAIT_MS)
      })
      resolve()
      return ready
    })
    // A skipped transition rejects these; the page has changed either way
    transition.ready.catch(() => {})
    transition.finished
      .catch(() => {})
      .finally(() => {
        morphing.value = false
        document.querySelector('[data-morph-target]')?.style.removeProperty('view-transition-name')
      })
  })
})
onBeforeUnmount(removeMorphGuard)

// Same fade length the router waits for before scrolling
document.documentElement.style.setProperty('--fi-page-fade-out', `${PAGE_FADE_OUT_MS}ms`)

function setBand(route) {
  if (route.meta.authBand) document.documentElement.dataset.band = 'night'
  else delete document.documentElement.dataset.band
}

setBand(router.currentRoute.value)
const removeGuard = router.beforeEach((to) => setBand(to))
onBeforeUnmount(removeGuard)

// Runs once the new page has faded in (not on the very first page)
function focusHeading(page) {
  const heading = page.querySelector?.('h1')
  if (!heading) return
  heading.setAttribute('tabindex', '-1')
  heading.focus({ preventScroll: true })
}

function pageEntered(page) {
  focusHeading(page)
  if (!newPageReady) return
  page.querySelector?.('[data-morph-target]')?.style.setProperty('view-transition-name', MORPH_NAME)
  newPageReady()
  newPageReady = null
}
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <Transition
      name="fi-page"
      :mode="morphing ? undefined : 'out-in'"
      appear
      :css="!morphing"
      @after-enter="pageEntered"
    >
      <component :is="Component" :key="route.path" />
    </Transition>
  </RouterView>
</template>

<style>
/* Not scoped: the classes land on each page's root element */

/* The heading takes focus after navigation; no focus ring needed */
h1[tabindex='-1']:focus {
  outline: none;
}

html[data-band='night'],
html[data-band='night'] body {
  background: #0a1030;
}

.fi-page-leave-active {
  transition: opacity var(--fi-page-fade-out, 160ms) ease-in;
}

.fi-page-enter-active,
.fi-page-appear-active {
  transition:
    opacity 0.3s ease-out,
    transform 0.36s cubic-bezier(0.22, 1, 0.36, 1);
}

.fi-page-leave-to,
.fi-page-enter-from,
.fi-page-appear-from {
  opacity: 0;
}

.fi-page-enter-from,
.fi-page-appear-from {
  transform: translateY(10px);
}

/* A feed card opening its item: the rest of the page cross-fades while the
   picture grows. Both pictures fill the shape as it changes, like a photo. */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: var(--ds-dur-base);
  animation-timing-function: var(--ds-ease-out);
}

::view-transition-group(fi-item-picture) {
  overflow: hidden;
  border-radius: var(--ds-radius-surface);
  animation-duration: var(--ds-dur-slow);
  animation-timing-function: var(--ds-ease-out);
}

::view-transition-old(fi-item-picture),
::view-transition-new(fi-item-picture) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (prefers-reduced-motion: reduce) {
  .fi-page-enter-active,
  .fi-page-appear-active,
  .fi-page-leave-active {
    transition: opacity 0.12s linear;
  }

  .fi-page-enter-from,
  .fi-page-appear-from {
    transform: none;
  }
}
</style>
