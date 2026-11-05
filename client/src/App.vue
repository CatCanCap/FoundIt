<script setup>
// Every page, with a gentle transition between them (components/ui/PageTransition.vue),
// and the "back to top" arrow that shows once a page is scrolled down
import PageTransition from './components/ui/PageTransition.vue'
// WS5: new-message alerts on every page
import HandoffNotifier from './components/handoff/HandoffNotifier.vue'
// Feature 5: "An admin decided the dispute about …" on every page
import DisputeNotifier from './components/safeguards/DisputeNotifier.vue'
import BackToTop from './components/ui/BackToTop.vue'
// WS1: tells a suspended account what it can still do
import SuspendedBanner from './components/SuspendedBanner.vue'
// WS1: "You're offline. Reconnecting…" under that banner while the browser is offline
import OfflineBar from './components/ui/OfflineBar.vue'
</script>

<template>
  <SuspendedBanner />
  <OfflineBar />
  <PageTransition />
  <HandoffNotifier />
  <DisputeNotifier />
  <BackToTop />
</template>
