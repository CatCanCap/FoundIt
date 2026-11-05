<script setup>
// Handoff alerts for the whole app (WS5), mounted once in App.vue so they show
// on every page, with or without the header. It checks your handoffs
// (stores/handoffs.js) when the app opens, on every page change and every 15
// seconds. Two kinds slide in under the header and hide after a few seconds:
//   a new chat message   "New message about Navy Hydro Flask"   Open chat
//   a claim on your find "Someone claimed your Navy Hydro Flask" Check the claim
// A claim pops up once, even if it came in while the finder was away.
//
// Never for the chat you are in: you are already reading it, so any alert for
// that chat is dropped. The same check also keeps the header's Handoffs badge
// up to date.
//
// News about several chats at once shares one notice ("New messages in 3
// chats", which opens Returns), and closing it closes it for all of them, so
// it never comes straight back with the next one.
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SlideToast from './SlideToast.vue'
import { useHandoffsStore } from '@/stores/handoffs'

const CHECK_EVERY_MS = 15000

const handoffs = useHandoffsStore()
const route = useRoute()
const router = useRouter()

// The chat page open now, if any: /matches/12/handoff or /matches/12
const openChatId = computed(() => {
  const found = /^\/matches\/(\d+)(\/handoff)?$/.exec(route.path)
  return found ? Number(found[1]) : null
})

// Drop alerts for the chat you are in, now and whenever new ones arrive
watch(
  () => [openChatId.value, handoffs.toasts.length],
  () => {
    for (const toast of handoffs.toasts) {
      if (toast.matchId === openChatId.value) handoffs.dismissToast(toast.id)
    }
  },
  { immediate: true },
)

// Everything waiting to be announced (none for the chat you are in)
const waiting = computed(() =>
  handoffs.toasts.filter((entry) => entry.matchId !== openChatId.value),
)
// The newest one stands for its chat when it is the only chat
const toast = computed(() => waiting.value.at(-1) || null)
const chats = computed(() => new Set(waiting.value.map((entry) => entry.matchId)).size)
const several = computed(() => chats.value > 1)
const allClaims = computed(() => waiting.value.every((entry) => entry.kind === 'claim'))
const allMessages = computed(() => waiting.value.every((entry) => entry.kind === 'message'))
const actionWords = computed(() => {
  if (several.value) return 'See returns'
  return toast.value?.kind === 'claim' ? 'Check the claim' : 'Open chat'
})

let timer = null
onMounted(() => {
  handoffs.load()
  timer = setInterval(() => handoffs.load(), CHECK_EVERY_MS)
})
onBeforeUnmount(() => clearInterval(timer))

// A page change is a good moment to check (and refreshes the badge)
watch(
  () => route.path,
  (path, before) => {
    if (before !== undefined) handoffs.load()
  },
)

function open() {
  const current = toast.value
  const path = several.value ? '/returns' : `/matches/${current.matchId}/handoff`
  handoffs.dismissAllToasts()
  router.push(path)
}
</script>

<template>
  <SlideToast
    :key="waiting.length ? waiting[0].id : 'none'"
    :show="Boolean(toast)"
    place="top"
    :action="actionWords"
    @action="open"
    @close="handoffs.dismissAllToasts()"
  >
    <template v-if="several && allClaims">{{ chats }} new claims on your finds</template>
    <template v-else-if="several && allMessages">New messages in {{ chats }} chats</template>
    <template v-else-if="several">News in {{ chats }} of your returns</template>
    <template v-else-if="toast && toast.kind === 'claim'">
      Someone claimed your {{ toast.title }}
    </template>
    <template v-else-if="toast">New message about {{ toast.title }}</template>
  </SlideToast>
</template>
