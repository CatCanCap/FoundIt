// A find's picture growing out of its card into the item's page. The feed notes
// which card was tapped, components/ui/PageTransition.vue runs the browser's
// View Transition, and the item page shows the picture straight away, before
// its data arrives, so there is something to grow into. Browsers without View
// Transitions, and people who ask their device for less motion, get the usual
// page fade, and the picture still shows straight away.
import { ref } from 'vue'

// The browser matches the old and new picture by this name
export const MORPH_NAME = 'fi-item-picture'

// True while the picture is growing: the fade and the wait before scrolling
// stay out of the way (PageTransition.vue, router/index.js)
export const morphing = ref(false)

let tapped = null

// Called as a card is clicked. A click with a modifier key opens a new tab, so
// this page isn't going anywhere.
//   path     the item page the card opens
//   picture  the card's picture element
//   seed     { title, photoUrl, category, tone } for the item page to show first
export function noteCardTap(event, path, picture, seed) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  tapped = { path, picture, seed }
}

// The picture to grow for a navigation to this path, or null to use the fade
export function tappedPicture(path) {
  if (tapped?.path !== path || !tapped.picture?.isConnected) return null
  if (typeof document.startViewTransition !== 'function') return null
  const allowsMotion = window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches
  return allowsMotion ? tapped.picture : null
}

// The item page takes what the card knew, once
export function takeCardSeed(path) {
  const seed = tapped?.path === path ? tapped.seed : null
  tapped = null
  return seed
}
