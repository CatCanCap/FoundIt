// Your disputes' verdicts (feature 5), shared by the count in the account
// menu, the My disputes page and the "An admin decided" notice
// (components/safeguards/DisputeNotifier.vue), so they always agree. The rows
// come from GET /api/disputes/mine and GET /api/disputes/on-my-claims. Which
// verdicts you have opened, and which have popped up, are kept in this browser
// only (see utils/safeguards.js), like the handoffs' new messages.
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import api from '../api'
import { useAuthStore } from './auth'
import { readVerdictMarks, verdictsOf, writeVerdictMarks } from '../utils/safeguards'

export const useDisputesStore = defineStore('disputes', () => {
  const auth = useAuthStore()
  const raised = ref([])
  const onMyClaims = ref([])
  const read = ref(new Set())
  // Notices waiting to slide in: [{ id, disputeId, title }]
  const toasts = ref([])
  let announced = new Set()

  const userId = computed(() => auth.user?.id ?? null)

  // Everything here belongs to one account. When someone logs out, or someone
  // else logs in on the same browser, drop the last person's disputes and
  // notices straight away ('sync') and load the new person's marks, which are
  // saved under their own user id.
  watch(
    userId,
    (id) => {
      raised.value = []
      onMyClaims.value = []
      toasts.value = []
      const marks = id === null ? { read: [], announced: [] } : readVerdictMarks(id)
      read.value = new Set(marks.read)
      announced = new Set(marks.announced)
    },
    { immediate: true, flush: 'sync' },
  )

  function saveMarks() {
    if (userId.value === null) return
    writeVerdictMarks(userId.value, { read: [...read.value], announced: [...announced] })
  }

  const verdicts = computed(() => verdictsOf(raised.value, onMyClaims.value))
  const unreadCount = computed(
    () => verdicts.value.filter((dispute) => !read.value.has(dispute.id)).length,
  )

  function isUnread(dispute) {
    return (
      verdicts.value.some((verdict) => verdict.id === dispute.id) && !read.value.has(dispute.id)
    )
  }

  // Each verdict you have not opened pops up once, even if it came in while you
  // were away. The rows carry their item's title, so all the notices are added
  // at once (adding them one by one as each title was fetched let a notice
  // closed in the meantime come straight back with the next verdict).
  function announceNew() {
    const fresh = verdicts.value.filter(
      (dispute) => !read.value.has(dispute.id) && !announced.has(dispute.id),
    )
    if (!fresh.length) return
    for (const dispute of fresh) announced.add(dispute.id)
    saveMarks()
    toasts.value = [
      ...toasts.value,
      ...fresh.map((dispute) => ({
        id: `verdict-${dispute.id}`,
        disputeId: dispute.id,
        title: dispute.item?.title || '',
      })),
    ]
  }

  // Loads the rows; only students who are logged in have disputes.
  // Returns true when it worked. A failure keeps the last rows.
  async function load() {
    if (!auth.isLoggedIn || auth.isAdmin) {
      raised.value = []
      onMyClaims.value = []
      return false
    }
    const askedFor = userId.value
    try {
      const [mine, claims] = await Promise.all([
        api.get('/disputes/mine'),
        api.get('/disputes/on-my-claims'),
      ])
      // Someone else signed in while the answer was on its way: drop it
      if (userId.value !== askedFor) return false
      raised.value = mine.data
      onMyClaims.value = claims.data
      announceNew()
      return true
    } catch {
      return false
    }
  }

  // The My disputes page calls this when a verdict is opened
  function markRead(disputeId) {
    toasts.value = toasts.value.filter((toast) => toast.disputeId !== disputeId)
    if (read.value.has(disputeId)) return
    read.value = new Set([...read.value, disputeId])
    announced.add(disputeId)
    saveMarks()
  }

  function dismissToast(id) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  // Closing the notice closes it for every verdict it stood for
  function dismissAllToasts() {
    toasts.value = []
  }

  return {
    raised,
    onMyClaims,
    verdicts,
    unreadCount,
    toasts,
    isUnread,
    load,
    markRead,
    dismissToast,
    dismissAllToasts,
  }
})
