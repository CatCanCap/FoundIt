// Your appeal against a suspension (feature 5), shared by the suspended banner
// and the /appeal page so they always agree. The data comes from
// GET /api/appeals/mine: { suspension, appeal, canAppeal }.
//
// After an appeal is accepted the account is no longer suspended, so the
// banner would vanish without a word. This browser remembers that an appeal
// is waiting, so the banner can say once that it was accepted.
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import api from '../api'
import { useAuthStore } from './auth'

const WAITING_KEY = 'foundit_appeal_waiting'
const SEEN_KEY = 'foundit_appeal_seen'

function read(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, String(value))
  } catch {
    // Private windows can refuse storage; the notice just shows again
  }
}

export const useAppealStore = defineStore('appeal', () => {
  const auth = useAuthStore()
  const mine = ref(null)
  const seen = ref(read(SEEN_KEY))
  let loadedFor = null

  // Someone else signing in on this browser starts from nothing
  watch(
    () => auth.user?.id ?? null,
    (id) => {
      if (id !== loadedFor) {
        mine.value = null
        loadedFor = null
      }
    },
  )

  async function load({ force = false } = {}) {
    const id = auth.user?.id ?? null
    if (!id) return null
    if (!force && loadedFor === id && mine.value) return mine.value
    mine.value = (await api.get('/appeals/mine')).data
    loadedFor = id
    return mine.value
  }

  // { message, proofUrl? }
  async function send(fields) {
    const appeal = (await api.post('/appeals', fields)).data
    mine.value = { ...mine.value, appeal, canAppeal: false }
    write(WAITING_KEY, appeal.id)
    return appeal
  }

  const hasWaiting = () => Boolean(read(WAITING_KEY))

  // Accepted, the account is active again, and the notice not yet closed
  const acceptedUnseen = computed(() => {
    const appeal = mine.value?.appeal
    return (
      Boolean(appeal) &&
      appeal.status === 'accepted' &&
      !auth.isSuspended &&
      String(seen.value) !== String(appeal.id)
    )
  })

  function closeAccepted() {
    const id = mine.value?.appeal?.id
    if (id) {
      write(SEEN_KEY, id)
      seen.value = String(id)
    }
    write(WAITING_KEY, null)
  }

  return { mine, load, send, hasWaiting, acceptedUnseen, closeAccepted }
})
