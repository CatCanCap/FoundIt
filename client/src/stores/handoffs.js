// Your handoffs (WS5), shared by the header's Handoffs badge, the "Your
// handoffs" page and the chat page, so they always agree. The rows come from
// GET /api/claims/mine. Which messages you have seen, and which claims have
// popped up, are kept in this browser only (see utils/handoff.js).
// The rows are checked when the app opens, on every page change and every 15
// seconds (HandoffNotifier.vue). Every check asks the server, so nothing old is
// shown, but checks made at the same moment (the badge and the Handoffs page
// when it opens) share one request. Pass { fresh: true } after a change, such
// as a step in the handoff, to start a new request even while one is on its
// way. The MATCHES
// badge comes from the matches store (stores/matches.js), which the header
// loads itself.
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import api from '../api'
import { useAuthStore } from './auth'
import {
  attentionCount,
  hasNewMessage,
  isFreshClaim,
  readAnnounced,
  readSeen,
  writeAnnounced,
  writeSeen,
} from '../utils/handoff'

export const useHandoffsStore = defineStore('handoffs', () => {
  const auth = useAuthStore()
  const userId = computed(() => auth.user?.id ?? null)
  const rows = ref([])
  const loaded = ref(false)
  const seen = ref({})
  // Notices waiting to slide in: [{ id, kind, matchId, title }]
  //   kind  'message' (a new chat message) or 'claim' (someone claimed your find)
  const toasts = ref([])
  let lastKnown = null
  let announced = null
  // The request on its way, when there is one, and whose rows it asks for
  let pending = null
  let pendingFor = null

  // A new person (logging out, or someone else logging in on a shared
  // computer) starts clean: none of the last person's rows, notices or marks
  watch(
    userId,
    (id) => {
      rows.value = []
      loaded.value = false
      toasts.value = []
      lastKnown = null
      pending = null
      pendingFor = null
      seen.value = readSeen(id)
      announced = readAnnounced(id)
    },
    { immediate: true },
  )

  function addToast(kind, row, stamp) {
    toasts.value = [
      ...toasts.value,
      {
        id: `${kind}-${row.matchId}-${stamp}`,
        kind,
        matchId: row.matchId,
        title: row.foundItem?.title || 'your item',
      },
    ]
  }

  // The finder hears about each new claim on their finds once, like a message.
  // The very first check in this browser only remembers what is already there.
  function noticeNewClaims(next) {
    const firstEver = announced === null
    const known = announced || new Set()
    for (const row of next) {
      if (!isFreshClaim(row) || known.has(row.matchId)) continue
      if (!firstEver) addToast('claim', row, row.claimedAt)
      known.add(row.matchId)
    }
    announced = known
    writeAnnounced(userId.value, known)
  }

  const count = computed(() => attentionCount(rows.value, seen.value))

  // A notice for each chat whose newest message arrived since the last check
  // and is not seen yet. The first check in a session only sets the baseline.
  function noticeNewMessages(next) {
    const before = lastKnown
    lastKnown = new Map(next.map((row) => [row.matchId, row.lastMessage?.sentAt || '']))
    if (!before) return
    for (const row of next) {
      const sentAt = row.lastMessage?.sentAt || ''
      if (sentAt && sentAt !== before.get(row.matchId) && hasNewMessage(row, seen.value)) {
        addToast('message', row, sentAt)
      }
    }
  }

  function dismissToast(id) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  // Closing the notice closes it for everything it stood for
  function dismissAllToasts() {
    toasts.value = []
  }

  // Only a student the app knows is logged in has handoffs. A saved token alone
  // is not enough: when the server could not be reached at start-up, the token
  // is kept but nobody is logged in (the login page shows), and asking with it
  // would pop up the last person's messages there.
  function canHaveHandoffs() {
    return auth.isLoggedIn && userId.value !== null && !auth.isAdmin
  }

  // The rows, for the Handoffs page: shares a request already on its way, and
  // throws the API error so the page can show it.
  async function fetchRows({ fresh = false } = {}) {
    if (!canHaveHandoffs()) {
      rows.value = []
      return rows.value
    }
    const askedFor = userId.value
    // Someone else asked a moment ago: wait for the same answer
    if (pending && pendingFor === askedFor && !fresh) return pending
    const request = api.get('/claims/mine').then(({ data }) => {
      // The person changed while this was on its way: not theirs to show
      if (userId.value !== askedFor) return rows.value
      noticeNewClaims(data)
      noticeNewMessages(data)
      rows.value = data
      loaded.value = true
      return data
    })
    pending = request
    pendingFor = askedFor
    try {
      return await request
    } finally {
      if (pending === request) pending = null
    }
  }

  // The same, but quiet, for the badge and the pop-ups: returns true when it
  // worked, and a failure keeps the last rows
  async function load(options) {
    if (!canHaveHandoffs()) {
      rows.value = []
      return false
    }
    try {
      await fetchRows(options)
      return true
    } catch {
      return false
    }
  }

  // The chat page calls this with the newest message it has shown
  function markSeen(matchId, sentAt) {
    if (!sentAt) return
    const current = seen.value[matchId]
    if (current && current >= sentAt) return
    seen.value = { ...seen.value, [matchId]: sentAt }
    writeSeen(userId.value, seen.value)
  }

  return {
    rows,
    loaded,
    seen,
    count,
    toasts,
    fetchRows,
    load,
    markSeen,
    dismissToast,
    dismissAllToasts,
  }
})
