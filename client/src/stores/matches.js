// Your lost reports and the finds that might be them (WS3), shared by the
// header's MATCHES badge on every page and the Matches pages, so the number is
// the same wherever you look. The reports come from GET /api/matches/mine.
//
//   load()               loads the reports; throws the API error, for the pages
//   refresh()            the same, but quiet: a failure keeps the last reports.
//                        The header calls it when a page opens and every 30 seconds
//   closeReport(itemId)  "I found it myself": PATCH /api/items/:id { status: 'resolved' }
//   rejectMatch(matchId) "Not mine": POST /api/matches/:id/reject
//   count                finds still waiting for an answer that you haven't seen
//                        yet, for the badge (see unseenCount in utils/matches.js)
//   markSeen(ids)        remembers those finds as seen, so the badge counts down
//   hidden, hideDeclined(matchId)  declined claims the owner chose to hide
//
// What you've seen and hidden is kept in this browser per account, so on a
// shared lab PC the next student starts fresh. Signing out or in as someone
// else empties the reports and switches to that account's lists.
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import api from '../api'
import { useAuthStore } from './auth'
import {
  readHiddenDeclined,
  readSeenMatches,
  unseenCount,
  writeHiddenDeclined,
  writeSeenMatches,
} from '../utils/matches'

export const useMatchesStore = defineStore('matches', () => {
  const auth = useAuthStore()
  const reports = ref([])
  const seen = ref(new Set())
  const hidden = ref(new Set())

  const userId = computed(() => auth.user?.id ?? null)

  watch(
    userId,
    (id) => {
      reports.value = []
      seen.value = readSeenMatches(id)
      hidden.value = readHiddenDeclined(id)
    },
    { immediate: true },
  )

  const count = computed(() => unseenCount(reports.value, seen.value))

  // Only a logged-in student has lost reports; admins never see Matches
  function canHaveMatches() {
    return auth.isLoggedIn && Boolean(auth.user) && !auth.isAdmin
  }

  async function load() {
    if (!canHaveMatches()) {
      reports.value = []
      return
    }
    const askedFor = userId.value
    const { data } = await api.get('/matches/mine')
    // Someone else signed in while the answer was on its way: drop it
    if (userId.value === askedFor) reports.value = data.reports
  }

  async function refresh() {
    try {
      await load()
      return true
    } catch {
      // No badge change is better than an error on a page about something else
      return false
    }
  }

  async function closeReport(itemId) {
    await api.patch(`/items/${itemId}`, { status: 'resolved' })
    reports.value = reports.value.filter((report) => report.item.id !== itemId)
  }

  async function rejectMatch(matchId) {
    await api.post(`/matches/${matchId}/reject`)
    reports.value = reports.value.map((report) => ({
      ...report,
      matches: report.matches.filter((match) => match.id !== matchId),
    }))
  }

  function markSeen(matchIds) {
    const fresh = matchIds.filter((id) => !seen.value.has(id))
    if (fresh.length === 0) return
    seen.value = new Set([...seen.value, ...fresh])
    writeSeenMatches(userId.value, seen.value)
  }

  function hideDeclined(matchId) {
    hidden.value = new Set([...hidden.value, matchId])
    writeHiddenDeclined(userId.value, hidden.value)
  }

  return {
    reports,
    seen,
    hidden,
    count,
    load,
    refresh,
    closeReport,
    rejectMatch,
    markSeen,
    hideDeclined,
  }
})
