<script setup>
// "An admin decided the dispute about Black Coach wallet", sliding in under
// the header like the handoff alerts (components/handoff/HandoffNotifier.vue).
// Mounted once in App.vue so it shows on every page. It checks your disputes
// (stores/disputes.js) when the app opens, on every page change and every 30
// seconds. Each verdict pops up once; "See verdict" opens it on My disputes.
// Several verdicts at once share one notice ("An admin decided 3 of your
// disputes"), and closing it closes it for all of them, so it never comes
// straight back with the next one.
//
// It waits while a handoff alert is showing, so the two never sit on top of
// each other, and stays quiet on My disputes, where the verdicts are listed.
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SlideToast from '@/components/handoff/SlideToast.vue'
import { useDisputesStore } from '@/stores/disputes'
import { useHandoffsStore } from '@/stores/handoffs'

const CHECK_EVERY_MS = 30000

const disputes = useDisputesStore()
const handoffs = useHandoffsStore()
const route = useRoute()
const router = useRouter()

const onDisputesPage = computed(() => route.path === '/disputes')

// Every verdict waiting to be announced, or none while another notice shows
const waiting = computed(() => {
  if (onDisputesPage.value || handoffs.toasts.length) return []
  return disputes.toasts
})
const toast = computed(() => waiting.value[0] || null)
const several = computed(() => waiting.value.length > 1)

let timer = null
onMounted(() => {
  disputes.load()
  timer = setInterval(() => disputes.load(), CHECK_EVERY_MS)
})
onBeforeUnmount(() => clearInterval(timer))

// A page change is a good moment to check (and refreshes the menu's count)
watch(
  () => route.path,
  (path, before) => {
    if (before !== undefined) disputes.load()
  },
)

function open() {
  const current = toast.value
  const query = several.value ? {} : { verdict: current.disputeId }
  disputes.dismissAllToasts()
  router.push({ path: '/disputes', query })
}
</script>

<template>
  <SlideToast
    :key="toast ? toast.id : 'none'"
    :show="Boolean(toast)"
    place="top"
    :action="several ? 'See verdicts' : 'See verdict'"
    @action="open"
    @close="disputes.dismissAllToasts()"
  >
    <template v-if="several">An admin decided {{ waiting.length }} of your disputes</template>
    <template v-else-if="toast">
      An admin decided the dispute about {{ toast.title || 'your item' }}
    </template>
  </SlideToast>
</template>
